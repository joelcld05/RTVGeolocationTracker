import type Redis from "ioredis";
import type { NormalizedEvent } from "../types";

type NeighborService = {
  findNeighbors: (
    routeId: string,
    direction: string,
    busId: string,
    count?: number,
  ) => Promise<NeighborResult>;
  buildNeighborDetails: (
    event: NormalizedEvent,
    neighborIds: string[],
  ) => Promise<NeighborDetail[]>;
};

export type NeighborResult = {
  ahead: string[];
  behind: string[];
};

export type NeighborDetail = {
  busId: string;
  distanceMeters: number | null;
  etaSeconds: number | null;
};

type NeighborServiceOptions = {
  keydb: Redis;
  getRouteLengthMeters: (
    routeId: string,
    direction: string,
  ) => Promise<number | null>;
};

export function createNeighborService(options: NeighborServiceOptions): NeighborService {
  async function findNeighbors(
    routeId: string,
    direction: string,
    busId: string,
    count = 3,
  ): Promise<NeighborResult> {
    const routeKey = `route:${routeId}:${direction}`;

    const rank = await options.keydb.zrank(routeKey, busId);
    if (rank === null) return { ahead: [], behind: [] };

    const ahead = await options.keydb.zrange(routeKey, rank + 1, rank + count);
    const behind = await options.keydb.zrange(
      routeKey,
      Math.max(0, rank - count),
      rank - 1,
    );

    return { ahead, behind };
  }

  function calculateEta(distanceMeters: number, speedKmh: number): number | null {
    if (speedKmh <= 0) return null;

    const speedMs = speedKmh / 3.6;
    return Math.round(distanceMeters / speedMs);
  }

  async function buildNeighborDetails(
    event: NormalizedEvent,
    neighborIds: string[],
  ): Promise<NeighborDetail[]> {
    if (neighborIds.length === 0) return [];

    const routeLength = await options.getRouteLengthMeters(
      event.routeId,
      event.direction,
    );
    const routeKey = `route:${event.routeId}:${event.direction}`;

    const distances = await Promise.all(
      neighborIds.map(async (neighborId) => {
        const score = await options.keydb.zscore(routeKey, neighborId);
        const progress = score === null ? null : Number(score);
        if (!routeLength || progress === null || Number.isNaN(progress)) {
          return { busId: neighborId, distanceMeters: null, etaSeconds: null };
        }

        const distanceMeters = Math.abs(progress - event.progress) * routeLength;
        return {
          busId: neighborId,
          distanceMeters,
          etaSeconds: calculateEta(distanceMeters, event.speed),
        };
      }),
    );

    return distances;
  }

  return { findNeighbors, buildNeighborDetails };
}
