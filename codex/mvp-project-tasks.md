# MVP Tasks - Real-Time Bus Tracking System

This checklist is based on:

- `codex/bus-realtime-system.md`
- `codex/mqtt-service-role.md`
- `codex/websocket-service-role.md`
- `codex/neighbor-calculation.md`

Audit status updated from current codebase on `2026-02-13`:
- App: `bus_riders_app`
- Backend: `bus_riders_backend`
- MQTT: `bus_riders_mqtt`
- WebSocket: `bus_riders_ws`

## 1. Lock MVP Scope

- [ ] Confirm MVP actors: `Bus mobile app`, `Passenger/Admin client`, `Backend operators`.
- [x] Confirm MVP route model: predefined routes with `FORWARD` and `BACKWARD`.
- [ ] Confirm MVP outcomes:
  - [ ] Bus publishes GPS every `2-5s`.
  - [ ] System computes `progress` + `distanceAlongRoute`.
  - [x] System returns `3 ahead` + `3 behind`.
  - [ ] Clients receive live updates by route+direction channel.
- [ ] Mark out-of-scope items for later (Kafka/Mongo history, anomaly detection, playback, delta updates).

## 2. Define Contracts (Single Source of Truth)

- [x] Define MQTT topic contract: `gps/{routeId}/{direction}/{busId}`.
- [x] Define accepted `direction` enum: `FORWARD | BACKWARD`.
- [ ] Define GPS payload schema:
  - [x] `lat` (number)
  - [x] `lng` (number)
  - [x] `speed` (number, optional default)
  - [ ] `timestamp` (unix or ms, choose one and document)
- [x] Define WebSocket channel contract: `route:{routeId}:{direction}`.
- [ ] Define WebSocket outbound payload schema:
  - [x] `busId`
  - [x] `progress`
  - [x] `distanceMeters`
  - [x] `ahead[]`
  - [x] `behind[]`
  - [x] `timestamp`
- [ ] Publish these contracts in one shared doc for app + backend teams.
- [ ] Align contract naming across docs and services:
  - [ ] Route ordering key: contract uses `route:{routeId}:{direction}:buses`, code uses `route:{routeId}:{direction}`.
  - [ ] Geometry key: docs use `route:{routeId}:{direction}:geometry`, code uses `route:shape:{routeId}:{direction}`.

## 3. Provision Core Infrastructure

- [x] Deploy/configure `EMQX` for MQTT.
  - [ ] Enable TLS (`mqtts://`, port `8883`).
  - [x] Enable JWT auth.
  - [x] Configure ACL so each bus can only publish to its own topic path.
- [x] Deploy/configure `KeyDB` (or Redis-compatible) for real-time state.
- [x] Provision runtime envs for `MQTT Ingestion Service` and `WebSocket Service`.
- [ ] Configure secrets management for JWT keys/certs/connection URLs.
- [ ] Add `backend` service to `docker-compose.yaml` (currently commented out).
- [ ] Replace hardcoded local IPs/secrets in app/backend/service envs with environment-specific config.

## 4. Prepare Route Geometry Data

- [ ] Build/import route geometry per route+direction.
- [ ] Generate geometry using Google Routes API format (`GEO_JSON_LINESTRING`) if needed.
- [ ] Store geometry keys:
  - [ ] `route:{routeId}:FORWARD:geometry`
  - [ ] `route:{routeId}:BACKWARD:geometry`
- [ ] Add validation for minimum geometry quality (enough points, valid lat/lng).
- [x] Implement backend -> KeyDB route sync:
  - [x] Write `route:shape:{routeId}:{direction}` for each active route.
  - [x] Write `route:length:{routeId}:{direction}` in meters.
  - [x] Refresh/update keys when route geometry changes.

## 5. Build MQTT Ingestion Service

- [x] Create service that subscribes to `gps/+/+/+`.
- [x] Implement topic parser + validator.
- [x] Implement payload validator + safe parsing.
- [x] Load route geometry by `routeId + direction`.
- [x] Implement `projectToRoute(lat, lng, routeGeometry)`:
  - [x] nearest segment projection
  - [x] cumulative distance from route start
  - [x] normalized `progress` (`0..1`)
- [x] Persist bus ordering in KeyDB.
  - [ ] Align key naming to contract (`:buses` suffix).
- [x] Persist bus telemetry snapshot (optional MVP but recommended for client details).
- [ ] Handle invalid/out-of-route messages gracefully (drop + log).
- [ ] Add explicit out-of-route deviation threshold + event logging.
- [ ] Add stale bus cleanup in route sorted sets when bus state expires.
- [ ] Add MQTT service health/readiness endpoint.

## 6. Implement Neighbor Calculation

- [x] For each processed bus update, get rank.
- [x] Query ahead neighbors.
- [x] Query behind neighbors.
- [x] Include neighbor distance computation (from progress and route total length).
- [x] Ensure direction isolation (`FORWARD` and `BACKWARD` never mixed).

## 7. Build WebSocket Service

- [x] Stand up WebSocket server as a stateless service.
- [x] Implement JWT validation on connection.
- [x] Implement route-channel subscription with authorization checks.
- [x] Accept/consume processed updates from ingestion layer.
- [x] Broadcast updates to `route:{routeId}:{direction}` subscribers.
- [x] Implement disconnect handling + reconnection-safe behavior.
- [x] Align route-channel payload with MVP contract:
  - [x] Include `neighbors` and neighbor distance data.
  - [x] Include `timestamp`.
- [ ] Add WebSocket service-side rate limiting / max message size protections.

## 8. Integrate Bus Mobile App (Publisher)

- [x] Ensure bus authentication returns JWT with `sub`, `routeId`, `direction`, `exp`.
- [ ] Connect app to EMQX over TLS.
- [ ] Publish GPS every `2-5s` to exact topic format.
- [x] Add retry/backoff for unstable network.
- [x] Guard against publishing when auth/session is invalid.
- [x] Use route direction dynamically from bus/route data (currently hardcoded `FORWARD`).
- [ ] Replace hardcoded app API endpoint with env-driven config.
- [ ] Add publish cadence throttle to meet MVP interval target (`2-5s`).
- [ ] Replace free-text route registration with route picker backed by backend route catalog.

## 9. Integrate Passenger/Admin Client (Subscriber)

- [ ] Connect client to WebSocket service with JWT.
- [ ] Subscribe to selected `route:{routeId}:{direction}` channel.
- [ ] Render live bus updates on map/list.
- [ ] Show nearest `ahead` and `behind` buses with distances.
- [ ] Handle reconnect and stale-state refresh.
- [ ] Decide implementation target for subscriber client (`bus_riders_app` vs dedicated web/admin app).

## 10. Security Hardening (MVP Minimum)

- [ ] Enforce TLS for MQTT and secure transport for WebSocket.
- [ ] Validate JWT signature + expiration at all relevant layers.
- [ ] Enforce route/topic/channel authorization checks.
- [ ] Add input validation and payload size limits.
- [ ] Add optional rate limiting for abusive clients/devices.
- [x] WebSocket JWT validation and channel authorization are implemented.
- [x] Configure EMQX JWT auth + ACL rules to enforce publish permissions at broker level.
- [ ] Ensure `JWT_SECRET`/`JWT_PUBLIC_KEY` are not hardcoded in committed env files.

## 11. Reliability and Observability

- [ ] Structured logs across ingestion + websocket services.
- [ ] Metrics:
  - [ ] messages/sec
  - [ ] processing latency
  - [ ] websocket fanout latency
  - [ ] connected clients
  - [ ] invalid message rate
- [ ] Health checks/readiness probes for each service.
- [ ] Alerting for broker/service/keydb failures.
- [x] WebSocket `/health` endpoint exists.
- [ ] Add MQTT health endpoint and standardized JSON health payload.
- [ ] Add Prometheus/OpenTelemetry metrics for MQTT and WebSocket services.

## 12. MVP Validation (Go/No-Go)

- [ ] Functional tests:
  - [ ] GPS update -> projection -> ordering -> neighbors -> websocket broadcast.
- [ ] Load test baseline:
  - [ ] target `1000+ buses/route` with acceptable latency.
- [ ] Security checks:
  - [x] unauthorized publish blocked
  - [x] unauthorized websocket subscribe blocked
- [ ] End-to-end demo scenario:
  - [ ] bus movement reflected live in passenger/admin client.
- [ ] Production readiness checklist signed by backend + app owners.
- [ ] Add automated integration tests for:
  - [ ] topic parsing + payload validation
  - [ ] projection + neighbor calculations
  - [ ] websocket auth and route authorization

## 13. MVP Launch Sequence

- [ ] Launch infrastructure in production-like environment.
- [ ] Deploy ingestion and websocket services.
- [ ] Run smoke tests with test buses.
- [ ] Gradually onboard real buses/routes.
- [ ] Monitor metrics/logs and tune scaling as needed.

---

## Definition of MVP Done

- [ ] Real-time bus updates flow from mobile publisher to clients in milliseconds/low latency.
- [ ] Per route+direction bus ordering is correct.
- [ ] `3 ahead / 3 behind` is accurate and stable.
- [ ] Security controls (JWT + ACL + TLS) are active.
- [ ] System operates reliably at initial target scale.
