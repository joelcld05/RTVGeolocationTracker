import http from "http";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import jwt, { JwtPayload, VerifyOptions } from "jsonwebtoken";
import Redis from "ioredis";
import { WebSocketServer, WebSocket, RawData } from "ws";

dotenv.config();

type WsClient = {
  id: string;
  socket: WebSocket;
  auth?: JwtPayload;
  subscriptions: Set<string>;
  authTimer?: NodeJS.Timeout;
  isAlive: boolean;
};

type BusState = {
  busId: string;
  routeId: string;
  direction: string;
  lat: number;
  lng: number;
  progress: number;
  deviationMeters: number | null;
  speed: number;
  isOffTrack: boolean;
  tripStatus: "IN_ROUTE" | "ARRIVED";
  arrivalTimestamp: number | null;
  timestamp: number;
};

type NeighborIdResult = {
  ahead: string[];
  behind: string[];
};

type NeighborDetail = {
  busId: string;
  distanceMeters: number | null;
  etaSeconds: number | null;
};

type NeighborResult = {
  ahead: NeighborDetail[];
  behind: NeighborDetail[];
};

type BusPayload = {
  busId: string;
  position: { lat: number; lng: number };
  progress: number;
  distanceMeters: number | null;
  deviationMeters: number | null;
  speed: number;
  isOffTrack: boolean;
  tripStatus: "IN_ROUTE" | "ARRIVED";
  arrivalTimestamp: number | null;
  neighbors: NeighborResult;
  timestamp: number;
};

type RoutePayload = {
  busId: string;
  routeId: string;
  direction: string;
  lat: number;
  lng: number;
  progress: number;
  distanceMeters: number | null;
  deviationMeters: number | null;
  speed: number;
  isOffTrack: boolean;
  tripStatus: "IN_ROUTE" | "ARRIVED";
  arrivalTimestamp: number | null;
  ahead: NeighborDetail[];
  behind: NeighborDetail[];
  timestamp: number;
};

type ChannelInfo =
  | { kind: "bus"; busId: string }
  | { kind: "route"; routeId: string; direction: string }
  | { kind: "adminRoute"; routeId: string; direction: string }
  | { kind: "system"; name: "alerts" };

const wsHost = process.env.WS_HOST ?? "0.0.0.0";
const wsPort = Number.parseInt(process.env.WS_PORT ?? "8081", 10);
const requireAuth =
  (process.env.WS_REQUIRE_AUTH ?? "true").toLowerCase() !== "false";
const authTimeoutMs = Number.parseInt(
  process.env.WS_AUTH_TIMEOUT_MS ?? "5000",
  10,
);
const neighborCount = Number.parseInt(process.env.WS_NEIGHBOR_COUNT ?? "3", 10);
const eventPattern = process.env.WS_EVENT_PATTERN ?? "ws:bus:*";
const pingIntervalMs = Number.parseInt(
  process.env.WS_PING_INTERVAL_MS ?? "25000",
  10,
);

const allowedOrigins = (process.env.WS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const jwtSecret = process.env.JWT_SECRET;
const jwtPublicKey = process.env.JWT_PUBLIC_KEY;
const jwtAlgorithms = (process.env.JWT_ALGORITHMS ?? "HS256")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const usesHmacJwt = jwtAlgorithms.some((algorithm) =>
  algorithm.toUpperCase().startsWith("HS"),
);

const jwtVerifyOptions: VerifyOptions = { algorithms: jwtAlgorithms as any };
if (process.env.JWT_AUDIENCE)
  jwtVerifyOptions.audience = process.env.JWT_AUDIENCE;
if (process.env.JWT_ISSUER) jwtVerifyOptions.issuer = process.env.JWT_ISSUER;

const jwtKey = usesHmacJwt
  ? (jwtSecret ?? jwtPublicKey)
  : (jwtPublicKey ?? jwtSecret);
if (!jwtKey) {
  console.error("Missing JWT_SECRET or JWT_PUBLIC_KEY");
  process.exit(1);
}

const keydbUrl = process.env.KEYDB_URL ?? "redis://127.0.0.1:6379";
const keydbClientName = process.env.KEYDB_CLIENT_NAME ?? "bus_riders_ws";

const keydb = new Redis(keydbUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});
const keydbSub = new Redis(keydbUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

keydb.on("error", (error) => {
  console.error("[keydb] error", error);
  broadcastSystemAlert("error", "KeyDB error", { error: String(error) });
});

keydbSub.on("error", (error) => {
  console.error("[keydb] subscriber error", error);
  broadcastSystemAlert("error", "KeyDB subscriber error", {
    error: String(error),
  });
});

keydb
  .client("SETNAME", keydbClientName)
  .catch((error) => console.warn("[keydb] failed to set client name", error));
keydbSub
  .client("SETNAME", `${keydbClientName}:sub`)
  .catch((error) =>
    console.warn("[keydb] failed to set subscriber name", error),
  );

const allowedDirections = new Set(["FORWARD", "BACKWARD"]);
const idPattern = /^[A-Za-z0-9_-]+$/;

const clients = new Map<WebSocket, WsClient>();
const channelSubscriptions = new Map<string, Set<WebSocket>>();

type AdminRouteScopes = Set<string>;

function isValidId(value: string): boolean {
  return idPattern.test(value);
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (!raw || raw === "null") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw === "1" || raw.toLowerCase() === "true";
}

function parseChannel(channel: string): ChannelInfo | null {
  if (!channel || channel.includes("#") || channel.includes("+")) return null;

  const [kind, ...parts] = channel.split(":");
  if (kind === "bus" && parts.length === 1) {
    const busId = parts[0];
    if (!busId || !isValidId(busId)) return null;
    return { kind: "bus", busId };
  }

  if (kind === "route" && parts.length === 2) {
    const [routeId, direction] = parts;
    if (!routeId || !direction || !isValidId(routeId)) return null;
    const normalizedDirection = direction.toUpperCase();
    if (
      !allowedDirections.has(normalizedDirection) ||
      normalizedDirection !== direction
    )
      return null;
    return { kind: "route", routeId, direction: normalizedDirection };
  }

  if (kind === "admin-route" && parts.length === 2) {
    const [routeId, direction] = parts;
    if (!routeId || !direction || !isValidId(routeId)) return null;
    const normalizedDirection = direction.toUpperCase();
    if (
      !allowedDirections.has(normalizedDirection) ||
      normalizedDirection !== direction
    )
      return null;
    return { kind: "adminRoute", routeId, direction: normalizedDirection };
  }

  if (kind === "system" && parts.length === 1 && parts[0] === "alerts") {
    return { kind: "system", name: "alerts" };
  }

  return null;
}

function getClaimString(auth: JwtPayload | undefined, key: string): string {
  if (!auth || !(key in auth)) return "";
  const value = auth[key as keyof JwtPayload];
  if (value === undefined || value === null) return "";
  return String(value);
}

function isAdmin(auth?: JwtPayload): boolean {
  if (!auth) return false;
  const role = getClaimString(auth, "role").toLowerCase();
  if (role === "admin" || role === "system") return true;

  const scopeRaw = auth["scope"] ?? auth["scopes"];
  if (typeof scopeRaw === "string") {
    return scopeRaw.split(" ").includes("system:alerts");
  }

  if (Array.isArray(scopeRaw)) {
    return scopeRaw.map((value) => String(value)).includes("system:alerts");
  }

  return false;
}

function parseAdminRouteScopes(auth?: JwtPayload): AdminRouteScopes | null {
  if (!auth) return null;
  const raw = auth["routeScopes"];
  if (!Array.isArray(raw)) return null;

  const parsed = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const [routeId, direction] = entry.split(":");
    if (!routeId || !direction) continue;
    const normalizedDirection = direction.toUpperCase();
    if (!allowedDirections.has(normalizedDirection)) continue;
    parsed.add(`${routeId}:${normalizedDirection}`);
  }
  return parsed;
}

function isAdminRouteAllowed(
  auth: JwtPayload,
  routeId: string,
  direction: string,
): boolean {
  const scopes = parseAdminRouteScopes(auth);
  if (scopes === null) {
    // No explicit scope claim means full admin visibility.
    return true;
  }
  return scopes.has(`${routeId}:${direction}`);
}

function authorizeSubscription(
  client: WsClient,
  channel: ChannelInfo,
): boolean {
  if (!requireAuth) return true;
  if (!client.auth) return false;

  if (channel.kind === "bus") {
    const authBusId = getClaimString(client.auth, "sub");
    const authRouteId = getClaimString(client.auth, "routeId");
    const authDirection = getClaimString(
      client.auth,
      "direction",
    ).toUpperCase();
    if (!authRouteId || !authDirection || !allowedDirections.has(authDirection))
      return false;
    return authBusId === channel.busId;
  }

  if (channel.kind === "route") {
    const authRouteId = getClaimString(client.auth, "routeId");
    const authDirection = getClaimString(
      client.auth,
      "direction",
    ).toUpperCase();
    return (
      authRouteId === channel.routeId &&
      authDirection === channel.direction &&
      allowedDirections.has(authDirection)
    );
  }

  if (channel.kind === "adminRoute") {
    if (!isAdmin(client.auth)) return false;
    return isAdminRouteAllowed(client.auth, channel.routeId, channel.direction);
  }

  if (channel.kind === "system") {
    return isAdmin(client.auth);
  }

  return false;
}

function toText(message: RawData): string {
  if (typeof message === "string") return message;
  if (Buffer.isBuffer(message)) return message.toString("utf8");
  if (Array.isArray(message)) return Buffer.concat(message).toString("utf8");
  return Buffer.from(message).toString("utf8");
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function addSubscription(client: WsClient, channel: string): void {
  let subscribers = channelSubscriptions.get(channel);
  if (!subscribers) {
    subscribers = new Set();
    channelSubscriptions.set(channel, subscribers);
  }
  subscribers.add(client.socket);
  client.subscriptions.add(channel);
}

function removeSubscription(client: WsClient, channel: string): void {
  const subscribers = channelSubscriptions.get(channel);
  if (subscribers) {
    subscribers.delete(client.socket);
    if (subscribers.size === 0) channelSubscriptions.delete(channel);
  }
  client.subscriptions.delete(channel);
}

function removeClient(client: WsClient): void {
  for (const channel of client.subscriptions) {
    removeSubscription(client, channel);
  }
  if (client.authTimer) clearTimeout(client.authTimer);
  clients.delete(client.socket);
}

function broadcast(channel: string, payload: unknown): void {
  const subscribers = channelSubscriptions.get(channel);
  if (!subscribers || subscribers.size === 0) return;

  const message = JSON.stringify({ channel, data: payload });
  for (const socket of subscribers) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}

function broadcastSystemAlert(
  level: "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>,
): void {
  const payload = {
    level,
    message,
    context: context ?? {},
    timestamp: Date.now(),
  };
  broadcast("system:alerts", payload);
}

function parseBusIdFromEvent(channel: string, message: string): string | null {
  if (channel.startsWith("ws:bus:")) {
    return channel.slice("ws:bus:".length);
  }

  if (channel.startsWith("bus:")) {
    return channel.slice("bus:".length);
  }

  try {
    const parsed = JSON.parse(message) as { busId?: string };
    if (parsed.busId && typeof parsed.busId === "string") return parsed.busId;
  } catch {
    return null;
  }

  return null;
}

async function getBusState(busId: string): Promise<BusState | null> {
  const data = await keydb.hgetall(`bus:${busId}`);
  if (!data || Object.keys(data).length === 0) return null;

  const lat = Number(data.lat);
  const lng = Number(data.lng);
  const progress = Number(data.progress);
  const deviationMeters = parseOptionalNumber(data.deviationMeters);
  const speed = Number(data.speed);
  const isOffTrack = parseBoolean(data.isOffTrack);
  const tripStatus = data.tripStatus === "ARRIVED" ? "ARRIVED" : "IN_ROUTE";
  const arrivalTimestamp = parseOptionalNumber(data.arrivalTimestamp);
  const timestamp = Number(data.timestamp);
  const routeId = data.routeId;
  const direction = data.direction?.toUpperCase();

  if (!routeId || !direction || !allowedDirections.has(direction)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (
    !Number.isFinite(progress) ||
    !Number.isFinite(speed) ||
    !Number.isFinite(timestamp)
  )
    return null;

  return {
    busId,
    routeId,
    direction,
    lat,
    lng,
    progress,
    deviationMeters,
    speed,
    isOffTrack,
    tripStatus,
    arrivalTimestamp,
    timestamp,
  };
}

async function getNeighborIds(
  routeId: string,
  direction: string,
  busId: string,
  count = 3,
): Promise<NeighborIdResult> {
  const routeKey = `route:${routeId}:${direction}`;

  const rank = await keydb.zrank(routeKey, busId);
  if (rank === null) return { ahead: [], behind: [] };

  const ahead = await keydb.zrange(routeKey, rank + 1, rank + count);
  const behind = await keydb.zrange(
    routeKey,
    Math.max(0, rank - count),
    rank - 1,
  );

  return { ahead, behind };
}

async function getRouteLengthMeters(
  routeId: string,
  direction: string,
): Promise<number | null> {
  const raw = await keydb.get(`route:length:${routeId}:${direction}`);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function calculateEta(distanceMeters: number, speedKmh: number): number | null {
  if (speedKmh <= 0) {
    return null;
  }

  const speedMs = speedKmh / 3.6;
  return Math.round(distanceMeters / speedMs);
}

async function buildNeighborDetails(
  state: BusState,
  neighborIds: string[],
  routeLengthMeters: number | null,
): Promise<NeighborDetail[]> {
  if (neighborIds.length === 0) {
    return [];
  }

  const routeKey = `route:${state.routeId}:${state.direction}`;

  const details = await Promise.all(
    neighborIds.map(async (neighborId) => {
      const score = await keydb.zscore(routeKey, neighborId);
      const progress = score === null ? null : Number(score);
      if (
        !routeLengthMeters ||
        progress === null ||
        Number.isNaN(progress) ||
        !Number.isFinite(progress)
      ) {
        return { busId: neighborId, distanceMeters: null, etaSeconds: null };
      }

      const distanceMeters =
        Math.abs(progress - state.progress) * routeLengthMeters;
      return {
        busId: neighborId,
        distanceMeters,
        etaSeconds: calculateEta(distanceMeters, state.speed),
      };
    }),
  );

  return details;
}

function buildBusPayload(
  state: BusState,
  neighbors: NeighborResult,
  distanceMeters: number | null,
): BusPayload {
  return {
    busId: state.busId,
    position: {
      lat: state.lat,
      lng: state.lng,
    },
    progress: state.progress,
    distanceMeters,
    deviationMeters: state.deviationMeters,
    speed: state.speed,
    isOffTrack: state.isOffTrack,
    tripStatus: state.tripStatus,
    arrivalTimestamp: state.arrivalTimestamp,
    neighbors,
    timestamp: state.timestamp,
  };
}

function buildRoutePayload(
  state: BusState,
  neighbors: NeighborResult,
  distanceMeters: number | null,
): RoutePayload {
  return {
    busId: state.busId,
    routeId: state.routeId,
    direction: state.direction,
    lat: state.lat,
    lng: state.lng,
    progress: state.progress,
    distanceMeters,
    deviationMeters: state.deviationMeters,
    speed: state.speed,
    isOffTrack: state.isOffTrack,
    tripStatus: state.tripStatus,
    arrivalTimestamp: state.arrivalTimestamp,
    ahead: neighbors.ahead,
    behind: neighbors.behind,
    timestamp: state.timestamp,
  };
}

function buildRouteSnapshotPayload(
  state: BusState,
  routeLengthMeters: number | null,
): RoutePayload {
  const distanceMeters = routeLengthMeters
    ? state.progress * routeLengthMeters
    : null;

  return {
    busId: state.busId,
    routeId: state.routeId,
    direction: state.direction,
    lat: state.lat,
    lng: state.lng,
    progress: state.progress,
    distanceMeters,
    deviationMeters: state.deviationMeters,
    speed: state.speed,
    isOffTrack: state.isOffTrack,
    tripStatus: state.tripStatus,
    arrivalTimestamp: state.arrivalTimestamp,
    ahead: [],
    behind: [],
    timestamp: state.timestamp,
  };
}

async function sendRouteSnapshotToClient(
  client: WsClient,
  channel: { routeId: string; direction: string },
  channelName: string,
): Promise<void> {
  if (client.socket.readyState !== WebSocket.OPEN) return;

  const routeKey = `route:${channel.routeId}:${channel.direction}`;
  const busIds = await keydb.zrange(routeKey, 0, -1);
  if (busIds.length === 0) return;

  const routeLengthMeters = await getRouteLengthMeters(
    channel.routeId,
    channel.direction,
  );

  for (const busId of busIds) {
    const state = await getBusState(busId);
    if (!state) continue;
    if (
      state.routeId !== channel.routeId ||
      state.direction !== channel.direction
    )
      continue;

    sendJson(client.socket, {
      channel: channelName,
      data: buildRouteSnapshotPayload(state, routeLengthMeters),
    });
  }
}

async function handleBusEvent(busId: string): Promise<void> {
  const state = await getBusState(busId);
  if (!state) return;

  const neighborIds = await getNeighborIds(
    state.routeId,
    state.direction,
    busId,
    neighborCount,
  );
  const routeLengthMeters = await getRouteLengthMeters(
    state.routeId,
    state.direction,
  );
  const [ahead, behind] = await Promise.all([
    buildNeighborDetails(state, neighborIds.ahead, routeLengthMeters),
    buildNeighborDetails(state, neighborIds.behind, routeLengthMeters),
  ]);

  const neighbors = { ahead, behind };
  const distanceMeters = routeLengthMeters
    ? state.progress * routeLengthMeters
    : null;

  const busPayload = buildBusPayload(state, neighbors, distanceMeters);
  const routePayload = buildRoutePayload(state, neighbors, distanceMeters);

  broadcast(`bus:${busId}`, busPayload);
  broadcast(`route:${state.routeId}:${state.direction}`, routePayload);
  broadcast(`admin-route:${state.routeId}:${state.direction}`, routePayload);
}

async function subscribeToEvents(): Promise<void> {
  await keydbSub.psubscribe(eventPattern);

  keydbSub.on("pmessage", (_pattern, channel, message) => {
    const busId = parseBusIdFromEvent(channel, message);
    if (!busId || !isValidId(busId)) return;

    void handleBusEvent(busId).catch((error) => {
      console.warn("[events] failed to handle bus update", { busId, error });
      broadcastSystemAlert("warn", "Failed to process bus event", {
        busId,
        error: String(error),
      });
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  if (allowedOrigins.length > 0) {
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) {
      socket.close(1008, "Origin not allowed");
      return;
    }
  }

  const client: WsClient = {
    id: randomUUID(),
    socket,
    subscriptions: new Set(),
    isAlive: true,
  };

  clients.set(socket, client);

  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "192.168.1.155"}`,
  );
  const token = url.searchParams.get("token");

  if (token) {
    const auth = verifyToken(token);
    if (!auth) {
      socket.close(1008, "Invalid token");
      return;
    }
    client.auth = auth;
  } else if (requireAuth) {
    client.authTimer = setTimeout(() => {
      if (!client.auth) {
        socket.close(1008, "Authentication required");
      }
    }, authTimeoutMs);
  }

  socket.on("pong", () => {
    client.isAlive = true;
  });

  socket.on("message", (rawMessage) => {
    const text = toText(rawMessage);
    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      sendJson(socket, { type: "error", message: "Invalid JSON" });
      return;
    }

    const type = parsed.type;
    if (type === "auth") {
      const tokenValue = typeof parsed.token === "string" ? parsed.token : "";
      const auth = verifyToken(tokenValue);
      if (!auth) {
        sendJson(socket, { type: "error", message: "Invalid token" });
        return;
      }

      client.auth = auth;
      if (client.authTimer) {
        clearTimeout(client.authTimer);
        client.authTimer = undefined;
      }
      sendJson(socket, { type: "ack", action: "auth" });
      return;
    }

    if (type === "subscribe" || type === "unsubscribe") {
      const channelValue =
        typeof parsed.channel === "string" ? parsed.channel : "";
      const channelInfo = parseChannel(channelValue);
      if (!channelInfo) {
        sendJson(socket, { type: "error", message: "Invalid channel" });
        return;
      }

      if (!authorizeSubscription(client, channelInfo)) {
        sendJson(socket, { type: "error", message: "Unauthorized channel" });
        return;
      }

      if (type === "subscribe") {
        addSubscription(client, channelValue);
        sendJson(socket, {
          type: "ack",
          action: "subscribe",
          channel: channelValue,
        });
        if (channelInfo.kind === "route" || channelInfo.kind === "adminRoute") {
          void sendRouteSnapshotToClient(
            client,
            channelInfo,
            channelValue,
          ).catch((error) => {
            console.warn("[snapshot] failed to send route snapshot", {
              channel: channelValue,
              error,
            });
          });
        }
      } else {
        removeSubscription(client, channelValue);
        sendJson(socket, {
          type: "ack",
          action: "unsubscribe",
          channel: channelValue,
        });
      }
      return;
    }

    if (type === "ping") {
      sendJson(socket, { type: "pong" });
      return;
    }

    sendJson(socket, { type: "error", message: "Unknown message type" });
  });

  socket.on("close", () => {
    removeClient(client);
  });

  socket.on("error", (error) => {
    console.warn("[ws] socket error", { clientId: client.id, error });
    removeClient(client);
  });
});

const pingInterval = setInterval(() => {
  for (const client of clients.values()) {
    if (!client.isAlive) {
      client.socket.terminate();
      removeClient(client);
      continue;
    }
    client.isAlive = false;
    client.socket.ping();
  }
}, pingIntervalMs);

wss.on("close", () => {
  clearInterval(pingInterval);
});

function verifyToken(token: string): JwtPayload | null {
  if (!token) return null;
  const trimmed = token.startsWith("Bearer ") ? token.slice(7) : token;

  if (!jwtKey) {
    throw new Error("JWT key is not defined");
  }

  try {
    const decoded = jwt.verify(trimmed, jwtKey as string, jwtVerifyOptions);
    return typeof decoded === "string"
      ? ({ sub: decoded } as JwtPayload)
      : decoded;
  } catch {
    return null;
  }
}

server.listen(wsPort, wsHost, () => {
  console.log(`[ws] server listening on ${wsHost}:${wsPort}`);
});

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[ws] shutting down (${signal})`);

  clearInterval(pingInterval);

  for (const client of clients.values()) {
    client.socket.close(1001, "Server shutting down");
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));

  try {
    await keydbSub.quit();
  } catch (error) {
    console.warn("[keydb] subscriber quit failed, disconnecting", error);
    keydbSub.disconnect();
  }

  try {
    await keydb.quit();
  } catch (error) {
    console.warn("[keydb] quit failed, disconnecting", error);
    keydb.disconnect();
  }

  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void subscribeToEvents().catch((error) => {
  console.error("[events] failed to subscribe", error);
  broadcastSystemAlert("error", "Failed to subscribe to events", {
    error: String(error),
  });
});
