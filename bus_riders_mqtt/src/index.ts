import { EventEmitter } from "events";
import Redis from "ioredis";
import dotenv from "dotenv";
import mqtt from "mqtt";
import { createNeighborService } from "./utils/neighborService";
import { createRealtimePublisher } from "./utils/realtimePublisher";
import { createRouteProjectionService } from "./utils/routeProjection";
import type { MessageMeta, NormalizedEvent } from "./types";
import { createStateService } from "./utils/stateService";
import { createGpsHandler } from "./utils/gpsHandler";
import { parseGpsTopic } from "./utils/topic";
import { toBuffer } from "./utils/buffer";

dotenv.config();

const mqttHost = process.env.MQTT_HOST ?? "127.0.0.1";
const mqttPort = Number.parseInt(process.env.MQTT_PORT ?? "1883", 10);
const mqttBrokerUrl =
  process.env.MQTT_BROKER_URL ?? `mqtt://${mqttHost}:${mqttPort}`;
const mqttClientId = process.env.MQTT_CLIENT_ID ?? "bus_riders_mqtt_ingestion";
const mqttUsername = process.env.MQTT_USERNAME;
const mqttPassword = process.env.MQTT_PASSWORD;
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

const keydbUrl = process.env.KEYDB_URL ?? "redis://localhost:6379";
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

const { projectToRoute, getRouteLengthMeters } = createRouteProjectionService({
  keydb,
  routeCacheTtlMs,
});

const { storeMessage, updateBusState } = createStateService({
  keydb,
  messageHistoryLimit,
  messageTtlSeconds,
  busStateTtlSeconds,
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

const handleGpsMessage = createGpsHandler({
  projectToRoute,
  storeMessage,
  onEvent: (event) => {
    eventBus.emit("normalized", event);
  },
});

eventBus.on("normalized", (event: NormalizedEvent) => {
  void updateBusState(event).catch((error) => {
    console.warn("[keydb] failed to update bus state", error);
  });

  void pushRealtimeUpdate(event).catch((error) => {
    console.warn("[realtime] failed to push update", error);
  });
});

const mqttClient = mqtt.connect(mqttBrokerUrl, {
  clientId: mqttClientId,
  username: mqttUsername,
  password: mqttPassword,
  keepalive: mqttKeepalive,
  reconnectPeriod: mqttReconnectPeriodMs,
});

mqttClient.on("connect", () => {
  console.log("[mqtt] connected", { broker: mqttBrokerUrl });
  mqttClient.subscribe(
    mqttSubscribeTopic,
    { qos: mqttSubscribeQos },
    (error) => {
      if (error) {
        console.warn("[mqtt] subscribe failed", error);
        return;
      }
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
    console.warn("[mqtt] ignored message with invalid topic", { topic });
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
      console.warn("[mqtt] failed to handle gps message", { topic, error });
    },
  );
});

mqttClient.on("reconnect", () => {
  console.log("[mqtt] reconnecting");
});

mqttClient.on("close", () => {
  console.log("[mqtt] connection closed");
});

mqttClient.on("error", (error) => {
  console.warn("[mqtt] error", error);
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[mqtt] shutting down (${signal})`);

  await new Promise<void>((resolve) => {
    mqttClient.end(true, {}, () => resolve());
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
