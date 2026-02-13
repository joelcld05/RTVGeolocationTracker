import Redis from "ioredis";
import Routes from "@/models/Bus/routes";

type LatLngPoint = { lat: number; lng: number };
type Direction = "FORWARD" | "BACKWARD";

const DIRECTION_SET = new Set<Direction>(["FORWARD", "BACKWARD"]);
const ROUTE_SHAPE_INDEX_KEY = "route:shape:index";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: LatLngPoint, b: LatLngPoint): number {
  const radius = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const part =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * radius * Math.atan2(Math.sqrt(part), Math.sqrt(1 - part));
}

function normalizeDirection(value: unknown): Direction | null {
  if (typeof value !== "string") {
    return null;
  }

  const direction = value.trim().toUpperCase();
  if (!DIRECTION_SET.has(direction as Direction)) {
    return null;
  }

  return direction as Direction;
}

function toLatLngPoints(
  coordinates: unknown,
): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map((entry) => toLatLngPoint(entry))
    .filter((point): point is { lat: number; lng: number } => point !== null);
}

function toLatLngPoint(entry: unknown): LatLngPoint | null {
  if (!Array.isArray(entry) || entry.length < 2) {
    return null;
  }

  // GeoJSON order is [lng, lat]
  const lng = Number(entry[0]);
  const lat = Number(entry[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function getEndzonePolygonPoints(endPointCoordinates: unknown): LatLngPoint[] {
  if (!Array.isArray(endPointCoordinates)) {
    return [];
  }

  const points = endPointCoordinates
    .map((entry) => toLatLngPoint(entry))
    .filter((point): point is LatLngPoint => point !== null);

  // If three or more points are provided, treat as explicit polygon.
  if (points.length >= 3) {
    return points;
  }

  return [];
}

function buildCircularPolygon(
  center: LatLngPoint,
  radiusMeters: number,
  sides = 12,
): LatLngPoint[] {
  const safeSides = Math.max(6, Math.min(64, sides));
  const radius = Math.max(5, radiusMeters);
  const latRad = toRadians(center.lat);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = Math.max(1, 111_320 * Math.cos(latRad));

  const points: LatLngPoint[] = [];
  for (let i = 0; i < safeSides; i += 1) {
    const angle = (2 * Math.PI * i) / safeSides;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;

    points.push({
      lat: center.lat + dy / metersPerDegLat,
      lng: center.lng + dx / metersPerDegLng,
    });
  }

  return points;
}

function getRouteLengthMeters(points: LatLngPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

class RouteStateSyncService {
  #keydb: Redis | null = null;
  #isSyncing = false;
  #timer: NodeJS.Timeout | null = null;
  #enabled: boolean;
  #intervalMs: number;
  #keydbUrl: string;
  #clientName: string;
  #endzoneRadiusMeters: number;

  constructor() {
    this.#enabled =
      (process.env.ROUTE_SYNC_ENABLED ?? "true").toLowerCase() !== "false";
    this.#intervalMs = Number.parseInt(
      process.env.ROUTE_SYNC_INTERVAL_MS ?? "60000",
      10,
    );
    this.#keydbUrl = process.env.KEYDB_URL ?? "redis://localhost:6379";
    this.#clientName =
      process.env.ROUTE_SYNC_KEYDB_CLIENT_NAME ?? "bus_riders_backend:routes";
    this.#endzoneRadiusMeters = Number.parseFloat(
      process.env.ROUTE_ENDZONE_RADIUS_METERS ?? "40",
    );
  }

  async start(): Promise<void> {
    if (!this.#enabled) {
      console.log("[route-sync] disabled");
      return;
    }

    if (this.#keydb) {
      return;
    }

    this.#keydb = new Redis(this.#keydbUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    this.#keydb.on("error", (error) => {
      console.warn("[route-sync] keydb error", error);
    });

    try {
      await this.#keydb.client("SETNAME", this.#clientName);
    } catch (error) {
      console.warn("[route-sync] failed to set client name", error);
    }

    try {
      await this.#keydb.ping();
      console.log("[route-sync] keydb connected");
    } catch (error) {
      console.warn("[route-sync] keydb ping failed", error);
    }

    await this.syncNow();

    this.#timer = setInterval(() => {
      void this.syncNow();
    }, Math.max(5000, this.#intervalMs));
  }

  async stop(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }

    if (!this.#keydb) {
      return;
    }

    try {
      await this.#keydb.quit();
    } catch (error) {
      console.warn("[route-sync] keydb quit failed, disconnecting", error);
      this.#keydb.disconnect();
    } finally {
      this.#keydb = null;
    }
  }

  async syncNow(): Promise<void> {
    if (!this.#keydb || this.#isSyncing) {
      return;
    }

    this.#isSyncing = true;

    try {
      const routes = await Routes.find(
        {},
        { _id: 1, direction: 1, route: 1, updated_at: 1 },
      )
        .lean()
        .exec();

      const activeRouteKeys = new Set<string>();
      const pipeline = this.#keydb.multi();

      let synced = 0;
      let endzonesSynced = 0;

      for (const route of routes) {
        const routeId = String(route?._id ?? "").trim();
        const direction = normalizeDirection(route?.direction);
        if (!routeId || !direction) {
          continue;
        }

        const coordinates = (route as any)?.route?.coordinates;
        const points = toLatLngPoints(coordinates);
        if (points.length < 2) {
          continue;
        }

        const lengthMeters = getRouteLengthMeters(points);
        if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
          continue;
        }

        const shapeKey = `route:shape:${routeId}:${direction}`;
        const lengthKey = `route:length:${routeId}:${direction}`;
        const endzoneKey = `route:endzone:${routeId}:${direction}`;

        pipeline.set(shapeKey, JSON.stringify(points));
        pipeline.set(lengthKey, String(lengthMeters));

        const explicitEndzone = getEndzonePolygonPoints(
          (route as any)?.end_point?.coordinates,
        );
        if (explicitEndzone.length >= 3) {
          pipeline.set(endzoneKey, JSON.stringify(explicitEndzone));
          endzonesSynced += 1;
        } else {
          const terminalPoint = points[points.length - 1];
          if (terminalPoint) {
            const generatedEndzone = buildCircularPolygon(
              terminalPoint,
              this.#endzoneRadiusMeters,
            );
            pipeline.set(endzoneKey, JSON.stringify(generatedEndzone));
            endzonesSynced += 1;
          } else {
            pipeline.del(endzoneKey);
          }
        }

        activeRouteKeys.add(`${routeId}:${direction}`);
        synced += 1;
      }

      const existingRouteKeys = await this.#keydb.smembers(ROUTE_SHAPE_INDEX_KEY);
      for (const entry of existingRouteKeys) {
        if (activeRouteKeys.has(entry)) {
          continue;
        }

        const [routeId, direction] = entry.split(":");
        if (!routeId || !direction) {
          continue;
        }

        pipeline.del(`route:shape:${routeId}:${direction}`);
        pipeline.del(`route:length:${routeId}:${direction}`);
        pipeline.del(`route:endzone:${routeId}:${direction}`);
      }

      pipeline.del(ROUTE_SHAPE_INDEX_KEY);
      if (activeRouteKeys.size > 0) {
        pipeline.sadd(ROUTE_SHAPE_INDEX_KEY, ...Array.from(activeRouteKeys));
      }

      await pipeline.exec();
      console.log("[route-sync] synced", {
        routes: synced,
        endzones: endzonesSynced,
        removed: Math.max(0, existingRouteKeys.length - activeRouteKeys.size),
      });
    } catch (error) {
      console.warn("[route-sync] sync failed", error);
    } finally {
      this.#isSyncing = false;
    }
  }
}

const routeStateSync = new RouteStateSyncService();

export default routeStateSync;
