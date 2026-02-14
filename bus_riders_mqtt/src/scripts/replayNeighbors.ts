import dotenv from "dotenv";
import Redis from "ioredis";
import { createRouteProjectionService } from "../utils/routeProjection";
import {
  createStateService,
  ROUTE_ORDERING_INDEX_KEY,
} from "../utils/stateService";
import { createNeighborService } from "../utils/neighborService";
import { createRealtimePublisher } from "../utils/realtimePublisher";
import type { NormalizedEvent } from "../types";

dotenv.config();

type Point = { lat: number; lng: number };

type NeighborDetail = {
  busId: string;
  distanceMeters: number | null;
  etaSeconds: number | null;
};

type RealtimeRoutePayload = {
  busId: string;
  routeId: string;
  direction: string;
  progress: number;
  speed: number;
  timestamp: number;
  neighbors: {
    ahead: NeighborDetail[];
    behind: NeighborDetail[];
  };
};

const keydbUrl = process.env.KEYDB_URL ?? "redis://192.168.1.155:6379";
const routeId = process.env.REPLAY_ROUTE_ID ?? "REPLAY_NEIGHBOR_ROUTE_01";
const direction = (process.env.REPLAY_DIRECTION ?? "FORWARD").toUpperCase();
const keepKeys =
  (process.env.REPLAY_KEEP_KEYS ?? "false").toLowerCase() === "true";

const busA = process.env.REPLAY_BUS_A ?? "REPLAY_NEIGHBOR_BUS_A";
const busB = process.env.REPLAY_BUS_B ?? "REPLAY_NEIGHBOR_BUS_B";
const busC = process.env.REPLAY_BUS_C ?? "REPLAY_NEIGHBOR_BUS_C";
const busD = process.env.REPLAY_BUS_D ?? "REPLAY_NEIGHBOR_BUS_D";

function assertOrThrow(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

function approxEqual(a: number, b: number, epsilon = 1): boolean {
  return Math.abs(a - b) <= epsilon;
}

function parseRealtimeRoutePayload(raw: string): RealtimeRoutePayload | null {
  try {
    const parsed = JSON.parse(raw) as RealtimeRoutePayload;
    if (
      !parsed ||
      typeof parsed.busId !== "string" ||
      typeof parsed.routeId !== "string" ||
      typeof parsed.direction !== "string" ||
      typeof parsed.progress !== "number" ||
      typeof parsed.speed !== "number" ||
      typeof parsed.timestamp !== "number" ||
      !parsed.neighbors ||
      !Array.isArray(parsed.neighbors.ahead) ||
      !Array.isArray(parsed.neighbors.behind)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const keydb = new Redis(keydbUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  const subscriber = new Redis(keydbUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });

  keydb.on("error", (error) => {
    console.warn("[replay:neighbors] keydb error", error.message);
  });
  subscriber.on("error", (error) => {
    console.warn("[replay:neighbors] subscriber error", error.message);
  });

  const routeKey = `route:${routeId}:${direction}`;
  const shapeKey = `route:shape:${routeId}:${direction}`;
  const routeChannel = `ws:route:${routeId}:${direction}`;
  const busKeys = [busA, busB, busC, busD].map((id) => `bus:${id}`);
  let canCleanup = false;

  const routeStart: Point = { lat: 8.9824, lng: -79.5199 };
  const routeMid: Point = { lat: 8.986, lng: -79.5199 };
  const routeEnd: Point = { lat: 8.9895, lng: -79.5199 };
  const shape: Point[] = [routeStart, routeMid, routeEnd];

  const { projectToRoute, getRouteLengthMeters } = createRouteProjectionService(
    {
      keydb,
      routeCacheTtlMs: 500,
    },
  );

  const { updateBusState } = createStateService({
    keydb,
    messageHistoryLimit: 0,
    messageTtlSeconds: 0,
    busStateTtlSeconds: 180,
    routeCacheTtlMs: 500,
    statusRules: {
      offTrackDistanceThresholdMeters: 50,
      offTrackRecoveryThresholdMeters: 35,
      arrivalProgressThreshold: 0.97,
      arrivalDwellMs: 6000,
      arrivalMaxSpeedKmh: 8,
      arrivalResetProgressThreshold: 0.2,
      arrivalExitGraceMs: 4000,
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

  let timestamp = Date.now();

  async function waitForRoutePayload(
    expectedBusId: string,
    minTimestamp: number,
    timeoutMs = 2500,
  ): Promise<RealtimeRoutePayload> {
    return await new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        subscriber.off("message", onMessage);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timeout waiting route payload for ${expectedBusId} (>= ${minTimestamp})`,
          ),
        );
      }, timeoutMs);

      const onMessage = (channel: string, message: string) => {
        if (channel !== routeChannel) {
          return;
        }

        const payload = parseRealtimeRoutePayload(message);
        if (!payload) {
          return;
        }

        if (payload.busId !== expectedBusId) {
          return;
        }

        if (payload.timestamp < minTimestamp) {
          return;
        }

        cleanup();
        resolve(payload);
      };

      subscriber.on("message", onMessage);
    });
  }

  async function feedBus(
    busId: string,
    progressFraction: number,
    speedKmh: number,
  ): Promise<{ event: NormalizedEvent; payload: RealtimeRoutePayload }> {
    timestamp += 2000;
    const point = lerpPoint(routeStart, routeEnd, progressFraction);
    const projection = await projectToRoute(
      routeId,
      direction,
      point.lat,
      point.lng,
    );

    const event: NormalizedEvent = {
      busId,
      routeId,
      direction,
      lat: point.lat,
      lng: point.lng,
      progress: projection.progress,
      deviationMeters: projection.deviationMeters,
      speed: speedKmh,
      timestamp,
      isOffTrack: false,
      tripStatus: "IN_ROUTE",
      arrivalTimestamp: null,
    };

    const enriched = await updateBusState(event);
    const payloadPromise = waitForRoutePayload(busId, enriched.timestamp);
    await pushRealtimeUpdate(enriched);
    const payload = await payloadPromise;

    console.log(
      `[replay:neighbors] feed bus=${busId} progress=${enriched.progress.toFixed(4)} ahead=${payload.neighbors.ahead.length} behind=${payload.neighbors.behind.length}`,
    );

    return { event: enriched, payload };
  }

  async function validateNeighborDistances(
    payload: RealtimeRoutePayload,
  ): Promise<void> {
    const routeLengthMeters = await getRouteLengthMeters(routeId, direction);
    assertOrThrow(
      routeLengthMeters !== null && routeLengthMeters > 0,
      "Route length is missing for distance validation",
    );

    const allNeighbors = [
      ...payload.neighbors.ahead,
      ...payload.neighbors.behind,
    ];

    for (const neighbor of allNeighbors) {
      const scoreRaw = await keydb.zscore(routeKey, neighbor.busId);
      assertOrThrow(
        Boolean(scoreRaw),
        `Missing ZSET score for ${neighbor.busId}`,
      );
      const progress = Number(scoreRaw);
      assertOrThrow(
        Number.isFinite(progress),
        `Invalid progress score for ${neighbor.busId}`,
      );

      const expectedDistance =
        Math.abs(progress - payload.progress) * (routeLengthMeters as number);
      const expectedEta = Math.round(expectedDistance / (payload.speed / 3.6));

      assertOrThrow(
        neighbor.distanceMeters !== null &&
          approxEqual(neighbor.distanceMeters, expectedDistance, 1),
        `Unexpected distance for ${neighbor.busId}: got=${neighbor.distanceMeters} expected=${expectedDistance}`,
      );
      assertOrThrow(
        neighbor.etaSeconds === expectedEta,
        `Unexpected ETA for ${neighbor.busId}: got=${neighbor.etaSeconds} expected=${expectedEta}`,
      );
    }
  }

  try {
    await keydb.ping();
    await subscriber.ping();
    canCleanup = true;

    await keydb
      .multi()
      .set(shapeKey, JSON.stringify(shape))
      .del(routeKey)
      .del(busKeys[0])
      .del(busKeys[1])
      .del(busKeys[2])
      .del(busKeys[3])
      .srem(ROUTE_ORDERING_INDEX_KEY, routeKey)
      .exec();

    await subscriber.subscribe(routeChannel);

    // Seed 4 buses in same route/direction.
    await feedBus(busA, 0.2, 34);
    await feedBus(busB, 0.4, 34);
    await feedBus(busC, 0.6, 34);
    await feedBus(busD, 0.8, 34);

    // Middle bus should have 2 ahead and 1 behind in expected order.
    const firstCheck = await feedBus(busB, 0.45, 36);
    const aheadIds = firstCheck.payload.neighbors.ahead.map(
      (entry) => entry.busId,
    );
    const behindIds = firstCheck.payload.neighbors.behind.map(
      (entry) => entry.busId,
    );

    assertOrThrow(
      JSON.stringify(aheadIds) === JSON.stringify([busC, busD]),
      `Unexpected ahead order (phase 1): ${JSON.stringify(aheadIds)}`,
    );
    assertOrThrow(
      JSON.stringify(behindIds) === JSON.stringify([busA]),
      `Unexpected behind order (phase 1): ${JSON.stringify(behindIds)}`,
    );
    await validateNeighborDistances(firstCheck.payload);

    // Move C behind B and confirm order updates on next B event.
    await feedBus(busC, 0.43, 35);
    const secondCheck = await feedBus(busB, 0.47, 36);
    const aheadIdsPhase2 = secondCheck.payload.neighbors.ahead.map(
      (entry) => entry.busId,
    );
    const behindIdsPhase2 = secondCheck.payload.neighbors.behind.map(
      (entry) => entry.busId,
    );

    assertOrThrow(
      JSON.stringify(aheadIdsPhase2) === JSON.stringify([busD]),
      `Unexpected ahead order (phase 2): ${JSON.stringify(aheadIdsPhase2)}`,
    );
    assertOrThrow(
      JSON.stringify(behindIdsPhase2) === JSON.stringify([busA, busC]),
      `Unexpected behind order (phase 2): ${JSON.stringify(behindIdsPhase2)}`,
    );
    await validateNeighborDistances(secondCheck.payload);

    console.log(
      "[replay:neighbors] PASS: 3+ bus neighbor ordering and distance updates validated",
    );
  } finally {
    if (canCleanup) {
      try {
        await subscriber.unsubscribe(routeChannel);
      } catch {
        // No-op
      }

      if (!keepKeys) {
        await keydb
          .multi()
          .del(routeKey)
          .del(shapeKey)
          .del(busKeys[0])
          .del(busKeys[1])
          .del(busKeys[2])
          .del(busKeys[3])
          .srem(ROUTE_ORDERING_INDEX_KEY, routeKey)
          .exec();
      }
    }

    subscriber.disconnect();
    keydb.disconnect();
  }
}

main().catch((error) => {
  console.error("[replay:neighbors] FAIL:", error);
  process.exitCode = 1;
});
