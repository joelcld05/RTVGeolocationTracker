import type Redis from "ioredis";
import type { NormalizedEvent } from "../types";
import type { NeighborDetail, NeighborResult } from "./neighborService";

type RealtimePublisher = {
  pushRealtimeUpdate: (event: NormalizedEvent) => Promise<void>;
};

type RealtimePublisherOptions = {
  keydb: Redis;
  findNeighbors: (
    routeId: string,
    direction: string,
    busId: string,
  ) => Promise<NeighborResult>;
  buildNeighborDetails: (
    event: NormalizedEvent,
    neighborIds: string[],
  ) => Promise<NeighborDetail[]>;
};

export function createRealtimePublisher(
  options: RealtimePublisherOptions,
): RealtimePublisher {
  async function pushRealtimeUpdate(event: NormalizedEvent): Promise<void> {
    const neighbors = await options.findNeighbors(
      event.routeId,
      event.direction,
      event.busId,
    );
    const [ahead, behind] = await Promise.all([
      options.buildNeighborDetails(event, neighbors.ahead),
      options.buildNeighborDetails(event, neighbors.behind),
    ]);

    const payload = {
      busId: event.busId,
      routeId: event.routeId,
      direction: event.direction,
      position: {
        lat: event.lat,
        lng: event.lng,
      },
      progress: event.progress,
      deviationMeters: event.deviationMeters,
      speed: event.speed,
      isOffTrack: event.isOffTrack,
      tripStatus: event.tripStatus,
      arrivalTimestamp: event.arrivalTimestamp,
      timestamp: event.timestamp,
      neighbors: {
        ahead,
        behind,
      },
    };

    const busChannel = `ws:bus:${event.busId}`;
    const routeChannel = `ws:route:${event.routeId}:${event.direction}`;

    const serialized = JSON.stringify(payload);
    await options.keydb.publish(busChannel, serialized);
    await options.keydb.publish(routeChannel, serialized);
  }

  return { pushRealtimeUpdate };
}
