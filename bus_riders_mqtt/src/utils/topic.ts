import type { GpsTopic } from "../types";

type ParseOptions = {
  allowedDirections: Set<string>;
  prefix?: string;
};

export function parseGpsTopic(topic: string, options: ParseOptions): GpsTopic | null {
  if (topic.includes("#") || topic.includes("+")) return null;

  const parts = topic.split("/");
  if (parts.length !== 4) return null;

  const [prefix, routeId, direction, busId] = parts;
  const expectedPrefix = options.prefix ?? "gps";
  if (prefix !== expectedPrefix) return null;
  if (!routeId || !direction || !busId) return null;

  const normalizedDirection = direction.toUpperCase();
  if (!options.allowedDirections.has(normalizedDirection)) return null;
  if (direction !== normalizedDirection) return null;

  return { routeId, direction: normalizedDirection, busId };
}
