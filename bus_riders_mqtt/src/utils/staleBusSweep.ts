import type Redis from "ioredis";

type SweepOptions = {
  keydb: Redis;
  indexKey: string;
  intervalMs: number;
  memberBatchSize: number;
  seedScanCount: number;
  seedFromScan: boolean;
};

type SweepStats = {
  enabled: boolean;
  isRunning: boolean;
  totalRuns: number;
  totalRemoved: number;
  lastRunAt: number | null;
  lastDurationMs: number | null;
  lastRoutes: number;
  lastChecked: number;
  lastRemoved: number;
  lastError: string | null;
};

type StaleBusSweeper = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getStats: () => SweepStats;
};

const ROUTE_ORDERING_KEY_PATTERN = /^route:[^:]+:(FORWARD|BACKWARD)$/;

function isRouteOrderingKey(key: string): boolean {
  return ROUTE_ORDERING_KEY_PATTERN.test(key);
}

export function createStaleBusSweeper(options: SweepOptions): StaleBusSweeper {
  let timer: NodeJS.Timeout | null = null;
  let isRunning = false;

  const stats: SweepStats = {
    enabled: options.intervalMs > 0,
    isRunning: false,
    totalRuns: 0,
    totalRemoved: 0,
    lastRunAt: null,
    lastDurationMs: null,
    lastRoutes: 0,
    lastChecked: 0,
    lastRemoved: 0,
    lastError: null,
  };

  async function seedRouteIndexFromScan(): Promise<void> {
    let cursor = "0";
    const discovered = new Set<string>();

    do {
      const [nextCursor, keys] = await options.keydb.scan(
        cursor,
        "MATCH",
        "route:*",
        "COUNT",
        options.seedScanCount,
      );
      cursor = nextCursor;

      for (const key of keys) {
        if (isRouteOrderingKey(key)) {
          discovered.add(key);
        }
      }
    } while (cursor !== "0");

    if (discovered.size > 0) {
      await options.keydb.sadd(options.indexKey, ...Array.from(discovered));
      console.log("[stale-sweep] seeded route ordering index", {
        indexKey: options.indexKey,
        discovered: discovered.size,
      });
    }
  }

  async function sweepOnce(): Promise<void> {
    if (isRunning || options.intervalMs <= 0) {
      return;
    }

    isRunning = true;
    stats.isRunning = true;
    const startedAt = Date.now();
    let checked = 0;
    let removed = 0;

    try {
      const routeKeys = await options.keydb.smembers(options.indexKey);

      for (const routeKey of routeKeys) {
        if (!isRouteOrderingKey(routeKey)) {
          await options.keydb.srem(options.indexKey, routeKey);
          continue;
        }

        let cursor = "0";
        do {
          const [nextCursor, rawEntries] = await options.keydb.zscan(
            routeKey,
            cursor,
            "COUNT",
            options.memberBatchSize,
          );
          cursor = nextCursor;

          const busIds: string[] = [];
          for (let i = 0; i < rawEntries.length; i += 2) {
            busIds.push(rawEntries[i]);
          }

          if (busIds.length === 0) {
            continue;
          }

          checked += busIds.length;
          const pipeline = options.keydb.multi();
          for (const busId of busIds) {
            pipeline.exists(`bus:${busId}`);
          }
          const existsResults = await pipeline.exec();

          const staleBusIds: string[] = [];
          for (let i = 0; i < busIds.length; i += 1) {
            const result = existsResults?.[i]?.[1];
            const exists = typeof result === "number" ? result : Number(result ?? 0);
            if (exists <= 0) {
              staleBusIds.push(busIds[i]);
            }
          }

          if (staleBusIds.length > 0) {
            await options.keydb.zrem(routeKey, ...staleBusIds);
            removed += staleBusIds.length;
          }
        } while (cursor !== "0");

        const remaining = await options.keydb.zcard(routeKey);
        if (remaining <= 0) {
          await options.keydb.srem(options.indexKey, routeKey);
        }
      }

      stats.totalRuns += 1;
      stats.totalRemoved += removed;
      stats.lastRunAt = Date.now();
      stats.lastDurationMs = stats.lastRunAt - startedAt;
      stats.lastRoutes = routeKeys.length;
      stats.lastChecked = checked;
      stats.lastRemoved = removed;
      stats.lastError = null;

      if (removed > 0) {
        console.log("[stale-sweep] removed stale route entries", {
          removed,
          checked,
          routes: routeKeys.length,
          durationMs: stats.lastDurationMs,
        });
      }
    } catch (error) {
      stats.lastError = error instanceof Error ? error.message : String(error);
      console.warn("[stale-sweep] failed", { error });
    } finally {
      isRunning = false;
      stats.isRunning = false;
    }
  }

  async function start(): Promise<void> {
    if (options.intervalMs <= 0 || timer) {
      return;
    }

    if (options.seedFromScan) {
      await seedRouteIndexFromScan();
    }

    await sweepOnce();
    timer = setInterval(() => {
      void sweepOnce();
    }, Math.max(5000, options.intervalMs));
  }

  async function stop(): Promise<void> {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getStats(): SweepStats {
    return {
      ...stats,
      isRunning,
    };
  }

  return { start, stop, getStats };
}
