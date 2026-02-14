import dotenv from "dotenv";
import Redis from "ioredis";
import { createStaleBusSweeper } from "../utils/staleBusSweep";
import { ROUTE_ORDERING_INDEX_KEY } from "../utils/stateService";

dotenv.config();

const keydbUrl = process.env.KEYDB_URL ?? "redis://localhost:6379";
const keepKeys =
  (process.env.REPLAY_KEEP_KEYS ?? "false").toLowerCase() === "true";

function assertOrThrow(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const keydb = new Redis(keydbUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  keydb.on("error", (error) => {
    console.warn("[replay:stale] keydb error", error.message);
  });

  const routeA = "REPLAY_STALE_ROUTE_A";
  const routeB = "REPLAY_STALE_ROUTE_B";
  const routeKeyA = `route:${routeA}:FORWARD`;
  const routeKeyB = `route:${routeB}:BACKWARD`;

  const activeBus = "REPLAY_STALE_ACTIVE_BUS_01";
  const staleBusA = "REPLAY_STALE_STALE_BUS_01";
  const staleBusB = "REPLAY_STALE_STALE_BUS_02";
  const activeBusKey = `bus:${activeBus}`;
  const staleBusKeyA = `bus:${staleBusA}`;
  const staleBusKeyB = `bus:${staleBusB}`;

  const invalidIndexEntry = "route:invalid:index:entry";

  const sweeper = createStaleBusSweeper({
    keydb,
    indexKey: ROUTE_ORDERING_INDEX_KEY,
    intervalMs: 10000,
    memberBatchSize: 64,
    seedScanCount: 200,
    seedFromScan: false,
  });

  try {
    await keydb.ping();

    await keydb
      .multi()
      .del(routeKeyA)
      .del(routeKeyB)
      .del(activeBusKey)
      .del(staleBusKeyA)
      .del(staleBusKeyB)
      .srem(ROUTE_ORDERING_INDEX_KEY, routeKeyA)
      .srem(ROUTE_ORDERING_INDEX_KEY, routeKeyB)
      .srem(ROUTE_ORDERING_INDEX_KEY, invalidIndexEntry)
      .exec();

    await keydb
      .multi()
      .zadd(routeKeyA, 0.51, activeBus)
      .zadd(routeKeyA, 0.72, staleBusA)
      .zadd(routeKeyB, 0.37, staleBusB)
      .sadd(ROUTE_ORDERING_INDEX_KEY, routeKeyA)
      .sadd(ROUTE_ORDERING_INDEX_KEY, routeKeyB)
      .sadd(ROUTE_ORDERING_INDEX_KEY, invalidIndexEntry)
      .hset(activeBusKey, {
        routeId: routeA,
        direction: "FORWARD",
        progress: "0.51",
        timestamp: String(Date.now()),
      })
      .exec();

    await sweeper.start();
    await sweeper.stop();

    const stats = sweeper.getStats();
    const routeAMembers = await keydb.zrange(routeKeyA, 0, -1);
    const routeBCardinality = await keydb.zcard(routeKeyB);
    const indexMembers = await keydb.smembers(ROUTE_ORDERING_INDEX_KEY);

    console.log("[replay:stale] sweep stats", stats);
    console.log("[replay:stale] route A members", routeAMembers);
    console.log("[replay:stale] route B cardinality", routeBCardinality);
    console.log("[replay:stale] index members", indexMembers);

    assertOrThrow(
      stats.totalRuns >= 1,
      "Sweeper did not execute at least one run",
    );
    assertOrThrow(
      stats.totalRemoved >= 2,
      `Expected at least 2 stale removals, got ${stats.totalRemoved}`,
    );
    assertOrThrow(
      routeAMembers.length === 1 && routeAMembers[0] === activeBus,
      "Route A should contain only the active bus after sweep",
    );
    assertOrThrow(
      routeBCardinality === 0,
      "Route B should be emptied because it contained only stale buses",
    );
    assertOrThrow(
      indexMembers.includes(routeKeyA),
      "Route A should remain in route ordering index",
    );
    assertOrThrow(
      !indexMembers.includes(routeKeyB),
      "Route B should be removed from route ordering index after becoming empty",
    );
    assertOrThrow(
      !indexMembers.includes(invalidIndexEntry),
      "Invalid index entry should be removed by sweeper",
    );

    console.log("[replay:stale] PASS: stale cleanup behavior validated");
  } finally {
    await sweeper.stop();

    if (!keepKeys) {
      await keydb
        .multi()
        .del(routeKeyA)
        .del(routeKeyB)
        .del(activeBusKey)
        .del(staleBusKeyA)
        .del(staleBusKeyB)
        .srem(ROUTE_ORDERING_INDEX_KEY, routeKeyA)
        .srem(ROUTE_ORDERING_INDEX_KEY, routeKeyB)
        .srem(ROUTE_ORDERING_INDEX_KEY, invalidIndexEntry)
        .exec();
    }

    keydb.disconnect();
  }
}

main().catch((error) => {
  console.error("[replay:stale] FAIL:", error);
  process.exitCode = 1;
});
