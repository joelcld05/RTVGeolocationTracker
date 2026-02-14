import dotenv from "dotenv";
import mongoose from "mongoose";
import Redis from "ioredis";
import routeStateSync from "@/services/RouteStateSync";
import Routes from "@/models/Bus/routes";

dotenv.config();

type Point = [number, number];

const mongoConnection = process.env.MONGO_CONNECTION;
const keydbUrl = process.env.KEYDB_URL ?? "redis://127.0.0.1:6379";
const keepData =
  (process.env.VERIFY_ROUTE_SYNC_KEEP_DATA ?? "false").toLowerCase() === "true";

function assertOrThrow(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildPolygonAround(end: Point): Point[] {
  const [lng, lat] = end;
  return [
    [lng, lat],
    [lng + 0.00018, lat + 0.0001],
    [lng - 0.00016, lat + 0.00011],
    [lng, lat],
  ];
}

async function main(): Promise<void> {
  assertOrThrow(Boolean(mongoConnection), "Missing MONGO_CONNECTION");

  const keydb = new Redis(keydbUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  keydb.on("error", (error) => {
    console.warn("[verify-route-sync] keydb error", error.message);
  });

  const routeNumber = `SYNC-${Date.now()}`;
  let routeId = "";

  try {
    await mongoose.connect(String(mongoConnection), {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    await keydb.ping();

    const routePoints: Point[] = [
      [-79.5199, 8.9824],
      [-79.5202, 8.9831],
      [-79.5205, 8.9839],
    ];
    const start = routePoints[0];
    const end = routePoints[routePoints.length - 1];

    const created = await Routes.create({
      name: "Route Sync Verification",
      number: routeNumber,
      direction: "FORWARD",
      start_point: { type: "Point", coordinates: [start] },
      end_point: { type: "Point", coordinates: [end] },
      route: { type: "LineString", coordinates: routePoints },
      end_zone: { type: "Polygon", coordinates: buildPolygonAround(end) },
    });

    routeId = String(created._id);

    await routeStateSync.start();
    await routeStateSync.syncNow();

    const endzoneKey = `route:endzone:${routeId}:FORWARD`;
    const raw = await keydb.get(endzoneKey);

    assertOrThrow(Boolean(raw), `Missing key ${endzoneKey}`);
    const polygon = JSON.parse(String(raw)) as Array<{ lat: number; lng: number }>;
    assertOrThrow(Array.isArray(polygon), "Endzone payload is not an array");
    assertOrThrow(
      polygon.length >= 3,
      `Endzone polygon points too low: ${polygon.length}`,
    );

    console.log("[verify-route-sync] PASS", {
      routeId,
      endzoneKey,
      polygonPoints: polygon.length,
    });
  } finally {
    try {
      await routeStateSync.stop();
    } catch {
      // no-op cleanup
    }

    if (routeId && !keepData) {
      await Routes.deleteOne({ _id: routeId });
      await keydb.del(
        `route:shape:${routeId}:FORWARD`,
        `route:length:${routeId}:FORWARD`,
        `route:endzone:${routeId}:FORWARD`,
      );
    }

    keydb.disconnect();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("[verify-route-sync] FAIL:", error);
  process.exitCode = 1;
});
