# bus_riders_mqtt

MQTT ingestion service that connects to a broker (using mqtt.js), validates GPS messages, map-matches progress, and writes state into KeyDB for realtime consumers.

## Requirements

- Node.js 18+
- MQTT broker
- KeyDB (or Redis-compatible) server

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Topic Design

GPS publish topic:

```
gps/{routeId}/{direction}/{busId}
```

Examples:

```
gps/R12/FORWARD/BUS_500
gps/R12/BACKWARD/BUS_732
```

Direction must be `FORWARD` or `BACKWARD`. Wildcards are rejected.

## Payload

```json
{
  "lat": 8.9824,
  "lng": -79.5199,
  "speed": 54,
  "heading": 92,
  "timestamp": 1706184200000
}
```

## Processing Pipeline

MQTT -> GPS ingestion -> Normalized event -> Realtime processor -> KeyDB -> WebSocket pub/sub

## Environment

- `MQTT_HOST`: Broker host (fallback for `MQTT_BROKER_URL`)
- `MQTT_PORT`: Broker port (fallback for `MQTT_BROKER_URL`)
- `MQTT_BROKER_URL`: Full broker URL (e.g. `mqtt://host:1883`)
- `MQTT_CLIENT_ID`: Client ID used by the ingestion service
- `MQTT_USERNAME`: Broker username (optional)
- `MQTT_PASSWORD`: Broker password or token (optional)
- `MQTT_SUBSCRIBE_TOPIC`: Topic filter (default `gps/+/+/+`)
- `MQTT_SUBSCRIBE_QOS`: Subscribe QoS (default `0`)
- `MQTT_KEEPALIVE`: Keepalive seconds (default `60`)
- `MQTT_RECONNECT_PERIOD_MS`: Reconnect delay in ms (default `1000`)
- `KEYDB_URL`: KeyDB connection URL
- `KEYDB_CLIENT_NAME`: Optional client name in KeyDB
- `KEYDB_MESSAGE_HISTORY`: Max message entries per bus list
- `KEYDB_MESSAGE_TTL_SECONDS`: TTL for message keys (0 disables)
- `BUS_STATE_TTL_SECONDS`: TTL for bus state hashes (default `15`)
- `ROUTE_CACHE_TTL_MS`: Cache TTL for route shapes (default `300000`)

## Route Geometry (optional)

If `route:shape:{routeId}:{direction}` is present in KeyDB, it should be a JSON array of points:

```
[[8.9824, -79.5199], [8.9830, -79.5203]]
```

or:

```
[{"lat": 8.9824, "lng": -79.5199}, {"lat": 8.9830, "lng": -79.5203}]
```

When present, the service map-matches GPS updates to compute `progress` (0-1). If missing, progress defaults to `0`.
If you store `route:length:{routeId}:{direction}` (meters), neighbor distance/ETA estimates use that value when no shape exists.

## Stored Keys

- `mqtt:messages:{busId}`: List of recent messages per bus
- `mqtt:last:{busId}:{topic}`: Last message per bus/topic
- `route:{routeId}:{direction}`: Sorted set of bus progress by route
- `bus:{busId}`: Hash of last known bus state
- `ws:bus:{busId}`: Pub/sub channel for bus updates
- `ws:route:{routeId}:{direction}`: Pub/sub channel for route updates
