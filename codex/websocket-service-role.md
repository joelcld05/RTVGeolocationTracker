# 🌐 WebSocket Service Role -- Real-Time Bus Tracking System

## 1. Purpose of the WebSocket Service

The WebSocket Service is responsible for delivering real-time updates to
client applications such as:

-   Passenger mobile apps
-   Admin dashboards
-   Fleet monitoring systems

It provides low-latency, bidirectional communication between the backend
and connected clients.

------------------------------------------------------------------------

# 2. Why WebSockets Are Used

WebSockets are chosen because they:

-   Provide persistent, full-duplex connections
-   Enable instant server-to-client updates
-   Reduce overhead compared to repeated HTTP polling
-   Scale efficiently for live data streams

This makes them ideal for real-time fleet tracking.

------------------------------------------------------------------------

# 3. Architecture Position

Mobile App (Bus) ↓ MQTT MQTT Ingestion Service ↓ KeyDB (Real-Time State)
↓ WebSocket Service ↓ Passenger / Admin Clients

The WebSocket Service sits between the real-time state layer and
frontend clients.

------------------------------------------------------------------------

# 4. Responsibilities of the WebSocket Service

## 4.1 Manage Client Connections

-   Handle new client connections
-   Authenticate users (via JWT validation)
-   Assign clients to route-specific channels
-   Handle disconnections gracefully

------------------------------------------------------------------------

## 4.2 Subscribe Clients to Routes

Clients subscribe to:

route:{routeId}:{direction}

Example:

route:R12:FORWARD

This ensures users only receive relevant updates.

------------------------------------------------------------------------

## 4.3 Receive Processed Updates

The WebSocket Service receives structured events from:

-   MQTT Ingestion Service
-   Real-time state changes in KeyDB

Example incoming payload:

{ "busId": "bus-500", "progress": 0.42, "distanceMeters": 45231,
"ahead": \[...\], "behind": \[...\] }

------------------------------------------------------------------------

## 4.4 Broadcast Updates to Clients

The service emits updates to all clients subscribed to the route
channel.

This enables:

-   Live map updates
-   Real-time neighbor visibility
-   ETA recalculations
-   Congestion detection

------------------------------------------------------------------------

# 5. Real-Time Behavior

When a bus publishes GPS:

1.  MQTT Service processes the message
2.  Route projection is calculated
3.  KeyDB state is updated
4.  Neighbor calculation is executed
5.  WebSocket Service broadcasts result instantly

This entire pipeline operates in milliseconds.

------------------------------------------------------------------------

# 6. Security Responsibilities

The WebSocket Service ensures:

-   JWT validation before connection
-   Route-level authorization
-   Input validation
-   Rate limiting (optional)
-   Protection against connection flooding

------------------------------------------------------------------------

# 7. Scalability

The WebSocket Service is stateless and horizontally scalable.

Scaling strategies:

-   Multiple WebSocket instances
-   Load balancer in front
-   Shared KeyDB backend
-   Route-based sharding if necessary

Supports:

-   Thousands of concurrent users
-   Multiple routes
-   Bidirectional traffic

------------------------------------------------------------------------

# 8. Optional Enhancements

The WebSocket Service can also:

-   Emit historical playback
-   Provide delta updates only (bandwidth optimization)
-   Implement presence detection
-   Support reconnection with state recovery

------------------------------------------------------------------------

# 9. Summary

The WebSocket Service is the real-time delivery engine of the system.

It:

-   Maintains persistent client connections
-   Broadcasts route updates instantly
-   Delivers neighbor and distance data
-   Enables live maps and dashboards
-   Scales horizontally
-   Keeps latency extremely low

Without this service, users would not receive live updates from the
fleet tracking system.
