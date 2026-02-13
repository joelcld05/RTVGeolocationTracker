# bus_riders_ws

WebSocket server for realtime bus updates. It consumes KeyDB pub/sub events and rebuilds minimal payloads from Redis state.

## Requirements

- Node.js 18+
- KeyDB (or Redis-compatible) server

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## WebSocket Channels

- Bus-specific: `bus:{busId}`
- Route-specific: `route:{routeId}:{direction}`
- Admin (optional): `system:alerts`

Direction must be `FORWARD` or `BACKWARD`.

## Auth Model

JWT is required by default. Claims used:

```
{
  "sub": "BUS_500",
  "routeId": "R12",
  "direction": "FORWARD"
}
```

Rules:

- `bus:{busId}` requires `sub == busId`
- `route:{routeId}:{direction}` requires `routeId` + `direction` to match
- `system:alerts` requires `role=admin|system` or `scope` containing `system:alerts`

## Client Protocol

Send JSON messages:

- Authenticate:

```json
{ "type": "auth", "token": "<jwt>" }
```

- Subscribe:

```json
{ "type": "subscribe", "channel": "bus:BUS_500" }
```

- Unsubscribe:

```json
{ "type": "unsubscribe", "channel": "route:R12:FORWARD" }
```

Server pushes payloads as:

```json
{ "channel": "bus:BUS_500", "data": { /* payload */ } }
```

## Payloads

Bus channel payload:

```json
{
  "busId": "BUS_500",
  "position": { "lat": 8.9824, "lng": -79.5199 },
  "progress": 0.52,
  "distanceMeters": 8421.44,
  "deviationMeters": 6.3,
  "speed": 54,
  "isOffTrack": false,
  "tripStatus": "IN_ROUTE",
  "arrivalTimestamp": null,
  "neighbors": {
    "ahead": [{ "busId": "BUS_732", "distanceMeters": 300, "etaSeconds": 20 }],
    "behind": [{ "busId": "BUS_210", "distanceMeters": 240, "etaSeconds": 16 }]
  },
  "timestamp": 1706184200000
}
```

Clients infer offline buses by missing updates (Redis TTL handles cleanup). No explicit offline events are sent.

Route channel payload:

```json
{
  "busId": "BUS_500",
  "routeId": "R12",
  "direction": "FORWARD",
  "lat": 8.9824,
  "lng": -79.5199,
  "progress": 0.52,
  "distanceMeters": 8421.44,
  "deviationMeters": 6.3,
  "speed": 54,
  "isOffTrack": false,
  "tripStatus": "IN_ROUTE",
  "arrivalTimestamp": null,
  "ahead": [{ "busId": "BUS_732", "distanceMeters": 300, "etaSeconds": 20 }],
  "behind": [{ "busId": "BUS_210", "distanceMeters": 240, "etaSeconds": 16 }],
  "timestamp": 1706184200000
}
```

## Redis Data Model

The server reads state from these keys:

- `route:{routeId}:{direction}` (ZSET) -> progress scores
- `route:length:{routeId}:{direction}` (STRING) -> route total meters
- `bus:{busId}` (HASH) -> last bus state

It listens for pub/sub events on `WS_EVENT_PATTERN` (default `ws:bus:*`).

## Environment

- `WS_HOST`: Host interface to bind (default `0.0.0.0`)
- `WS_PORT`: Port to listen on (default `8081`)
- `WS_REQUIRE_AUTH`: Require JWT auth (default `true`)
- `WS_AUTH_TIMEOUT_MS`: Time to wait for auth (default `5000`)
- `WS_ALLOWED_ORIGINS`: Comma-separated allowed origins (optional)
- `WS_NEIGHBOR_COUNT`: Neighbor count (default `3`)
- `WS_EVENT_PATTERN`: Redis pub/sub pattern for updates (default `ws:bus:*`)
- `WS_PING_INTERVAL_MS`: Ping interval (default `25000`)
- `JWT_SECRET`: HMAC secret for JWT verification
- `JWT_PUBLIC_KEY`: Public key for JWT verification (optional, overrides secret)
- `JWT_ALGORITHMS`: Comma-separated algorithms (default `HS256`)
- `JWT_AUDIENCE`: Optional JWT audience
- `JWT_ISSUER`: Optional JWT issuer
- `KEYDB_URL`: KeyDB connection URL
- `KEYDB_CLIENT_NAME`: Optional client name in KeyDB
