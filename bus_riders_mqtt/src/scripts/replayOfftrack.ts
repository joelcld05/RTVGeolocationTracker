import dotenv from "dotenv";
import Redis from "ioredis";
import { createRouteProjectionService } from "../utils/routeProjection";
import {
  createStateService,
  ROUTE_ORDERING_INDEX_KEY,
} from "../utils/stateService";
import type { NormalizedEvent } from "../types";

dotenv.config();

type Point = { lat: number; lng: number };

const keydbUrl = process.env.KEYDB_URL ?? "redis://localhost:6379";
const routeId = process.env.REPLAY_ROUTE_ID ?? "REPLAY_OFFTRACK_ROUTE_01";
const direction = (process.env.REPLAY_DIRECTION ?? "FORWARD").toUpperCase();
const busId = process.env.REPLAY_BUS_ID ?? "REPLAY_OFFTRACK_BUS_01";
const keepKeys =
  (process.env.REPLAY_KEEP_KEYS ?? "false").toLowerCase() === "true";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function offsetMeters(point: Point, eastMeters: number, northMeters: number): Point {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = Math.max(
    1,
    111_320 * Math.cos(toRadians(point.lat)),
  );

  return {
    lat: point.lat + northMeters / metersPerDegLat,
    lng: point.lng + eastMeters / metersPerDegLng,
  };
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw || raw === "null") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseBoolean(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

function assertOrThrow(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const keydb = new Redis(keydbUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  keydb.on("error", (error) => {
    console.warn("[replay:offtrack] keydb error", error.message);
  });

  try {
    const routeKey = `route:${routeId}:${direction}`;
    const shapeKey = `route:shape:${routeId}:${direction}`;
    const busKey = `bus:${busId}`;

    const routeStart: Point = { lat: 8.9824, lng: -79.5199 };
    const routeMid: Point = { lat: 8.9850, lng: -79.5199 };
    const routeEnd: Point = { lat: 8.9874, lng: -79.5199 };
    const shape: Point[] = [routeStart, routeMid, routeEnd];
    const basePoint = lerpPoint(routeStart, routeEnd, 0.55);

    const { projectToRoute } = createRouteProjectionService({
      keydb,
      routeCacheTtlMs: 500,
    });

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

    await keydb.ping();

    await keydb.multi().set(shapeKey, JSON.stringify(shape)).del(routeKey).del(busKey).exec();

    let timestamp = Date.now();

    async function feed(
      label: string,
      point: Point,
      speedKmh: number,
    ): Promise<{ event: NormalizedEvent; busState: Record<string, string> }> {
      timestamp += 2000;
      const projection = await projectToRoute(
        routeId,
        direction,
        point.lat,
        point.lng,
      );

      assertOrThrow(
        projection.deviationMeters !== null && Number.isFinite(projection.deviationMeters),
        `${label}: projection deviation is missing`,
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
      const busState = await keydb.hgetall(busKey);

      console.log(
        `[replay:offtrack] ${label} deviation=${enriched.deviationMeters?.toFixed(2)}m isOffTrack=${enriched.isOffTrack} offTrackSinceTs=${busState.offTrackSinceTs ?? "null"}`,
      );

      return { event: enriched, busState };
    }

    const onRoute = await feed("on_route", offsetMeters(basePoint, 6, 0), 22);
    assertOrThrow(onRoute.event.isOffTrack === false, "on_route should be on-track");

    const nearRoute = await feed("near_route", offsetMeters(basePoint, 18, 0), 24);
    assertOrThrow(
      nearRoute.event.isOffTrack === false,
      "near_route should still be on-track",
    );

    const offtrackEnter = await feed(
      "offtrack_enter",
      offsetMeters(basePoint, 80, 0),
      24,
    );
    assertOrThrow(
      offtrackEnter.event.isOffTrack === true,
      "offtrack_enter should set isOffTrack=true",
    );
    const firstOfftrackSinceTs = parseOptionalNumber(offtrackEnter.busState.offTrackSinceTs);
    assertOrThrow(
      firstOfftrackSinceTs === offtrackEnter.event.timestamp,
      "offtrack_enter should set offTrackSinceTs to current event timestamp",
    );

    const offtrackHold = await feed(
      "offtrack_hold_recovery_not_crossed",
      offsetMeters(basePoint, 45, 0),
      23,
    );
    assertOrThrow(
      offtrackHold.event.isOffTrack === true,
      "offtrack_hold should remain off-track while deviation > recovery threshold",
    );
    const holdOfftrackSinceTs = parseOptionalNumber(offtrackHold.busState.offTrackSinceTs);
    assertOrThrow(
      holdOfftrackSinceTs === firstOfftrackSinceTs,
      "offtrack_hold should keep original offTrackSinceTs",
    );

    const recovered = await feed(
      "recovered_crossed_recovery_threshold",
      offsetMeters(basePoint, 30, 0),
      22,
    );
    assertOrThrow(
      recovered.event.isOffTrack === false,
      "recovered should set isOffTrack=false once deviation <= recovery threshold",
    );
    assertOrThrow(
      parseOptionalNumber(recovered.busState.offTrackSinceTs) === null,
      "recovered should clear offTrackSinceTs",
    );

    const reentered = await feed(
      "offtrack_reenter",
      offsetMeters(basePoint, 72, 0),
      25,
    );
    assertOrThrow(
      reentered.event.isOffTrack === true,
      "offtrack_reenter should set isOffTrack=true again",
    );
    const secondOfftrackSinceTs = parseOptionalNumber(reentered.busState.offTrackSinceTs);
    assertOrThrow(
      secondOfftrackSinceTs === reentered.event.timestamp,
      "offtrack_reenter should set offTrackSinceTs to re-entry timestamp",
    );
    assertOrThrow(
      secondOfftrackSinceTs !== null &&
        firstOfftrackSinceTs !== null &&
        secondOfftrackSinceTs > firstOfftrackSinceTs,
      "offtrack_reenter should move offTrackSinceTs forward",
    );

    const finalBusState = await keydb.hgetall(busKey);
    assertOrThrow(
      parseBoolean(finalBusState.isOffTrack) === true,
      "final persisted isOffTrack should be true",
    );

    console.log("[replay:offtrack] PASS: threshold + recovery behavior validated");

    if (!keepKeys) {
      await keydb
        .multi()
        .del(routeKey)
        .del(shapeKey)
        .del(busKey)
        .srem(ROUTE_ORDERING_INDEX_KEY, routeKey)
        .exec();
    }
  } finally {
    keydb.disconnect();
  }
}

main().catch(async (error) => {
  console.error("[replay:offtrack] FAIL:", error);
  process.exitCode = 1;
});
