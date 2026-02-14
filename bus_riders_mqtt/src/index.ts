import { EventEmitter } from "events";
import http from "http";
import Redis from "ioredis";
import dotenv from "dotenv";
import mqtt from "mqtt";
import jwt from "jsonwebtoken";
import { createNeighborService } from "./utils/neighborService";
import { createRealtimePublisher } from "./utils/realtimePublisher";
import { createRouteProjectionService } from "./utils/routeProjection";
import type { MessageMeta, NormalizedEvent } from "./types";
import {
  createStateService,
  ROUTE_ORDERING_INDEX_KEY,
} from "./utils/stateService";
import { createGpsHandler } from "./utils/gpsHandler";
import { parseGpsTopic } from "./utils/topic";
import { toBuffer } from "./utils/buffer";
import { classifyRejectReason, logRejectedMessage } from "./utils/rejects";
import { createStaleBusSweeper } from "./utils/staleBusSweep";

dotenv.config();

const mqttHost = process.env.MQTT_HOST ?? "127.0.0.1";
const mqttPort = Number.parseInt(process.env.MQTT_PORT ?? "1883", 10);
const mqttBrokerUrl =
  process.env.MQTT_BROKER_URL ?? `mqtt://${mqttHost}:${mqttPort}`;
const mqttClientId = process.env.MQTT_CLIENT_ID ?? "bus_riders_mqtt_ingestion";
const mqttUsername = process.env.MQTT_USERNAME;
const mqttPassword = process.env.MQTT_PASSWORD;
const mqttJwtSecret = process.env.MQTT_JWT_SECRET;
const mqttJwtAudience = process.env.MQTT_JWT_AUDIENCE;
const mqttJwtExpiresInSeconds = Number.parseInt(
  process.env.MQTT_JWT_EXP_SECONDS ?? "86400",
  10,
);
const mqttSubscribeTopic = process.env.MQTT_SUBSCRIBE_TOPIC ?? "gps/+/+/+";
const mqttSubscribeQosRaw = Number.parseInt(
  process.env.MQTT_SUBSCRIBE_QOS ?? "0",
  10,
);
type MqttQos = 0 | 1 | 2;

const mqttSubscribeQos: MqttQos =
  mqttSubscribeQosRaw === 1 || mqttSubscribeQosRaw === 2
    ? mqttSubscribeQosRaw
    : 0;
const mqttKeepalive = Number.parseInt(process.env.MQTT_KEEPALIVE ?? "60", 10);
const mqttReconnectPeriodMs = Number.parseInt(
  process.env.MQTT_RECONNECT_PERIOD_MS ?? "1000",
  10,
);

const keydbUrl = process.env.KEYDB_URL ?? "redis://192.168.1.155:6379";
const keydbClientName = process.env.KEYDB_CLIENT_NAME ?? "bus_riders_mqtt";
const messageHistoryLimit = Number.parseInt(
  process.env.KEYDB_MESSAGE_HISTORY ?? "200",
  10,
);
const messageTtlSeconds = Number.parseInt(
  process.env.KEYDB_MESSAGE_TTL_SECONDS ?? "0",
  10,
);
const busStateTtlSeconds = Number.parseInt(
  process.env.BUS_STATE_TTL_SECONDS ?? "15",
  10,
);
const routeCacheTtlMs = Number.parseInt(
  process.env.ROUTE_CACHE_TTL_MS ?? "300000",
  10,
);
const offTrackDistanceThresholdMeters = Number.parseFloat(
  process.env.OFFTRACK_DISTANCE_THRESHOLD_METERS ?? "50",
);
const offTrackRecoveryThresholdMeters = Number.parseFloat(
  process.env.OFFTRACK_RECOVERY_THRESHOLD_METERS ?? "35",
);
const arrivalProgressThreshold = Number.parseFloat(
  process.env.ARRIVAL_PROGRESS_THRESHOLD ?? "0.97",
);
const arrivalDwellMs = Number.parseInt(
  process.env.ARRIVAL_DWELL_MS ?? "10000",
  10,
);
const arrivalMaxSpeedKmh = Number.parseFloat(
  process.env.ARRIVAL_MAX_SPEED_KMH ?? "8",
);
const arrivalResetProgressThreshold = Number.parseFloat(
  process.env.ARRIVAL_RESET_PROGRESS_THRESHOLD ?? "0.2",
);
const arrivalExitGraceMs = Number.parseInt(
  process.env.ARRIVAL_EXIT_GRACE_MS ?? "10000",
  10,
);
const staleTimestampMaxAgeMs = Number.parseInt(
  process.env.STALE_TIMESTAMP_MAX_AGE_MS ?? "30000",
  10,
);
const staleTimestampMaxFutureDriftMs = Number.parseInt(
  process.env.STALE_TIMESTAMP_MAX_FUTURE_DRIFT_MS ?? "5000",
  10,
);
const staleBusSweepMs = Number.parseInt(
  process.env.STALE_BUS_SWEEP_MS ?? "30000",
  10,
);
const staleBusSweepBatchSize = Number.parseInt(
  process.env.STALE_BUS_SWEEP_BATCH_SIZE ?? "200",
  10,
);
const staleBusSweepSeedScanCount = Number.parseInt(
  process.env.STALE_BUS_SWEEP_SEED_SCAN_COUNT ?? "500",
  10,
);
const staleBusSweepSeedFromScan =
  (process.env.STALE_BUS_SWEEP_SEED_SCAN ?? "true").toLowerCase() !== "false";
const mqttHealthHost = process.env.MQTT_HEALTH_HOST ?? "0.0.0.0";
const mqttHealthPort = Number.parseInt(
  process.env.MQTT_HEALTH_PORT ?? "8082",
  10,
);
const resolvedMqttUsername = mqttUsername || mqttClientId;

function buildServiceJwtToken(): string | null {
  if (!mqttJwtSecret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expirationOffset = Number.isFinite(mqttJwtExpiresInSeconds)
    ? Math.max(60, mqttJwtExpiresInSeconds)
    : 86400;

  const payload = {
    sub: mqttClientId,
    username: resolvedMqttUsername,
    clientid: mqttClientId,
    role: "mqtt_service",
    iat: now,
    exp: now + expirationOffset,
    acl: {
      pub: [],
      sub: [mqttSubscribeTopic],
    },
  };

  const options = mqttJwtAudience ? { audience: mqttJwtAudience } : undefined;
  return jwt.sign(payload, mqttJwtSecret, options);
}

const resolvedMqttPassword =
  mqttPassword || buildServiceJwtToken() || undefined;

const keydb = new Redis(keydbUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
keydb.on("error", (error) => {
  console.error("[keydb] error", error);
});

keydb
  .client("SETNAME", keydbClientName)
  .catch((error) => console.warn("[keydb] failed to set client name", error));

const eventBus = new EventEmitter();
const allowedDirections = new Set(["FORWARD", "BACKWARD"]);
const gpsTopicPrefix = "gps";
let mqttConnected = false;
let mqttSubscriptionActive = false;
let lastMqttConnectedAt: number | null = null;
let lastMqttSubscribedAt: number | null = null;

const { projectToRoute, getRouteLengthMeters } = createRouteProjectionService({
  keydb,
  routeCacheTtlMs,
});

const { storeMessage, updateBusState } = createStateService({
  keydb,
  messageHistoryLimit,
  messageTtlSeconds,
  busStateTtlSeconds,
  routeCacheTtlMs,
  statusRules: {
    offTrackDistanceThresholdMeters: Number.isFinite(
      offTrackDistanceThresholdMeters,
    )
      ? offTrackDistanceThresholdMeters
      : 50,
    offTrackRecoveryThresholdMeters: Number.isFinite(
      offTrackRecoveryThresholdMeters,
    )
      ? offTrackRecoveryThresholdMeters
      : 35,
    arrivalProgressThreshold: Number.isFinite(arrivalProgressThreshold)
      ? arrivalProgressThreshold
      : 0.97,
    arrivalDwellMs:
      Number.isFinite(arrivalDwellMs) && arrivalDwellMs > 0
        ? arrivalDwellMs
        : 10000,
    arrivalMaxSpeedKmh: Number.isFinite(arrivalMaxSpeedKmh)
      ? arrivalMaxSpeedKmh
      : 8,
    arrivalResetProgressThreshold: Number.isFinite(
      arrivalResetProgressThreshold,
    )
      ? arrivalResetProgressThreshold
      : 0.2,
    arrivalExitGraceMs:
      Number.isFinite(arrivalExitGraceMs) && arrivalExitGraceMs >= 0
        ? arrivalExitGraceMs
        : 10000,
  },
});

const { findNeighbors, buildNeighborDetails } = createNeighborService({
  keydb,
  getRouteLengthMeters,
});

const { pushRealtimeUpdate } = createRealtimePublisher({
  keydb,
  findNeighbors,
  buildNeighborDetails,
});

const staleBusSweeper = createStaleBusSweeper({
  keydb,
  indexKey: ROUTE_ORDERING_INDEX_KEY,
  intervalMs:
    Number.isFinite(staleBusSweepMs) && staleBusSweepMs > 0
      ? staleBusSweepMs
      : 0,
  memberBatchSize:
    Number.isFinite(staleBusSweepBatchSize) && staleBusSweepBatchSize > 0
      ? staleBusSweepBatchSize
      : 200,
  seedScanCount:
    Number.isFinite(staleBusSweepSeedScanCount) &&
    staleBusSweepSeedScanCount > 0
      ? staleBusSweepSeedScanCount
      : 500,
  seedFromScan: staleBusSweepSeedFromScan,
});

const handleGpsMessage = createGpsHandler({
  projectToRoute,
  storeMessage,
  onEvent: (event) => {
    eventBus.emit("normalized", event);
  },
  validationRules: {
    maxAgeMs:
      Number.isFinite(staleTimestampMaxAgeMs) && staleTimestampMaxAgeMs > 0
        ? staleTimestampMaxAgeMs
        : 0,
    maxFutureDriftMs:
      Number.isFinite(staleTimestampMaxFutureDriftMs) &&
      staleTimestampMaxFutureDriftMs >= 0
        ? staleTimestampMaxFutureDriftMs
        : 5000,
  },
});

eventBus.on("normalized", (event: NormalizedEvent) => {
  void (async () => {
    const enrichedEvent = await updateBusState(event);
    await pushRealtimeUpdate(enrichedEvent);
  })().catch((error) => {
    console.warn("[realtime] failed to process normalized event", {
      busId: event.busId,
      routeId: event.routeId,
      direction: event.direction,
      error,
    });
  });
});

const mqttClient = mqtt.connect(mqttBrokerUrl, {
  clientId: mqttClientId,
  username: resolvedMqttUsername,
  password: resolvedMqttPassword,
  keepalive: mqttKeepalive,
  reconnectPeriod: mqttReconnectPeriodMs,
});

mqttClient.on("connect", () => {
  mqttConnected = true;
  lastMqttConnectedAt = Date.now();
  console.log("[mqtt] connected", {
    broker: mqttBrokerUrl,
    hasPassword: Boolean(resolvedMqttPassword),
    authMode: mqttPassword ? "static_password" : mqttJwtSecret ? "jwt" : "none",
  });
  mqttClient.subscribe(
    mqttSubscribeTopic,
    { qos: mqttSubscribeQos },
    (error) => {
      if (error) {
        mqttSubscriptionActive = false;
        console.warn("[mqtt] subscribe failed", error);
        return;
      }
      mqttSubscriptionActive = true;
      lastMqttSubscribedAt = Date.now();
      console.log("[mqtt] subscribed", {
        topic: mqttSubscribeTopic,
        qos: mqttSubscribeQos,
      });
    },
  );
});

mqttClient.on("message", (topic, payload, packet) => {
  const parsedTopic = parseGpsTopic(topic, {
    allowedDirections,
    prefix: gpsTopicPrefix,
  });
  if (!parsedTopic) {
    logRejectedMessage("invalid_topic", {
      topic,
      message: "Topic must match gps/{routeId}/{direction}/{busId}",
    });
    return;
  }

  const payloadBuffer = toBuffer(payload);
  const meta: MessageMeta = {
    qos: packet.qos,
    retain: packet.retain,
    dup: packet.dup,
  };

  void handleGpsMessage(parsedTopic, topic, payloadBuffer, meta).catch(
    (error) => {
      const reason = classifyRejectReason(error);
      logRejectedMessage(reason, {
        busId: parsedTopic.busId,
        routeId: parsedTopic.routeId,
        direction: parsedTopic.direction,
        topic,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  );
});

mqttClient.on("reconnect", () => {
  mqttSubscriptionActive = false;
  console.log("[mqtt] reconnecting");
});

mqttClient.on("close", () => {
  mqttConnected = false;
  mqttSubscriptionActive = false;
  console.log("[mqtt] connection closed");
});

mqttClient.on("error", (error) => {
  console.warn("[mqtt] error", error);
});

mqttClient.on("offline", () => {
  mqttConnected = false;
  mqttSubscriptionActive = false;
  console.warn("[mqtt] offline");
});

type KeydbCheckResult = {
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
};

function jsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function checkKeydbPing(): Promise<KeydbCheckResult> {
  const startedAt = Date.now();
  try {
    await keydb.ping();
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkKeydbReadyRoundTrip(): Promise<KeydbCheckResult> {
  const startedAt = Date.now();
  const probeKey = `mqtt:ready:probe:${mqttClientId}`;
  const probeValue = String(Date.now());

  try {
    await keydb.set(probeKey, probeValue, "EX", 10);
    const readValue = await keydb.get(probeKey);
    await keydb.del(probeKey);

    if (readValue !== probeValue) {
      throw new Error("KeyDB read/write probe mismatch");
    }

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const healthServer = http.createServer((req, res) => {
  if (!req.url || req.method !== "GET") {
    jsonResponse(res, 404, { error: "NOT_FOUND" });
    return;
  }

  const url = new URL(req.url, "http://192.168.1.155");
  if (url.pathname === "/health") {
    void (async () => {
      const keydbStatus = await checkKeydbPing();
      const sweeperStats = staleBusSweeper.getStats();
      jsonResponse(res, 200, {
        status: "ok",
        service: "bus_riders_mqtt",
        mqtt: {
          connected: mqttConnected,
          subscribed: mqttSubscriptionActive,
          topic: mqttSubscribeTopic,
          lastConnectedAt: lastMqttConnectedAt,
          lastSubscribedAt: lastMqttSubscribedAt,
        },
        keydb: keydbStatus,
        staleSweep: sweeperStats,
        timestamp: Date.now(),
      });
    })().catch((error) => {
      jsonResponse(res, 500, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if (url.pathname === "/ready") {
    void (async () => {
      const keydbReady = await checkKeydbReadyRoundTrip();
      const ready = mqttConnected && mqttSubscriptionActive && keydbReady.ok;
      jsonResponse(res, ready ? 200 : 503, {
        status: ready ? "ready" : "not_ready",
        checks: {
          mqttConnected,
          mqttSubscribed: mqttSubscriptionActive,
          keydbReadWrite: keydbReady,
        },
        timestamp: Date.now(),
      });
    })().catch((error) => {
      jsonResponse(res, 503, {
        status: "not_ready",
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  jsonResponse(res, 404, { error: "NOT_FOUND" });
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[mqtt] shutting down (${signal})`);

  await new Promise<void>((resolve) => {
    mqttClient.end(true, {}, () => resolve());
  });

  await staleBusSweeper.stop();
  await new Promise<void>((resolve) => {
    healthServer.close(() => resolve());
  });

  try {
    await keydb.quit();
  } catch (error) {
    console.warn("[keydb] quit failed, disconnecting", error);
    keydb.disconnect();
  }

  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void keydb.ping().then(
  () => {
    console.log("[keydb] connected");
  },
  (error) => {
    console.warn("[keydb] ping failed", error);
  },
);

void staleBusSweeper.start().catch((error) => {
  console.warn("[stale-sweep] failed to start", { error });
});

healthServer.listen(mqttHealthPort, mqttHealthHost, () => {
  console.log(
    `[health] server listening on ${mqttHealthHost}:${mqttHealthPort}`,
  );
});
