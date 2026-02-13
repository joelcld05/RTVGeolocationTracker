import dotenv from "dotenv";
import Redis from "ioredis";
import { createRouteProjectionService } from "../utils/routeProjection";
import { createStateService } from "../utils/stateService";
import type { NormalizedEvent } from "../types";

dotenv.config();

type Point = { lat: number; lng: number };

const keydbUrl = process.env.KEYDB_URL ?? "redis://localhost:6379";
const routeId = process.env.REPLAY_ROUTE_ID ?? "REPLAY_ROUTE_01";
const direction = (process.env.REPLAY_DIRECTION ?? "FORWARD").toUpperCase();
const busId = process.env.REPLAY_BUS_ID ?? "REPLAY_BUS_01";
const keepKeys = (process.env.REPLAY_KEEP_KEYS ?? "false").toLowerCase() === "true";

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

function buildCircle(center: Point, radiusMeters: number, sides = 12): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides;
    const east = Math.cos(angle) * radiusMeters;
    const north = Math.sin(angle) * radiusMeters;
    points.push(offsetMeters(center, east, north));
  }
  return points;
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
    console.warn("[replay] keydb error", error.message);
  });
  try {
    const routeKey = `route:${routeId}:${direction}`;
    const shapeKey = `route:shape:${routeId}:${direction}`;
    const endzoneKey = `route:endzone:${routeId}:${direction}`;
    const busKey = `bus:${busId}`;

    const routeStart: Point = { lat: 8.9824, lng: -79.5199 };
    const routeMid: Point = { lat: 8.98315, lng: -79.52 };
    const routeEnd: Point = { lat: 8.9839, lng: -79.5201 };
    const shape: Point[] = [routeStart, routeMid, routeEnd];
    const endzone = buildCircle(routeEnd, 30, 14);

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

    await keydb
      .multi()
      .set(shapeKey, JSON.stringify(shape))
      .set(endzoneKey, JSON.stringify(endzone))
      .del(routeKey)
      .del(busKey)
      .exec();

    let timestamp = Date.now();

    async function feed(
      label: string,
      point: Point,
      speedKmh: number,
    ): Promise<NormalizedEvent> {
      timestamp += 2000;
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
      const deviation =
        enriched.deviationMeters === null
          ? "null"
          : enriched.deviationMeters.toFixed(2);
      console.log(
        `[replay] ${label} progress=${enriched.progress.toFixed(4)} speed=${enriched.speed.toFixed(1)}km/h deviation=${deviation} status=${enriched.tripStatus}`,
      );
      return enriched;
    }

    const samples: Array<{ label: string; event: NormalizedEvent }> = [];

    // Noisy in-route movement should remain IN_ROUTE.
    const inRouteNoisyPoints = [
      offsetMeters(lerpPoint(routeStart, routeEnd, 0.45), 3, -2),
      offsetMeters(lerpPoint(routeStart, routeEnd, 0.55), -4, 4),
      offsetMeters(lerpPoint(routeStart, routeEnd, 0.62), 2, 3),
      offsetMeters(lerpPoint(routeStart, routeEnd, 0.68), -3, -1),
    ];
    for (let i = 0; i < inRouteNoisyPoints.length; i += 1) {
      const event = await feed(`in_route_noise_${i + 1}`, inRouteNoisyPoints[i], 26);
      samples.push({ label: `in_route_noise_${i + 1}`, event });
    }

    // Single terminal spike (fast) must not trigger arrival.
    const fastSpikePoint = offsetMeters(routeEnd, 2, -1);
    samples.push({
      label: "terminal_spike_fast",
      event: await feed("terminal_spike_fast", fastSpikePoint, 22),
    });

    // Arrival candidate points: low speed inside end-zone to satisfy dwell.
    const dwellPoints = [
      offsetMeters(routeEnd, 1, 0),
      offsetMeters(routeEnd, -1, 1),
      offsetMeters(routeEnd, 0, -1),
      offsetMeters(routeEnd, 1, 1),
      offsetMeters(routeEnd, -1, -1),
    ];
    for (let i = 0; i < dwellPoints.length; i += 1) {
      const label = `arrival_dwell_${i + 1}`;
      const event = await feed(label, dwellPoints[i], 5);
      samples.push({ label, event });
    }

    // Start of new cycle should reset to IN_ROUTE.
    const restartPoint = offsetMeters(lerpPoint(routeStart, routeEnd, 0.06), 2, 2);
    samples.push({
      label: "new_cycle_restart",
      event: await feed("new_cycle_restart", restartPoint, 28),
    });

    const beforeDwell = samples.filter(
      ({ label }) =>
        label.startsWith("in_route_noise_") || label === "terminal_spike_fast",
    );
    assertOrThrow(
      beforeDwell.every(({ event }) => event.tripStatus === "IN_ROUTE"),
      "Unexpected ARRIVED state before dwell conditions",
    );

    const firstDwell = samples.find(({ label }) => label === "arrival_dwell_1");
    assertOrThrow(
      Boolean(firstDwell) && firstDwell!.event.tripStatus === "IN_ROUTE",
      "First arrival dwell sample should still be IN_ROUTE",
    );

    const arrivedDuringDwell = samples.find(
      ({ label, event }) =>
        label.startsWith("arrival_dwell_") && event.tripStatus === "ARRIVED",
    );
    assertOrThrow(
      Boolean(arrivedDuringDwell),
      "ARRIVED was never reached during dwell samples",
    );

    const restartEvent = samples.find(({ label }) => label === "new_cycle_restart");
    assertOrThrow(
      Boolean(restartEvent) && restartEvent!.event.tripStatus === "IN_ROUTE",
      "Trip status did not reset to IN_ROUTE after restart point",
    );

    const finalBusState = await keydb.hgetall(busKey);
    assertOrThrow(
      (finalBusState.tripStatus ?? "IN_ROUTE") === "IN_ROUTE",
      "Final persisted tripStatus is not IN_ROUTE",
    );

    console.log("[replay] PASS: arrival transition replay validated");

    if (!keepKeys) {
      await keydb
        .multi()
        .del(routeKey)
        .del(shapeKey)
        .del(endzoneKey)
        .del(busKey)
        .exec();
    }
  } finally {
    keydb.disconnect();
  }
}

main().catch(async (error) => {
  console.error("[replay] FAIL:", error);
  process.exitCode = 1;
});
