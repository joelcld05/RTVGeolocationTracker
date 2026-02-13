import type Redis from "ioredis";
import type { RouteProjectionResult, RouteShape } from "../types";
import { isFiniteNumber } from "./numbers";

type RouteProjectionService = {
  projectToRoute: (
    routeId: string,
    direction: string,
    lat: number,
    lng: number,
  ) => Promise<RouteProjectionResult>;
  getRouteLengthMeters: (
    routeId: string,
    direction: string,
  ) => Promise<number | null>;
};

type RouteProjectionOptions = {
  keydb: Redis;
  routeCacheTtlMs: number;
};

export function createRouteProjectionService(
  options: RouteProjectionOptions,
): RouteProjectionService {
  const routeCache = new Map<string, { shape: RouteShape; expiresAt: number }>();

  function toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  function haversineMeters(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
  ): number {
    const radius = 6371000;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const aa =
      sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return 2 * radius * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  }

  function toXY(
    point: { lat: number; lng: number },
    refLatRad: number,
  ): { x: number; y: number } {
    const radius = 6371000;
    const latRad = toRadians(point.lat);
    const lngRad = toRadians(point.lng);
    return {
      x: radius * lngRad * Math.cos(refLatRad),
      y: radius * latRad,
    };
  }

  function buildRouteShape(
    points: Array<{ lat: number; lng: number }>,
  ): RouteShape {
    const cumulative: number[] = [0];
    let total = 0;

    for (let i = 1; i < points.length; i += 1) {
      total += haversineMeters(points[i - 1], points[i]);
      cumulative.push(total);
    }

    return { points, totalLengthMeters: total, cumulativeMeters: cumulative };
  }

  async function loadRouteShape(
    routeId: string,
    direction: string,
  ): Promise<RouteShape | null> {
    const cacheKey = `${routeId}:${direction}`;
    const cached = routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.shape;
    }

    const shapeKey = `route:shape:${routeId}:${direction}`;
    const raw = await options.keydb.get(shapeKey);
    if (!raw) return null;

    let points: Array<{ lat: number; lng: number }> = [];

    try {
      const parsed = JSON.parse(raw) as Array<
        { lat?: number; lng?: number } | [number, number]
      >;
      points = parsed
        .map((entry) => {
          if (Array.isArray(entry)) {
            return { lat: Number(entry[0]), lng: Number(entry[1]) };
          }
          return { lat: Number(entry.lat), lng: Number(entry.lng) };
        })
        .filter(
          (entry) => isFiniteNumber(entry.lat) && isFiniteNumber(entry.lng),
        );
    } catch (error) {
      console.warn("[route] failed to parse shape", {
        routeId,
        direction,
        error,
      });
      return null;
    }

    if (points.length < 2) return null;

    const shape = buildRouteShape(points);
    routeCache.set(cacheKey, {
      shape,
      expiresAt: Date.now() + options.routeCacheTtlMs,
    });
    return shape;
  }

  async function projectToRoute(
    routeId: string,
    direction: string,
    lat: number,
    lng: number,
  ): Promise<RouteProjectionResult> {
    const shape = await loadRouteShape(routeId, direction);
    if (!shape || shape.totalLengthMeters <= 0) {
      return { progress: 0, deviationMeters: null };
    }

    let closestDistance = Number.POSITIVE_INFINITY;
    let closestProgress = 0;

    for (let i = 1; i < shape.points.length; i += 1) {
      const start = shape.points[i - 1];
      const end = shape.points[i];
      const refLatRad = toRadians((start.lat + end.lat) / 2);

      const startXY = toXY(start, refLatRad);
      const endXY = toXY(end, refLatRad);
      const pointXY = toXY({ lat, lng }, refLatRad);

      const segmentX = endXY.x - startXY.x;
      const segmentY = endXY.y - startXY.y;
      const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;

      let t = 0;
      if (segmentLengthSq > 0) {
        t =
          ((pointXY.x - startXY.x) * segmentX +
            (pointXY.y - startXY.y) * segmentY) /
          segmentLengthSq;
        t = Math.min(1, Math.max(0, t));
      }

      const closestX = startXY.x + t * segmentX;
      const closestY = startXY.y + t * segmentY;
      const distance = Math.hypot(pointXY.x - closestX, pointXY.y - closestY);

      if (distance < closestDistance) {
        const segmentLength =
          shape.cumulativeMeters[i] - shape.cumulativeMeters[i - 1];
        const along = shape.cumulativeMeters[i - 1] + segmentLength * t;
        closestDistance = distance;
        closestProgress = along / shape.totalLengthMeters;
      }
    }

    if (!Number.isFinite(closestProgress)) {
      return { progress: 0, deviationMeters: null };
    }

    return {
      progress: Math.max(0, Math.min(1, closestProgress)),
      deviationMeters: Number.isFinite(closestDistance)
        ? closestDistance
        : null,
    };
  }

  async function getRouteLengthMeters(
    routeId: string,
    direction: string,
  ): Promise<number | null> {
    const shape = await loadRouteShape(routeId, direction);
    if (shape && shape.totalLengthMeters > 0) return shape.totalLengthMeters;

    const key = `route:length:${routeId}:${direction}`;
    const raw = await options.keydb.get(key);
    if (!raw) return null;

    const length = Number(raw);
    return Number.isFinite(length) && length > 0 ? length : null;
  }

  return { projectToRoute, getRouteLengthMeters };
}
