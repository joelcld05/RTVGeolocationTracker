import type { GpsTopic, MessageMeta, NormalizedEvent } from "../types";
import { parseGpsPayload, validateGps } from "./gps";

type GpsHandlerOptions = {
  projectToRoute: (
    routeId: string,
    direction: string,
    lat: number,
    lng: number,
  ) => Promise<number>;
  storeMessage: (
    busId: string,
    topic: string,
    payload: Buffer,
    meta: MessageMeta,
  ) => Promise<void>;
  onEvent: (event: NormalizedEvent) => void | Promise<void>;
};

export function createGpsHandler(options: GpsHandlerOptions) {
  return async function handleGpsMessage(
    topic: GpsTopic,
    topicText: string,
    payload: Buffer,
    meta: MessageMeta,
  ): Promise<void> {
    const gps = parseGpsPayload(payload);

    validateGps(gps);

    const progress = await options.projectToRoute(
      topic.routeId,
      topic.direction,
      gps.lat,
      gps.lng,
    );

    const event: NormalizedEvent = {
      busId: topic.busId,
      routeId: topic.routeId,
      direction: topic.direction,
      lat: gps.lat,
      lng: gps.lng,
      progress,
      speed: gps.speed,
      timestamp: gps.timestamp,
    };

    await options.onEvent(event);
    await options.storeMessage(topic.busId, topicText, payload, meta);
  };
}
