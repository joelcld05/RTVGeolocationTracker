import type {
  GpsTopic,
  MessageMeta,
  NormalizedEvent,
  RouteProjectionResult,
} from "../types";
import { parseGpsPayload, validateGps } from "./gps";

type GpsHandlerOptions = {
  projectToRoute: (
    routeId: string,
    direction: string,
    lat: number,
    lng: number,
  ) => Promise<RouteProjectionResult>;
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

    const projection = await options.projectToRoute(
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
      progress: projection.progress,
      deviationMeters: projection.deviationMeters,
      speed: gps.speed,
      timestamp: gps.timestamp,
      isOffTrack: false,
      tripStatus: "IN_ROUTE",
      arrivalTimestamp: null,
    };

    await options.onEvent(event);
    await options.storeMessage(topic.busId, topicText, payload, meta);
  };
}
