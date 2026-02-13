import type Redis from "ioredis";
import type { MessageMeta, NormalizedEvent } from "../types";

type StateService = {
  storeMessage: (
    busId: string,
    topic: string,
    payload: Buffer,
    meta: MessageMeta,
  ) => Promise<void>;
  updateBusState: (event: NormalizedEvent) => Promise<void>;
};

type StateServiceOptions = {
  keydb: Redis;
  messageHistoryLimit: number;
  messageTtlSeconds: number;
  busStateTtlSeconds: number;
};

export function createStateService(options: StateServiceOptions): StateService {
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

  async function updateBusState(event: NormalizedEvent): Promise<void> {
    const routeKey = `route:${event.routeId}:${event.direction}`;
    const busKey = `bus:${event.busId}`;

    const pipeline = options.keydb.multi();
    pipeline.zadd(routeKey, event.progress, event.busId);
    pipeline.hset(busKey, {
      lat: String(event.lat),
      lng: String(event.lng),
      speed: String(event.speed),
      progress: String(event.progress),
      routeId: event.routeId,
      direction: event.direction,
      timestamp: String(event.timestamp),
    });
    pipeline.expire(busKey, options.busStateTtlSeconds);
    await pipeline.exec();
  }

  return { storeMessage, updateBusState };
}
