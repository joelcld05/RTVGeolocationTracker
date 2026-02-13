# 📡 MQTT Service Role -- Real-Time Bus Tracking System

## 1. Purpose of the MQTT Service

The MQTT Service is responsible for receiving GPS updates from buses in
real time, validating and processing those messages, and forwarding
structured data to the real-time state layer (KeyDB) and WebSocket
layer.

It acts as the bridge between:

-   Bus devices (publishers)
-   Real-time processing engine
-   State storage (KeyDB)
-   Live client updates (WebSocket)

------------------------------------------------------------------------

# 2. Why MQTT Is Used

MQTT is chosen because it:

-   Is lightweight and optimized for mobile networks
-   Handles unstable connections well
-   Uses minimal bandwidth
-   Supports publish/subscribe architecture
-   Scales efficiently to thousands of devices

This makes it ideal for real-time GPS tracking from buses.

------------------------------------------------------------------------

# 3. Architecture Position

Mobile App (Bus) ↓ MQTT (TLS + JWT) EMQX (MQTT Broker) ↓ MQTT Service
(Subscriber + Processor) ↓ KeyDB (Real-time State) ↓ WebSocket Server ↓
Passenger/Admin Apps

------------------------------------------------------------------------

# 4. Responsibilities of the MQTT Service

## 4.1 Subscribe to GPS Topics

The service subscribes to:

    gps/+/+/+

Topic structure:

    gps/{routeId}/{direction}/{busId}

Example:

    gps/R12/FORWARD/bus-500

------------------------------------------------------------------------

## 4.2 Validate Incoming Messages

For each message:

-   Validate topic structure
-   Extract:
    -   routeId
    -   direction
    -   busId
-   Validate payload structure
-   Validate JWT identity (if required at service layer)

------------------------------------------------------------------------

## 4.3 Process GPS Data

For each valid GPS message:

1.  Load route geometry
2.  Project GPS point onto route
3.  Compute:
    -   distanceAlongRoute (meters)
    -   progress (0 → 1)
4.  Update real-time state in KeyDB

------------------------------------------------------------------------

## 4.4 Update Real-Time Ordering

Update sorted set:

    ZADD route:{routeId}:{direction} progress busId

This maintains automatic ordering of buses along the route.

------------------------------------------------------------------------

## 4.5 Compute Neighbor Buses

Using sorted set operations:

-   ZRANK
-   ZRANGE

Determine:

-   3 buses ahead
-   3 buses behind

------------------------------------------------------------------------

## 4.6 Emit WebSocket Events

After processing:

Emit to:

    route:{routeId}:{direction}

Payload example:

    {
      "busId": "bus-500",
      "progress": 0.42,
      "distanceMeters": 45231,
      "ahead": [...],
      "behind": [...]
    }

This updates passengers and dashboards in real time.

------------------------------------------------------------------------

# 5. Security Responsibilities

The MQTT Service works with:

-   EMQX broker (JWT authentication)
-   TLS encryption (mqtts://)

Security measures:

-   Only authorized buses can publish
-   Topic-level ACL enforcement
-   Payload validation
-   Optional rate limiting

------------------------------------------------------------------------

# 6. Scalability

The MQTT Service is stateless and can be horizontally scaled:

-   Multiple service instances
-   Shared KeyDB backend
-   Load-balanced MQTT connections

Supports:

-   1000+ buses per route
-   Multiple routes
-   Bidirectional traffic

------------------------------------------------------------------------

# 7. Optional Enhancements

The MQTT Service can also:

-   Forward events to Kafka
-   Store historical data in MongoDB
-   Detect anomalies (speed violations, route deviation)
-   Trigger alerts

------------------------------------------------------------------------

# 8. Summary

The MQTT Service is the real-time processing engine of the system.

It:

-   Receives GPS updates
-   Validates and processes them
-   Maintains route ordering
-   Computes neighbors
-   Emits real-time updates
-   Enables scalable, event-driven fleet tracking

Without this service, the system would lack real-time intelligence and
coordinated state management.
