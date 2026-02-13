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

- [ ] Confirm MVP actors: `Bus mobile app`, `Passenger client`, `Route Admin Backoffice`, `Backend operators`.
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
- [x] Define GPS payload schema:
  - [x] `lat` (number)
  - [x] `lng` (number)
  - [x] `speed` (number, optional default)
  - [x] `timestamp` (Unix epoch milliseconds, e.g. `Date.now()`)
  - [x] `heading` (number, optional)
- [x] Define WebSocket channel contract: `route:{routeId}:{direction}`.
- [x] Define WebSocket outbound payload schema:
  - [x] `busId`
  - [x] `routeId`
  - [x] `direction`
  - [x] `lat`
  - [x] `lng`
  - [x] `progress`
  - [x] `distanceMeters`
  - [x] `speed`
  - [x] `ahead[]`
  - [x] `behind[]`
  - [x] `timestamp` (Unix epoch milliseconds)
  - [x] `isOffTrack` (boolean)
  - [ ] `tripStatus` (`IN_ROUTE | ARRIVED`)
  - [ ] `arrivalTimestamp` (Unix epoch milliseconds, nullable)
- [ ] Publish these contracts in one shared doc for app + backend teams.
- [ ] Align contract naming across docs and services:
  - [x] Route ordering key canonicalized to `route:{routeId}:{direction}` (no `:buses` suffix).
  - [x] Geometry key canonicalized to `route:shape:{routeId}:{direction}`.
  - [x] Update legacy docs/examples still using `route:{routeId}:{direction}:buses` and `route:{routeId}:{direction}:geometry`.

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
  - [ ] `route:shape:{routeId}:FORWARD`
  - [ ] `route:shape:{routeId}:BACKWARD`
- [ ] Add validation for minimum geometry quality (enough points, valid lat/lng).
- [ ] Define end-of-route arrival polygon per route+direction.
  - [ ] Store key `route:endzone:{routeId}:{direction}` as polygon coordinates.
  - [ ] Validate polygon quality (>= 3 points, valid lat/lng, non-degenerate area).
  - [ ] Document polygon source (manual draw or derived from route terminal).
- [x] Implement backend -> KeyDB route sync:
  - [x] Write `route:shape:{routeId}:{direction}` for each active route.
  - [x] Write `route:length:{routeId}:{direction}` in meters.
  - [x] Write `route:endzone:{routeId}:{direction}` for each active route-direction.
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
  - [x] Use contract key `route:{routeId}:{direction}` (no `:buses` suffix).
- [x] Persist bus telemetry snapshot (optional MVP but recommended for client details).
- [ ] Handle invalid/out-of-route messages gracefully (drop + log).
  - [ ] Classify reject reasons (`invalid_topic`, `invalid_payload`, `stale_timestamp`, `projection_error`, `missing_route_shape`).
  - [ ] Log structured reject events with `busId`, `routeId`, `direction`, and reason code.
  - [ ] Ensure single-message failures never crash the ingestion loop.
- [ ] Add explicit out-of-route deviation threshold + event logging.
  - [ ] Add config `OFFTRACK_DISTANCE_THRESHOLD_METERS` (default `50`).
  - [ ] Add config `OFFTRACK_RECOVERY_THRESHOLD_METERS` (default `35`) to avoid off-track flapping.
  - [ ] Emit transition logs only (`on_track -> off_track`, `off_track -> on_track`).
- [ ] Determine and persist `isOffTrack` per bus using route distance threshold, and emit status in real-time updates.
  - [ ] Extend projection output to include route deviation in meters.
  - [ ] Persist bus fields: `isOffTrack`, `offTrackSinceTs`, `deviationMeters`.
  - [ ] Include `isOffTrack` in both bus and route realtime payloads.
- [ ] Detect end-of-route arrival using terminal polygon and update bus status.
  - [ ] Implement point-in-polygon check against `route:endzone:{routeId}:{direction}`.
  - [ ] Add arrival gating (recommended): `progress >= 0.97` AND inside polygon.
  - [ ] Add anti-flapping hysteresis (recommended): require `ARRIVAL_DWELL_MS` before `ARRIVED`.
  - [ ] Add optional speed guard (recommended): `speed <= ARRIVAL_MAX_SPEED_KMH` when marking arrival.
  - [ ] Persist status fields in bus state: `tripStatus`, `arrivalTimestamp`, `arrivalZoneHitCount`.
  - [ ] Emit status transition logs/events (`IN_ROUTE -> ARRIVED`, `ARRIVED -> IN_ROUTE`).
- [ ] Reset arrival status when a new trip starts.
  - [ ] Clear `ARRIVED` when bus exits end-zone for configured duration.
  - [ ] Clear `ARRIVED` when progress indicates restart near route origin (new cycle).
- [ ] Add stale bus cleanup in route sorted sets when bus state expires.
  - [ ] Remove stale bus IDs from `route:{routeId}:{direction}` when `bus:{busId}` key is expired/missing.
  - [ ] Add periodic sweep job with configurable interval (`STALE_BUS_SWEEP_MS`).
  - [ ] Remove bus from previous route-direction key when route assignment changes.
- [ ] Add MQTT service health/readiness endpoint.
  - [ ] Add `/health` endpoint with MQTT connection + KeyDB connectivity status.
  - [ ] Add `/ready` endpoint that requires active MQTT subscription and KeyDB write/read check.

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
- [ ] Include `isOffTrack` in route-channel payload.
- [ ] Include `tripStatus` and `arrivalTimestamp` in route-channel payload.
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

## 9. Integrate Passenger Client (Subscriber)

- [ ] Connect client to WebSocket service with JWT.
- [ ] Subscribe to selected `route:{routeId}:{direction}` channel.
- [ ] Render live bus updates on map/list.
- [ ] Show nearest `ahead` and `behind` buses with distances.
- [ ] Show current map location of each neighbor bus (`ahead`/`behind`) for bus riders.
- [ ] Handle reconnect and stale-state refresh.
- [x] Decide implementation target for admin subscriber client: dedicated React backoffice app.

## 9A. Build Route Admin Backoffice (React)

- [ ] Create new React app for route admins (`route_admin_backoffice`) with TypeScript + Vite.
- [ ] Define backoffice routing structure (`/login`, `/dashboard`, `/routes/:routeId`).
- [ ] Add environment config for API and WebSocket URLs (dev/stage/prod).
- [ ] Choose and integrate map stack (Mapbox GL or Leaflet) for real-time bus visualization.
- [ ] Implement route-admin authentication flow (login + logout + token refresh).
- [ ] Enforce role-based access for `ROUTE_ADMIN` users only.
- [ ] Restrict route visibility so each admin can only access assigned routes.
- [ ] Build route selector UI (assigned routes only).
- [ ] Build direction filter/toggle (`FORWARD`, `BACKWARD`, `BOTH`).
- [ ] Add initial snapshot API call to fetch all active buses for selected route+direction.
- [ ] Connect to WebSocket service with JWT and subscribe to route channels.
- [ ] Support dual subscription when `BOTH` directions are selected.
- [ ] Maintain in-memory bus store keyed by `busId` with latest telemetry.
- [ ] Render all buses from the selected route as map markers with last-known location.
- [ ] Draw route geometry polyline(s) on the map for selected direction(s).
- [ ] Show per-bus details panel (`busId`, `speed`, `progress`, `lastUpdate`, `direction`, `tripStatus`).
- [ ] Mark stale buses (no update after threshold, e.g., `>15s`) with visual status.
- [ ] Visually mark buses with `tripStatus=ARRIVED` on map/list and show `arrivalTimestamp`.
- [ ] Implement reconnect/resubscribe and snapshot re-sync after disconnect.
- [ ] Handle duplicate/out-of-order updates using event `timestamp`.
- [ ] Add loading/empty/error states for auth, route fetch, snapshot, and socket status.
- [ ] Add telemetry/observability in frontend (connection state, subscribe errors, stale counts).
- [ ] Add unit tests for state management (bus merge, stale detection, direction filters).
- [ ] Add integration/E2E tests for login, route selection, live map updates, reconnect.
- [ ] Add build/deploy pipeline for the backoffice (artifact build + environment promotion).

### Step 3 Definition (Execution Phase): Admin Backoffice Vertical Slice

- [ ] Step 3 goal: route admin can log in and see all buses in an assigned route updating live on map.
- [ ] Scaffold app + runtime config:
  - [ ] Create `route_admin_backoffice` (React + TypeScript + Vite).
  - [ ] Configure environment variables for API + WebSocket endpoints.
- [ ] Auth + access control:
  - [ ] Implement login/logout with JWT persistence and refresh handling.
  - [ ] Enforce `ROUTE_ADMIN` role and route assignment restrictions.
- [ ] Route monitoring UI:
  - [ ] Build assigned-route selector and direction toggle (`FORWARD`/`BACKWARD`/`BOTH`).
  - [ ] Fetch initial snapshot of active buses for selected route+direction.
  - [ ] Connect to WebSocket and subscribe to route channel(s), including dual subscription for `BOTH`.
- [ ] Real-time map state:
  - [ ] Maintain bus store keyed by `busId` and merge updates by latest `timestamp`.
  - [ ] Render all route buses as map markers with route polyline overlay.
  - [ ] Show per-bus status (`speed`, `progress`, `lastUpdate`, `isOffTrack`).
  - [ ] Mark stale buses (`>15s`) and perform reconnect + re-sync on disconnect.
- [ ] Step 3 exit criteria:
  - [ ] Admin sees all active buses for assigned route update within a few seconds on every movement event.
  - [ ] `isOffTrack` is visible in bus details/status on the backoffice.

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
  - [ ] off-track transition rate
  - [ ] stale-message reject rate
  - [ ] projection error rate
  - [ ] arrival transition rate (`IN_ROUTE -> ARRIVED`)
  - [ ] arrival false-positive rate (arrived then reset within short window)
- [ ] Health checks/readiness probes for each service.
- [ ] Alerting for broker/service/keydb failures.
- [x] WebSocket `/health` endpoint exists.
- [ ] Add MQTT health endpoint and standardized JSON health payload.
- [ ] Add Prometheus/OpenTelemetry metrics for MQTT and WebSocket services.

## 12. MVP Validation (Go/No-Go)

- [ ] Functional tests:
  - [ ] GPS update -> projection -> ordering -> neighbors -> websocket broadcast.
  - [ ] Bus is flagged `isOffTrack=true` when route deviation exceeds configured threshold.
  - [ ] Bus returns to `isOffTrack=false` only after crossing recovery threshold.
  - [ ] Bus is flagged `tripStatus=ARRIVED` only after entering end polygon and meeting dwell/gate rules.
  - [ ] Bus is not flagged `ARRIVED` by brief GPS spike into polygon.
  - [ ] Bus resets from `ARRIVED` to `IN_ROUTE` on new trip/restart conditions.
  - [ ] Invalid/stale GPS messages are rejected and logged with reason code.
  - [ ] Stale bus entries are removed from route ordering after TTL/sweep.
  - [ ] Route admin sees all active buses for an assigned route update live on the backoffice map.
- [ ] Load test baseline:
  - [ ] target `1000+ buses/route` with acceptable latency.
- [ ] Security checks:
  - [x] unauthorized publish blocked
  - [x] unauthorized websocket subscribe blocked
- [ ] End-to-end demo scenario:
  - [ ] bus movement reflected live in passenger/admin client.
  - [ ] route admin login -> route select -> all route buses visible and updating in real time.
- [ ] Production readiness checklist signed by backend + app owners.
- [ ] Add automated integration tests for:
  - [ ] topic parsing + payload validation
  - [ ] projection + neighbor calculations
  - [ ] off-track threshold + recovery behavior
  - [ ] arrival polygon + dwell/hysteresis behavior
  - [ ] stale cleanup job behavior
  - [ ] mqtt health/readiness endpoints
  - [ ] websocket auth and route authorization

### Step 4 Definition (Execution Phase): Validation and Go/No-Go Gate

- [ ] Step 4 goal: verify off-track/reliability and admin backoffice behavior before launch sequence.
- [ ] Contract conformance checks:
  - [ ] Confirm route-channel payload includes `routeId`, `direction`, `lat`, `lng`, `timestamp`, `isOffTrack`, `tripStatus`, `arrivalTimestamp`.
  - [ ] Confirm timestamp format is Unix epoch milliseconds across publish/store/broadcast.
- [ ] Functional validation:
  - [ ] Simulate normal movement for multiple buses in same route; verify all appear and update live in admin map.
  - [ ] Simulate off-track deviation and recovery; verify `isOffTrack` transition behavior and logs.
  - [ ] Simulate end-of-route arrival; verify `tripStatus=ARRIVED` only after polygon + dwell conditions.
  - [ ] Simulate stale bus; verify stale cleanup removes route ordering artifacts.
- [ ] Reliability validation:
  - [ ] Send invalid/stale payloads; verify reject reason metrics and structured logs.
  - [ ] Verify ingestion continues processing after malformed messages (no consumer crash).
  - [ ] Verify MQTT `/health` and `/ready` endpoint behavior under healthy and degraded dependencies.
- [ ] Security and access validation:
  - [ ] Verify route admin cannot subscribe to unassigned routes/directions.
  - [ ] Verify unauthorized users cannot access backoffice route channels.
- [ ] Step 4 exit criteria:
  - [ ] Functional + integration checks pass for off-track, arrival detection, stale cleanup, and admin live-map visibility.
  - [ ] Backend and frontend owners sign off on MVP readiness.

### Step 5 Definition (Execution Phase): Arrival Geofence and Arrived Status

- [ ] Step 5 goal: accurately mark a bus as `ARRIVED` when it reaches route terminal zone.
- [ ] Recommended detection strategy:
  - [ ] Geofence: polygon per `routeId+direction` (`route:endzone:{routeId}:{direction}`).
  - [ ] Gate: require `progress >= 0.97` to prevent early-terminal false positives.
  - [ ] Stability: require dwell time inside polygon (`ARRIVAL_DWELL_MS`, e.g. `10000`).
  - [ ] Optional speed gate: only mark arrival when `speed <= ARRIVAL_MAX_SPEED_KMH` (e.g. `8`).
- [ ] State and contract updates:
  - [ ] Persist `tripStatus` and `arrivalTimestamp` in `bus:{busId}`.
  - [ ] Broadcast `tripStatus` and `arrivalTimestamp` in route updates.
  - [ ] Show `ARRIVED` status in admin backoffice map/list and bus details.
- [ ] Step 5 exit criteria:
  - [ ] Arrival transitions are deterministic across repeated runs and noisy GPS samples.
  - [ ] False positives are below agreed MVP threshold in replay/simulation tests.

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
- [ ] Route admins can see current location of all buses assigned to the same route in the React backoffice.
- [ ] Buses are marked `ARRIVED` accurately at route terminal polygon with low false positives.
- [ ] Security controls (JWT + ACL + TLS) are active.
- [ ] System operates reliably at initial target scale.
