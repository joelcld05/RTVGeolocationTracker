import type { GpsPayload } from "../types";
import { isFiniteNumber } from "./numbers";

export function parseGpsPayload(payloadBuffer: Buffer): GpsPayload {
  const payloadText = payloadBuffer.toString("utf8");
  const payload = JSON.parse(payloadText) as Partial<GpsPayload>;

  return {
    lat: Number(payload.lat),
    lng: Number(payload.lng),
    speed: Number(payload.speed),
    heading: payload.heading === undefined ? undefined : Number(payload.heading),
    timestamp: Number(payload.timestamp),
  };
}

export function validateGps(gps: GpsPayload): void {
  if (!isFiniteNumber(gps.lat) || gps.lat < -90 || gps.lat > 90) {
    throw new Error("Invalid latitude");
  }

  if (!isFiniteNumber(gps.lng) || gps.lng < -180 || gps.lng > 180) {
    throw new Error("Invalid longitude");
  }

  if (!isFiniteNumber(gps.speed) || gps.speed < 0) {
    throw new Error("Invalid speed");
  }

  if (!isFiniteNumber(gps.timestamp) || gps.timestamp <= 0) {
    throw new Error("Invalid timestamp");
  }

  if (gps.heading !== undefined) {
    if (!isFiniteNumber(gps.heading) || gps.heading < 0 || gps.heading > 360) {
      throw new Error("Invalid heading");
    }
  }
}
