# 🚍 Neighbor Calculation -- Real-Time Bus Tracking System

## 🎯 Goal

For a given bus on a route:

-   Find the 3 buses ahead
-   Find the 3 buses behind
-   Work efficiently with 1000+ buses
-   Operate independently per route and direction

------------------------------------------------------------------------

# 🧠 Core Concept

We use **KeyDB Sorted Sets** to maintain real-time ordering.

Each route + direction has one sorted set:

    route:{routeId}:{direction}:buses

Each bus is stored as:

-   **Score** → progress (0.0 → 1.0)
-   **Member** → busId

Example:

    ZADD route:R12:FORWARD:buses 0.42 bus-500

Sorted sets automatically keep buses ordered by position along the
route.

------------------------------------------------------------------------

# 🔎 Step-by-Step Neighbor Algorithm

Assume:

-   routeId = R12
-   direction = FORWARD
-   busId = bus-500

------------------------------------------------------------------------

## 1️⃣ Get the Bus Rank

    ZRANK route:R12:FORWARD:buses bus-500

Example:

    rank = 499

This means the bus is the 500th bus in route order.

------------------------------------------------------------------------

## 2️⃣ Get 3 Buses Ahead

    ZRANGE route:R12:FORWARD:buses 500 502

Equivalent to:

    ZRANGE key rank+1 rank+3

------------------------------------------------------------------------

## 3️⃣ Get 3 Buses Behind

    ZRANGE route:R12:FORWARD:buses 496 498

Equivalent to:

    ZRANGE key rank-3 rank-1

Important:

If rank \< 3 → clamp to 0.

------------------------------------------------------------------------

# 🧮 Node.js Example Implementation

``` javascript
async function getNeighbors(redis, routeId, direction, busId) {
  const key = `route:${routeId}:${direction}:buses`;

  const rank = await redis.zrank(key, busId);

  if (rank === null) {
    return { ahead: [], behind: [] };
  }

  const ahead = await redis.zrange(key, rank + 1, rank + 3);
  const behind = await redis.zrange(
    key,
    Math.max(0, rank - 3),
    rank - 1
  );

  return { ahead, behind };
}
```

------------------------------------------------------------------------

# ⚡ Performance

Operations:

-   ZRANK → O(log n)
-   ZRANGE → O(log n + m)

Even with 1000+ buses, this is extremely fast (typically \<1ms).

------------------------------------------------------------------------

# 🔄 Bidirectional Routes

Never mix directions.

Use separate keys:

    route:R12:FORWARD:buses
    route:R12:BACKWARD:buses

Each direction maintains independent ordering.

------------------------------------------------------------------------

# 📏 Optional: Distance Between Buses

If progress is stored as the sorted set score:

    progress = 0.42

Then distance can be computed as:

    distanceMeters = (neighborProgress - myProgress) * totalRouteLengthMeters

------------------------------------------------------------------------

# 🚀 Why This Approach Works

-   No full scans
-   No complex queries
-   Deterministic ordering
-   O(log n) performance
-   Scales to thousands of buses
-   Clean and maintainable architecture

------------------------------------------------------------------------

# End Result

An efficient, scalable, real-time neighbor detection system for large
fleet tracking platforms.
