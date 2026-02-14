export type RejectReason =
  | "invalid_topic"
  | "invalid_payload"
  | "stale_timestamp"
  | "projection_error"
  | "missing_route_shape";

export class StaleTimestampError extends Error {
  readonly code = "STALE_TIMESTAMP";

  constructor(message: string) {
    super(message);
    this.name = "StaleTimestampError";
  }
}

export class MissingRouteShapeError extends Error {
  readonly code = "MISSING_ROUTE_SHAPE";

  constructor(routeId: string, direction: string) {
    super(`Missing route shape for ${routeId}:${direction}`);
    this.name = "MissingRouteShapeError";
  }
}

export class ProjectionError extends Error {
  readonly code = "PROJECTION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ProjectionError";
  }
}

export function classifyRejectReason(error: unknown): Exclude<RejectReason, "invalid_topic"> {
  if (error instanceof StaleTimestampError) {
    return "stale_timestamp";
  }

  if (error instanceof MissingRouteShapeError) {
    return "missing_route_shape";
  }

  if (error instanceof ProjectionError) {
    return "projection_error";
  }

  return "invalid_payload";
}

type RejectLogContext = {
  busId?: string;
  routeId?: string;
  direction?: string;
  topic?: string;
  message?: string;
  timestamp?: number;
};

export function logRejectedMessage(
  reason: RejectReason,
  context: RejectLogContext,
): void {
  console.warn("[ingestion.reject]", {
    reason,
    busId: context.busId ?? null,
    routeId: context.routeId ?? null,
    direction: context.direction ?? null,
    topic: context.topic ?? null,
    message: context.message ?? null,
    timestamp: context.timestamp ?? Date.now(),
  });
}
