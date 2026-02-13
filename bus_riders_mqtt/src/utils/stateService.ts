import type Redis from "ioredis";
import type { MessageMeta, NormalizedEvent, TripStatus } from "../types";

type StateService = {
  storeMessage: (
    busId: string,
    topic: string,
    payload: Buffer,
    meta: MessageMeta,
  ) => Promise<void>;
  updateBusState: (event: NormalizedEvent) => Promise<NormalizedEvent>;
};

type StatusRules = {
  offTrackDistanceThresholdMeters: number;
  offTrackRecoveryThresholdMeters: number;
  arrivalProgressThreshold: number;
  arrivalDwellMs: number;
  arrivalMaxSpeedKmh: number;
  arrivalResetProgressThreshold: number;
  arrivalExitGraceMs: number;
};

type StateServiceOptions = {
  keydb: Redis;
  messageHistoryLimit: number;
  messageTtlSeconds: number;
  busStateTtlSeconds: number;
  routeCacheTtlMs: number;
  statusRules: StatusRules;
};

export function createStateService(options: StateServiceOptions): StateService {
  const endzoneCache = new Map<
    string,
    { points: Array<{ lat: number; lng: number }> | null; expiresAt: number }
  >();

  function parseOptionalNumber(raw: string | undefined): number | null {
    if (!raw || raw === "null") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function formatOptionalNumber(value: number | null): string {
    return value === null || !Number.isFinite(value) ? "null" : String(value);
  }

  function parseBoolean(raw: string | undefined): boolean {
    if (!raw) return false;
    return raw === "1" || raw.toLowerCase() === "true";
  }

  function parseTripStatus(raw: string | undefined): TripStatus {
    return raw === "ARRIVED" ? "ARRIVED" : "IN_ROUTE";
  }

  function parsePolygon(
    raw: string,
  ): Array<{ lat: number; lng: number }> | null {
    try {
      const parsed = JSON.parse(raw) as Array<
        { lat?: number; lng?: number; latitude?: number; longitude?: number } | [
          number,
          number,
        ]
      >;
      if (!Array.isArray(parsed)) return null;

      const points = parsed
        .map((entry) => {
          if (Array.isArray(entry)) {
            return { lat: Number(entry[0]), lng: Number(entry[1]) };
          }

          return {
            lat: Number(entry.lat ?? entry.latitude),
            lng: Number(entry.lng ?? entry.longitude),
          };
        })
        .filter(
          (entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng),
        );

      return points.length >= 3 ? points : null;
    } catch {
      return null;
    }
  }

  async function loadEndzone(
    routeId: string,
    direction: string,
  ): Promise<Array<{ lat: number; lng: number }> | null> {
    const cacheKey = `${routeId}:${direction}`;
    const cached = endzoneCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.points;
    }

    const key = `route:endzone:${routeId}:${direction}`;
    const raw = await options.keydb.get(key);
    if (!raw) {
      endzoneCache.set(cacheKey, {
        points: null,
        expiresAt: Date.now() + options.routeCacheTtlMs,
      });
      return null;
    }

    const points = parsePolygon(raw);
    if (!points) {
      console.warn("[state] invalid endzone polygon", { routeId, direction });
    }

    endzoneCache.set(cacheKey, {
      points,
      expiresAt: Date.now() + options.routeCacheTtlMs,
    });
    return points;
  }

  function isPointInsidePolygon(
    lat: number,
    lng: number,
    polygon: Array<{ lat: number; lng: number }>,
  ): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      const intersects =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }

    return inside;
  }

  function evaluateOffTrack(
    previousIsOffTrack: boolean,
    deviationMeters: number | null,
  ): { isOffTrack: boolean; offTrackSinceTs: number | null } {
    if (deviationMeters === null || !Number.isFinite(deviationMeters)) {
      return { isOffTrack: false, offTrackSinceTs: null };
    }

    if (previousIsOffTrack) {
      const isOffTrackNow =
        deviationMeters > options.statusRules.offTrackRecoveryThresholdMeters;
      return { isOffTrack: isOffTrackNow, offTrackSinceTs: null };
    }

    return {
      isOffTrack:
        deviationMeters >= options.statusRules.offTrackDistanceThresholdMeters,
      offTrackSinceTs: null,
    };
  }

  async function storeMessage(
    busId: string,
    topic: string,
    payload: Buffer,
    meta: MessageMeta,
  ): Promise<void> {
    const payloadText = payload.toString("utf8");
    const payloadBase64 = payload.toString("base64");
    const entry = {
      busId,
      topic,
      qos: meta.qos ?? 0,
      retain: meta.retain ?? false,
      dup: meta.dup ?? false,
      payload: payloadText,
      payloadBase64,
      ts: Date.now(),
    };

    const entryJson = JSON.stringify(entry);
    const listKey = `mqtt:messages:${busId}`;
    const lastKey = `mqtt:last:${busId}:${topic}`;

    const pipeline = options.keydb.multi();
    pipeline.lpush(listKey, entryJson);
    pipeline.set(lastKey, entryJson);
    if (options.messageHistoryLimit > 0) {
      pipeline.ltrim(listKey, 0, options.messageHistoryLimit - 1);
    }
    if (options.messageTtlSeconds > 0) {
      pipeline.expire(listKey, options.messageTtlSeconds);
      pipeline.expire(lastKey, options.messageTtlSeconds);
    }

    await pipeline.exec();
  }

  async function updateBusState(event: NormalizedEvent): Promise<NormalizedEvent> {
    const routeKey = `route:${event.routeId}:${event.direction}`;
    const busKey = `bus:${event.busId}`;
    const previous = await options.keydb.hgetall(busKey);

    const previousRouteId = previous.routeId;
    const previousDirection = previous.direction;
    const hasPreviousRoute = Boolean(previousRouteId && previousDirection);
    const hasRouteChanged =
      hasPreviousRoute &&
      (previousRouteId !== event.routeId || previousDirection !== event.direction);

    const previousIsOffTrack = hasRouteChanged
      ? false
      : parseBoolean(previous.isOffTrack);
    const previousOffTrackSinceTs = hasRouteChanged
      ? null
      : parseOptionalNumber(previous.offTrackSinceTs);

    const offTrack = evaluateOffTrack(previousIsOffTrack, event.deviationMeters);
    const offTrackSinceTs = offTrack.isOffTrack
      ? previousIsOffTrack && previousOffTrackSinceTs !== null
        ? previousOffTrackSinceTs
        : event.timestamp
      : null;

    const previousTripStatus = hasRouteChanged
      ? "IN_ROUTE"
      : parseTripStatus(previous.tripStatus);
    const previousArrivalTimestamp = hasRouteChanged
      ? null
      : parseOptionalNumber(previous.arrivalTimestamp);
    const previousCandidateSince = hasRouteChanged
      ? null
      : parseOptionalNumber(previous.arrivalCandidateSinceTs);
    const previousOutsideSince = hasRouteChanged
      ? null
      : parseOptionalNumber(previous.arrivalOutsideSinceTs);
    const previousHitCount = hasRouteChanged
      ? 0
      : Math.max(0, Number.parseInt(previous.arrivalZoneHitCount ?? "0", 10) || 0);

    const endzone = await loadEndzone(event.routeId, event.direction);
    const insideEndzone = endzone
      ? isPointInsidePolygon(event.lat, event.lng, endzone)
      : false;
    const passesArrivalGate =
      insideEndzone &&
      event.progress >= options.statusRules.arrivalProgressThreshold &&
      event.speed <= options.statusRules.arrivalMaxSpeedKmh;

    const arrivalZoneHitCount = passesArrivalGate ? previousHitCount + 1 : 0;

    let tripStatus: TripStatus = "IN_ROUTE";
    let arrivalTimestamp: number | null = null;
    let arrivalCandidateSinceTs: number | null = null;
    let arrivalOutsideSinceTs: number | null = null;

    if (previousTripStatus === "ARRIVED") {
      const shouldResetByProgress =
        event.progress <= options.statusRules.arrivalResetProgressThreshold;

      if (hasRouteChanged || shouldResetByProgress) {
        tripStatus = "IN_ROUTE";
      } else if (passesArrivalGate) {
        tripStatus = "ARRIVED";
        arrivalTimestamp = previousArrivalTimestamp ?? event.timestamp;
      } else {
        const outsideSince = previousOutsideSince ?? event.timestamp;
        const outsideDuration = Math.max(0, event.timestamp - outsideSince);
        if (outsideDuration >= options.statusRules.arrivalExitGraceMs) {
          tripStatus = "IN_ROUTE";
        } else {
          tripStatus = "ARRIVED";
          arrivalTimestamp = previousArrivalTimestamp ?? event.timestamp;
          arrivalOutsideSinceTs = outsideSince;
        }
      }
    } else if (passesArrivalGate) {
      const candidateSince = previousCandidateSince ?? event.timestamp;
      const dwellDuration = Math.max(0, event.timestamp - candidateSince);

      if (dwellDuration >= options.statusRules.arrivalDwellMs) {
        tripStatus = "ARRIVED";
        arrivalTimestamp = previousArrivalTimestamp ?? event.timestamp;
      } else {
        tripStatus = "IN_ROUTE";
        arrivalCandidateSinceTs = candidateSince;
      }
    }

    const enrichedEvent: NormalizedEvent = {
      ...event,
      isOffTrack: offTrack.isOffTrack,
      tripStatus,
      arrivalTimestamp,
    };

    const pipeline = options.keydb.multi();
    if (hasRouteChanged && previousRouteId && previousDirection) {
      pipeline.zrem(`route:${previousRouteId}:${previousDirection}`, event.busId);
    }
    pipeline.zadd(routeKey, event.progress, event.busId);
    pipeline.hset(busKey, {
      lat: String(enrichedEvent.lat),
      lng: String(enrichedEvent.lng),
      speed: String(enrichedEvent.speed),
      progress: String(enrichedEvent.progress),
      deviationMeters: formatOptionalNumber(enrichedEvent.deviationMeters),
      isOffTrack: enrichedEvent.isOffTrack ? "1" : "0",
      offTrackSinceTs: formatOptionalNumber(offTrackSinceTs),
      tripStatus: enrichedEvent.tripStatus,
      arrivalTimestamp: formatOptionalNumber(enrichedEvent.arrivalTimestamp),
      arrivalCandidateSinceTs: formatOptionalNumber(arrivalCandidateSinceTs),
      arrivalOutsideSinceTs: formatOptionalNumber(arrivalOutsideSinceTs),
      arrivalZoneHitCount: String(arrivalZoneHitCount),
      routeId: enrichedEvent.routeId,
      direction: enrichedEvent.direction,
      timestamp: String(enrichedEvent.timestamp),
    });
    pipeline.expire(busKey, options.busStateTtlSeconds);
    await pipeline.exec();

    return enrichedEvent;
  }

  return { storeMessage, updateBusState };
}
