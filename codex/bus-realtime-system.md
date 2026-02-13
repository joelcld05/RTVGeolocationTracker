# 🚍 Real-Time Bus Tracking System Architecture

## 1. Overview

This project is a real-time bus tracking platform designed to:

- Track buses via GPS updates every 2--5 seconds.
- Support predefined routes with two directions (FORWARD / BACKWARD).
- Allow each bus to know:
  - The 3 buses ahead.
  - The 3 buses behind.
  - Distance between them.
- Allow passengers/admin dashboards to view live bus positions.
- Scale to 1000+ buses per route.

The system is event-driven, scalable, and optimized for low latency.

---

# 2. High-Level Architecture

Mobile App (Bus)
↓
MQTT (TLS + JWT) EMQX (MQTT Broker)
↓
MQTT Ingestion
Service (Node.js)
↓
KeyDB (Real-time State Store)
↓
WebSocket Server
↓
Passenger / Admin Applications

Optional (for analytics and history):

MQTT → Kafka → MongoDB / Analytics Pipeline

---

# 3. Core Components

## 3.1 Mobile App (Bus Device)

Responsibilities:

- Authenticate via HTTP API (Express server).
- Receive JWT token.
- Connect to MQTT using TLS.
- Publish GPS updates every 2--5 seconds.

### MQTT Topic Format

gps/{routeId}/{direction}/{busId}

Example:

gps/R12/FORWARD/bus-500

### GPS Payload Format

{ "lat": 8.531383, "lng": -79.930704, "speed": 68, "timestamp": 1700000000 }

---

## 3.2 Authentication Service (Express.js)

Responsibilities:

- Validate credentials.
- Issue JWT token.

### JWT Example

{ "sub": "bus-500", "routeId": "R12", "direction": "FORWARD", "exp": 1700000000 }

JWT is used to authenticate MQTT connections.

---

## 3.3 MQTT Broker (EMQX)

Requirements:

- TLS enabled (port 8883).
- JWT authentication enabled.
- Topic ACL rules:
  - A bus may only publish to: gps/{routeId}/{direction}/{busId}

---

# 4. Route Geometry

Routes are stored as coordinate arrays.

Example:

\[ { "latitude": 8.531383, "longitude": -79.930704 }, { "latitude":
8.530957, "longitude": -79.931253 }\]

Stored once per direction:

route:shape:{routeId}:FORWARD route:shape:{routeId}:BACKWARD

Routes are generated using Google Routes API with:

- polylineEncoding: GEO_JSON_LINESTRING
- FieldMask: routes.polyline.geoJsonLinestring

---

# 5. MQTT Ingestion Service (Node.js)

This is the core processing engine.

Subscribes to:

gps/+/+/+

For each GPS message:

1.  Validate topic.
2.  Extract routeId, direction, busId.
3.  Load route geometry.
4.  Project GPS point onto route.
5.  Calculate:
    - distanceAlongRoute (meters)
    - progress (0.0 → 1.0)
6.  Update KeyDB.
7.  Compute neighbors (3 ahead / 3 behind).
8.  Emit WebSocket update.

---

# 6. Projection Algorithm

Function:

projectToRoute(lat, lng, routeGeometry)

Returns:

{ "distanceMeters": 45231, "progress": 0.42 }

Algorithm Steps:

1.  Iterate over all route segments.
2.  Compute perpendicular projection to each segment.
3.  Select closest segment.
4.  Calculate cumulative distance from route start.
5.  Normalize by total route length.

---

# 7. Real-Time State (KeyDB)

KeyDB is used as the real-time state store.

Sorted Set Per Route Direction:

route:{routeId}:{direction}

Update Bus Position:

ZADD route:R12:FORWARD progress bus-500

Buses are automatically sorted by route progress.

---

# 8. Neighbor Calculation

Step 1 --- Get Rank:

ZRANK route:R12:FORWARD bus-500

Step 2 --- Get 3 Ahead:

ZRANGE key rank+1 rank+3

Step 3 --- Get 3 Behind:

ZRANGE key rank-3 rank-1

Time complexity: O(log n)

Works efficiently for 1000+ buses.

---

# 9. WebSocket Layer

When a bus updates:

Emit to:

route:{routeId}:{direction}

WebSocket Payload:

{ "busId": "bus-500", "progress": 0.42, "distanceMeters": 45231,
"ahead": \[...\], "behind": \[...\] }

Passenger apps subscribe per route.

---

# 10. Security

- MQTT uses TLS (mqtts://).
- JWT required for MQTT connection.
- EMQX validates token.
- ACL ensures topic isolation.
- HTTP authentication separate from MQTT.

---

# 11. Scaling Strategy

To scale:

- Multiple ingestion service instances.
- Multiple WebSocket instances.
- KeyDB cluster if needed.
- EMQX clustering.
- Horizontal scaling behind load balancer.

---

# 12. Expected Capabilities

- 1000+ buses per route.
- Bidirectional routes.
- Real-time ordering.
- O(log n) neighbor lookup.
- Distance and ETA calculation.
- Secure communication.
- Horizontal scalability.

---

# End Goal

A production-ready, event-driven, scalable real-time fleet tracking
platform.
