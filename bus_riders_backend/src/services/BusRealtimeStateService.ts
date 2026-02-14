import Redis from "ioredis";

type Direction = "FORWARD" | "BACKWARD";

type LatLng = {
  lat: number;
  lng: number;
};

type MarkManualFinishInput = {
  busId: string;
  routeId: string;
  direction: Direction;
  fallbackLocation?: LatLng | null;
  timestamp?: number;
};

type ResetManualFinishInput = {
  busId: string;
  routeId: string;
  direction: Direction;
  fallbackLocation?: LatLng | null;
  timestamp?: number;
};

const ROUTE_ORDERING_INDEX_KEY = "route:ordering:index";
const MANUAL_FINISH_RESET_FIELD = "manualFinishPendingReset";

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw || raw === "null") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

function formatOptionalNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "null" : String(value);
}

function normalizeProgress(value: number | null, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value as number));
}

function pickLocation(
  currentLat: number | null,
  currentLng: number | null,
  fallback: LatLng | null | undefined,
  preferFallback = false,
): LatLng | null {
  if (
    preferFallback &&
    fallback &&
    Number.isFinite(fallback.lat) &&
    Number.isFinite(fallback.lng)
  ) {
    return { lat: fallback.lat, lng: fallback.lng };
  }

  if (currentLat !== null && currentLng !== null) {
    return { lat: currentLat, lng: currentLng };
  }

  if (
    fallback &&
    Number.isFinite(fallback.lat) &&
    Number.isFinite(fallback.lng)
  ) {
    return { lat: fallback.lat, lng: fallback.lng };
  }

  return null;
}

class BusRealtimeStateService {
  #client: Redis | null = null;
  #connecting: Promise<Redis> | null = null;
  #keydbUrl: string;
  #clientName: string;
  #busStateTtlSeconds: number;
  #disabled: boolean;

  constructor() {
    this.#keydbUrl = process.env.KEYDB_URL ?? "redis://192.168.1.155:6379";
    this.#clientName =
      process.env.BUS_REALTIME_KEYDB_CLIENT_NAME ??
      "bus_riders_backend:realtime";
    this.#busStateTtlSeconds = Number.parseInt(
      process.env.BUS_STATE_TTL_SECONDS ?? "15",
      10,
    );
    this.#disabled = this.#keydbUrl.trim().length === 0;
  }

  async #getClient(): Promise<Redis | null> {
    if (this.#disabled) {
      return null;
    }

    if (this.#client) {
      return this.#client;
    }

    if (this.#connecting) {
      return this.#connecting;
    }

    this.#connecting = (async () => {
      const client = new Redis(this.#keydbUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      client.on("error", (error) => {
        console.warn("[bus-realtime] keydb error", error);
      });

      try {
        await client.client("SETNAME", this.#clientName);
      } catch (error) {
        console.warn("[bus-realtime] failed to set client name", error);
      }

      await client.ping();
      this.#client = client;
      return client;
    })();

    try {
      return await this.#connecting;
    } finally {
      this.#connecting = null;
    }
  }

  async markManualFinish(input: MarkManualFinishInput): Promise<{
    arrivalTimestamp: number;
  }> {
    const client = await this.#getClient();
    if (!client) {
      throw new Error("REALTIME_STATE_UNAVAILABLE");
    }

    const timestamp =
      typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
        ? input.timestamp
        : Date.now();
    const routeKey = `route:${input.routeId}:${input.direction}`;
    const busKey = `bus:${input.busId}`;
    const current = await client.hgetall(busKey);

    const currentLat = parseOptionalNumber(current.lat);
    const currentLng = parseOptionalNumber(current.lng);
    const location = pickLocation(
      currentLat,
      currentLng,
      input.fallbackLocation,
    );
    if (!location) {
      throw new Error("MISSING_BUS_LOCATION");
    }

    const progress = normalizeProgress(
      parseOptionalNumber(current.progress),
      1,
    );
    const deviation = parseOptionalNumber(current.deviationMeters);
    const offTrackSinceTs = parseOptionalNumber(current.offTrackSinceTs);
    const arrivalZoneHitCount = Math.max(
      1,
      Number.parseInt(current.arrivalZoneHitCount ?? "0", 10) || 0,
    );

    const pipeline = client.multi();
    pipeline.zadd(routeKey, progress, input.busId);
    pipeline.sadd(ROUTE_ORDERING_INDEX_KEY, routeKey);
    pipeline.hset(busKey, {
      lat: String(location.lat),
      lng: String(location.lng),
      speed: "0",
      progress: String(progress),
      deviationMeters: formatOptionalNumber(deviation),
      isOffTrack: parseBoolean(current.isOffTrack) ? "1" : "0",
      offTrackSinceTs: formatOptionalNumber(offTrackSinceTs),
      tripStatus: "ARRIVED",
      arrivalTimestamp: String(timestamp),
      arrivalCandidateSinceTs: "null",
      arrivalOutsideSinceTs: "null",
      arrivalZoneHitCount: String(arrivalZoneHitCount),
      routeId: input.routeId,
      direction: input.direction,
      timestamp: String(timestamp),
      [MANUAL_FINISH_RESET_FIELD]: "1",
    });

    if (this.#busStateTtlSeconds > 0) {
      pipeline.expire(busKey, this.#busStateTtlSeconds);
    }

    pipeline.publish(
      `ws:bus:${input.busId}`,
      JSON.stringify({
        busId: input.busId,
        reason: "manual_finish",
        timestamp,
      }),
    );

    await pipeline.exec();

    return { arrivalTimestamp: timestamp };
  }

  async resetAfterManualFinish(input: ResetManualFinishInput): Promise<{
    resetApplied: boolean;
  }> {
    const client = await this.#getClient();
    if (!client) {
      throw new Error("REALTIME_STATE_UNAVAILABLE");
    }

    const busKey = `bus:${input.busId}`;
    const routeKey = `route:${input.routeId}:${input.direction}`;
    const current = await client.hgetall(busKey);
    if (!current || Object.keys(current).length === 0) {
      return { resetApplied: false };
    }

    const pendingReset = parseBoolean(current[MANUAL_FINISH_RESET_FIELD]);
    if (!pendingReset) {
      return { resetApplied: false };
    }

    const timestamp =
      typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
        ? input.timestamp
        : Date.now();

    const currentLat = parseOptionalNumber(current.lat);
    const currentLng = parseOptionalNumber(current.lng);
    const location = pickLocation(
      currentLat,
      currentLng,
      input.fallbackLocation,
      true,
    );
    if (!location) {
      return { resetApplied: false };
    }

    const pipeline = client.multi();
    pipeline.zadd(routeKey, 0, input.busId);
    pipeline.sadd(ROUTE_ORDERING_INDEX_KEY, routeKey);
    pipeline.hset(busKey, {
      lat: String(location.lat),
      lng: String(location.lng),
      speed: "0",
      progress: "0",
      deviationMeters: "null",
      isOffTrack: "0",
      offTrackSinceTs: "null",
      tripStatus: "IN_ROUTE",
      arrivalTimestamp: "null",
      arrivalCandidateSinceTs: "null",
      arrivalOutsideSinceTs: "null",
      arrivalZoneHitCount: "0",
      routeId: input.routeId,
      direction: input.direction,
      timestamp: String(timestamp),
      [MANUAL_FINISH_RESET_FIELD]: "0",
    });

    if (this.#busStateTtlSeconds > 0) {
      pipeline.expire(busKey, this.#busStateTtlSeconds);
    }

    pipeline.publish(
      `ws:bus:${input.busId}`,
      JSON.stringify({
        busId: input.busId,
        reason: "manual_finish_reset",
        timestamp,
      }),
    );

    await pipeline.exec();
    return { resetApplied: true };
  }
}

const busRealtimeState = new BusRealtimeStateService();

export default busRealtimeState;
