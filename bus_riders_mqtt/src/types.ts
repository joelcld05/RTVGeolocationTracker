export type GpsPayload = {
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  timestamp: number;
};

export type TripStatus = "IN_ROUTE" | "ARRIVED";

export type NormalizedEvent = {
  busId: string;
  routeId: string;
  direction: string;
  lat: number;
  lng: number;
  progress: number;
  deviationMeters: number | null;
  speed: number;
  timestamp: number;
  isOffTrack: boolean;
  tripStatus: TripStatus;
  arrivalTimestamp: number | null;
};

export type RouteProjectionResult = {
  progress: number;
  deviationMeters: number | null;
};

export type GpsTopic = {
  routeId: string;
  direction: string;
  busId: string;
};

export type RouteShape = {
  points: Array<{ lat: number; lng: number }>;
  totalLengthMeters: number;
  cumulativeMeters: number[];
};

export type MessageMeta = {
  qos?: number;
  retain?: boolean;
  dup?: boolean;
};
