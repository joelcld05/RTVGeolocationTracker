import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { jwtDecode } from "@/libs/request/jwtDecode";

type Direction = "FORWARD" | "BACKWARD";

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting"
  | "error"
  | "closed";

type RouteNeighbor = {
  busId: string;
  distanceMeters: number | null;
  etaSeconds: number | null;
};

type RoutePayload = {
  busId: string;
  routeId: string;
  direction: Direction;
  lat: number;
  lng: number;
  progress: number;
  distanceMeters: number | null;
  deviationMeters: number | null;
  speed: number;
  isOffTrack: boolean;
  tripStatus: "IN_ROUTE" | "ARRIVED";
  arrivalTimestamp: number | null;
  ahead: RouteNeighbor[];
  behind: RouteNeighbor[];
  timestamp: number;
};

type NeighborSnapshot = {
  ahead: RouteNeighbor[];
  behind: RouteNeighbor[];
  timestamp: number | null;
};

export type LiveRouteBus = RoutePayload & {
  ageMs: number;
  isStale: boolean;
};

export type LiveNeighbor = RouteNeighbor & {
  lat: number | null;
  lng: number | null;
  speed: number | null;
  isOffTrack: boolean | null;
  tripStatus: "IN_ROUTE" | "ARRIVED" | null;
  timestamp: number | null;
  ageMs: number | null;
  isStale: boolean;
};

type UseRouteLiveFeedOptions = {
  enabled?: boolean;
  routeId?: string | null;
  direction?: Direction;
  busId?: string | null;
  wsUrl?: string;
  staleAfterMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  refreshSession?: () => Promise<unknown>;
};

const EMPTY_NEIGHBORS: NeighborSnapshot = {
  ahead: [],
  behind: [],
  timestamp: null,
};

const DEFAULT_STALE_AFTER_MS = 15_000;
const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 10_000;
const ROUTE_AUTH_MISMATCH_ERROR = "ROUTE_AUTH_MISMATCH";
const SESSION_TOKEN_MISSING_ERROR = "SESSION_TOKEN_MISSING";

function sanitizeChannelSegment(value: string) {
  return value.trim().replace(/\//g, "_");
}

function normalizeDirection(value?: string): Direction {
  return value?.toUpperCase() === "BACKWARD" ? "BACKWARD" : "FORWARD";
}

function toFiniteNumber(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numeric) ? numeric : null;
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  return toFiniteNumber(value);
}

function parseNeighbor(raw: unknown): RouteNeighbor | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const busId = typeof entry.busId === "string" ? entry.busId.trim() : "";
  if (!busId) {
    return null;
  }

  return {
    busId,
    distanceMeters: toOptionalNumber(entry.distanceMeters),
    etaSeconds: toOptionalNumber(entry.etaSeconds),
  };
}

function parseNeighborList(raw: unknown): RouteNeighbor[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => parseNeighbor(entry))
    .filter((entry): entry is RouteNeighbor => entry !== null);
}

function parseRoutePayload(raw: unknown): RoutePayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const busId = typeof entry.busId === "string" ? entry.busId.trim() : "";
  const routeId = typeof entry.routeId === "string" ? entry.routeId.trim() : "";
  const direction = normalizeDirection(
    typeof entry.direction === "string" ? entry.direction : "FORWARD",
  );
  const lat = toFiniteNumber(entry.lat);
  const lng = toFiniteNumber(entry.lng);
  const progress = toFiniteNumber(entry.progress);
  const speed = toFiniteNumber(entry.speed);
  const timestamp = toFiniteNumber(entry.timestamp);

  if (
    !busId ||
    !routeId ||
    lat === null ||
    lng === null ||
    progress === null ||
    speed === null ||
    timestamp === null
  ) {
    return null;
  }

  return {
    busId,
    routeId,
    direction,
    lat,
    lng,
    progress,
    distanceMeters: toOptionalNumber(entry.distanceMeters),
    deviationMeters: toOptionalNumber(entry.deviationMeters),
    speed,
    isOffTrack: Boolean(entry.isOffTrack),
    tripStatus: entry.tripStatus === "ARRIVED" ? "ARRIVED" : "IN_ROUTE",
    arrivalTimestamp: toOptionalNumber(entry.arrivalTimestamp),
    ahead: parseNeighborList(entry.ahead),
    behind: parseNeighborList(entry.behind),
    timestamp,
  };
}

function resolveWebSocketUrl(override?: string) {
  const fromConfig =
    override ??
    process.env.EXPO_PUBLIC_WS_BASE_URL ??
    Constants.expoConfig?.extra?.wsBaseUrl;

  let value = (fromConfig ?? "ws://192.168.1.155:8081").trim();

  if (value.startsWith("http://")) {
    value = `ws://${value.slice("http://".length)}`;
  }

  if (value.startsWith("https://")) {
    value = `wss://${value.slice("https://".length)}`;
  }

  return value.replace(/\/+$/, "");
}

function isTokenExpired(token: string, skewMs = 5000): boolean {
  try {
    const decoded = jwtDecode<{ exp?: number }>(token);
    if (!decoded?.exp) {
      return false;
    }

    return decoded.exp * 1000 <= Date.now() + skewMs;
  } catch {
    return false;
  }
}

function getTokenRouteClaims(token: string): {
  routeId: string;
  direction: Direction;
} | null {
  try {
    const decoded = jwtDecode<{ routeId?: unknown; direction?: unknown }>(
      token,
    );
    const routeId =
      typeof decoded?.routeId === "string" ? decoded.routeId.trim() : "";
    const direction =
      typeof decoded?.direction === "string"
        ? normalizeDirection(decoded.direction)
        : null;

    if (!routeId || !direction) {
      return null;
    }

    return {
      routeId: sanitizeChannelSegment(routeId),
      direction,
    };
  } catch {
    return null;
  }
}

export function useRouteLiveFeed(options: UseRouteLiveFeedOptions = {}) {
  const {
    enabled = true,
    routeId,
    direction,
    busId,
    wsUrl: wsOverride,
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    reconnectBaseMs = DEFAULT_RECONNECT_BASE_MS,
    reconnectMaxMs = DEFAULT_RECONNECT_MAX_MS,
    refreshSession,
  } = options;

  const wsUrl = useMemo(() => resolveWebSocketUrl(wsOverride), [wsOverride]);
  const normalizedRouteId = useMemo(
    () => (routeId ? sanitizeChannelSegment(routeId) : ""),
    [routeId],
  );
  const normalizedDirection = useMemo(
    () => normalizeDirection(direction),
    [direction],
  );
  const channel = useMemo(
    () =>
      normalizedRouteId
        ? `route:${normalizedRouteId}:${normalizedDirection}`
        : "",
    [normalizedDirection, normalizedRouteId],
  );
  const refreshSessionRef = useRef(refreshSession);

  useEffect(() => {
    refreshSessionRef.current = refreshSession;
  }, [refreshSession]);

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busStateById, setBusStateById] = useState<
    Record<string, RoutePayload>
  >({});
  const [neighborSnapshot, setNeighborSnapshot] =
    useState<NeighborSnapshot>(EMPTY_NEIGHBORS);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [lastReconnectAt, setLastReconnectAt] = useState<number | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [isResyncing, setIsResyncing] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const reconnectAttemptRef = useRef(0);
  const unauthorizedRefreshAttemptRef = useRef(0);
  const tokenRefreshAttemptRef = useRef(0);
  const connectCycleRef = useRef(0);
  const hasConnectedOnceRef = useRef(false);
  const connectRef = useRef<((isReconnect: boolean) => Promise<void>) | null>(
    null,
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const resetStaleState = useCallback(() => {
    setBusStateById({});
    setNeighborSnapshot(EMPTY_NEIGHBORS);
    setLastMessageAt(null);
    setIsResyncing(true);
  }, []);

  const closeSocket = useCallback(() => {
    if (socketRef.current) {
      const socket = socketRef.current;
      socketRef.current = null;
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "Client closed");
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!shouldReconnectRef.current || !enabled || !channel) {
      return;
    }

    clearReconnectTimer();

    const nextAttempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = nextAttempt;
    const baseDelay = reconnectBaseMs * Math.pow(2, nextAttempt - 1);
    const cappedDelay = Math.min(reconnectMaxMs, baseDelay);
    const jitter = Math.floor(cappedDelay * 0.2 * Math.random());
    const delay = cappedDelay + jitter;

    setStatus("reconnecting");
    setReconnectCount(nextAttempt);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      const runConnect = connectRef.current;
      if (runConnect) {
        void runConnect(true);
      }
    }, delay);
  }, [channel, clearReconnectTimer, enabled, reconnectBaseMs, reconnectMaxMs]);

  const runRefreshSession = useCallback(async () => {
    const refresh = refreshSessionRef.current;
    if (!refresh) {
      return null;
    }
    return await refresh();
  }, []);

  const resolveAccessToken = useCallback(async () => {
    let token = await SecureStore.getItemAsync("accessToken");
    const canRefresh =
      Boolean(refreshSessionRef.current) && tokenRefreshAttemptRef.current < 1;

    if (token && isTokenExpired(token) && canRefresh) {
      tokenRefreshAttemptRef.current += 1;
      await runRefreshSession();
      token = await SecureStore.getItemAsync("accessToken");
    }

    if (!token && canRefresh) {
      tokenRefreshAttemptRef.current += 1;
      await runRefreshSession();
      token = await SecureStore.getItemAsync("accessToken");
    }

    if (!token) {
      throw new Error(SESSION_TOKEN_MISSING_ERROR);
    }

    if (token && normalizedRouteId) {
      const claims = getTokenRouteClaims(token);
      const hasClaimMismatch =
        !claims ||
        claims.routeId !== normalizedRouteId ||
        claims.direction !== normalizedDirection;

      if (
        hasClaimMismatch &&
        tokenRefreshAttemptRef.current < 1 &&
        refreshSessionRef.current
      ) {
        tokenRefreshAttemptRef.current += 1;
        await runRefreshSession();
        token = await SecureStore.getItemAsync("accessToken");
      }
    }

    if (token && normalizedRouteId) {
      const claims = getTokenRouteClaims(token);
      const hasClaimMismatch =
        !claims ||
        claims.routeId !== normalizedRouteId ||
        claims.direction !== normalizedDirection;
      if (hasClaimMismatch) {
        throw new Error(ROUTE_AUTH_MISMATCH_ERROR);
      }
    }

    return token;
  }, [normalizedDirection, normalizedRouteId, runRefreshSession]);

  const connect = useCallback(
    async (isReconnect: boolean) => {
      if (!enabled || !channel) {
        return;
      }

      const cycle = connectCycleRef.current + 1;
      connectCycleRef.current = cycle;

      clearReconnectTimer();
      closeSocket();

      if (isReconnect || hasConnectedOnceRef.current) {
        resetStaleState();
        setLastReconnectAt(Date.now());
      }

      setErrorMessage(null);
      setStatus(isReconnect ? "reconnecting" : "connecting");

      let token: string | null = null;
      let tokenResolutionError: string | null = null;
      try {
        token = await resolveAccessToken();
      } catch (error) {
        console.warn("Failed to resolve access token for WebSocket", error);
        tokenResolutionError =
          error instanceof Error
            ? error.message
            : "Unable to validate session for live feed.";
      }

      if (connectCycleRef.current !== cycle) {
        return;
      }

      if (!token) {
        if (tokenResolutionError === ROUTE_AUTH_MISMATCH_ERROR) {
          setErrorMessage(
            "Session route authorization is out of sync. Please sign in again.",
          );
          setStatus("error");
          return;
        }

        if (tokenResolutionError === SESSION_TOKEN_MISSING_ERROR) {
          setErrorMessage("Missing access token for live feed.");
          setStatus("error");
          return;
        }

        setErrorMessage(
          tokenResolutionError ?? "Missing access token for live feed.",
        );
        setStatus("error");
        scheduleReconnect();
        return;
      }

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        setErrorMessage("Unable to open WebSocket connection.");
        setStatus("error");
        scheduleReconnect();
        return;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        if (connectCycleRef.current !== cycle) {
          return;
        }

        setStatus("authenticating");
        socket.send(JSON.stringify({ type: "auth", token }));
        socket.send(JSON.stringify({ type: "subscribe", channel }));
      };

      socket.onmessage = (event) => {
        if (connectCycleRef.current !== cycle) {
          return;
        }

        const rawData =
          typeof event.data === "string"
            ? event.data
            : String(event.data ?? "");

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawData) as Record<string, unknown>;
        } catch {
          return;
        }

        if (parsed.type === "ack") {
          if (parsed.action === "subscribe") {
            reconnectAttemptRef.current = 0;
            unauthorizedRefreshAttemptRef.current = 0;
            tokenRefreshAttemptRef.current = 0;
            setReconnectCount(0);
            setStatus("connected");
            hasConnectedOnceRef.current = true;
          }
          return;
        }

        if (parsed.type === "error") {
          const message =
            typeof parsed.message === "string"
              ? parsed.message
              : "WebSocket server error.";

          if (
            message === "Unauthorized channel" &&
            refreshSessionRef.current &&
            unauthorizedRefreshAttemptRef.current < 1
          ) {
            unauthorizedRefreshAttemptRef.current += 1;
            setStatus("reconnecting");
            setErrorMessage("Refreshing session for route authorization...");

            void (async () => {
              try {
                await runRefreshSession();
              } catch (error) {
                console.warn(
                  "Failed to refresh session for route channel",
                  error,
                );
              } finally {
                if (connectCycleRef.current === cycle) {
                  scheduleReconnect();
                  closeSocket();
                }
              }
            })();
            return;
          }

          setStatus("error");
          setErrorMessage(message);
          return;
        }

        if (parsed.channel !== channel) {
          return;
        }

        const payload = parseRoutePayload(parsed.data);
        if (!payload) {
          return;
        }

        setLastMessageAt(Date.now());
        setIsResyncing(false);

        setBusStateById((previous) => {
          const current = previous[payload.busId];
          if (current && current.timestamp > payload.timestamp) {
            return previous;
          }
          return {
            ...previous,
            [payload.busId]: payload,
          };
        });

        if (busId && payload.busId === busId) {
          setNeighborSnapshot({
            ahead: payload.ahead.filter((neighbor) => neighbor.busId !== busId),
            behind: payload.behind.filter(
              (neighbor) => neighbor.busId !== busId,
            ),
            timestamp: payload.timestamp,
          });
        }
      };

      socket.onerror = () => {
        if (connectCycleRef.current !== cycle) {
          return;
        }

        setStatus("error");
        setErrorMessage("WebSocket connection failed.");
      };

      socket.onclose = (event) => {
        if (connectCycleRef.current !== cycle) {
          return;
        }

        socketRef.current = null;

        if (!shouldReconnectRef.current || !enabled || !channel) {
          setStatus("closed");
          return;
        }

        if (event.code === 1000) {
          setStatus("closed");
          return;
        }

        if (event.reason) {
          setErrorMessage(event.reason);
        }

        scheduleReconnect();
      };
    },
    [
      busId,
      channel,
      clearReconnectTimer,
      closeSocket,
      enabled,
      resetStaleState,
      runRefreshSession,
      resolveAccessToken,
      scheduleReconnect,
      wsUrl,
    ],
  );

  connectRef.current = connect;

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;

    if (!enabled || !channel) {
      clearReconnectTimer();
      closeSocket();
      reconnectAttemptRef.current = 0;
      hasConnectedOnceRef.current = false;
      setReconnectCount(0);
      setStatus("idle");
      setErrorMessage(null);
      setIsResyncing(false);
      setBusStateById({});
      setNeighborSnapshot(EMPTY_NEIGHBORS);
      setLastMessageAt(null);
      return;
    }

    reconnectAttemptRef.current = 0;
    unauthorizedRefreshAttemptRef.current = 0;
    tokenRefreshAttemptRef.current = 0;
    hasConnectedOnceRef.current = false;
    setReconnectCount(0);
    setIsResyncing(false);
    setErrorMessage(null);

    void connect(false);

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      closeSocket();
      setStatus("closed");
    };
  }, [channel, clearReconnectTimer, closeSocket, connect, enabled]);

  const liveBuses = useMemo(() => {
    return Object.values(busStateById)
      .map((entry) => {
        const ageMs = Math.max(0, clockTick - entry.timestamp);
        return {
          ...entry,
          ageMs,
          isStale: ageMs > staleAfterMs,
        };
      })
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [busStateById, clockTick, staleAfterMs]);

  const selfBus = useMemo(() => {
    if (!busId) {
      return null;
    }

    return liveBuses.find((entry) => entry.busId === busId) ?? null;
  }, [busId, liveBuses]);

  const neighbors = useMemo(() => {
    const mergeNeighbor = (neighbor: RouteNeighbor): LiveNeighbor => {
      const busState = busStateById[neighbor.busId];
      if (!busState) {
        return {
          ...neighbor,
          lat: null,
          lng: null,
          speed: null,
          isOffTrack: null,
          tripStatus: null,
          timestamp: null,
          ageMs: null,
          isStale: true,
        };
      }

      const ageMs = Math.max(0, clockTick - busState.timestamp);
      return {
        ...neighbor,
        lat: busState.lat,
        lng: busState.lng,
        speed: busState.speed,
        isOffTrack: busState.isOffTrack,
        tripStatus: busState.tripStatus,
        timestamp: busState.timestamp,
        ageMs,
        isStale: ageMs > staleAfterMs,
      };
    };

    const snapshotAgeMs =
      neighborSnapshot.timestamp == null
        ? null
        : Math.max(0, clockTick - neighborSnapshot.timestamp);

    return {
      ahead: neighborSnapshot.ahead.map(mergeNeighbor),
      behind: neighborSnapshot.behind.map(mergeNeighbor),
      timestamp: neighborSnapshot.timestamp,
      ageMs: snapshotAgeMs,
      isStale: snapshotAgeMs !== null && snapshotAgeMs > staleAfterMs,
    };
  }, [busStateById, clockTick, neighborSnapshot, staleAfterMs]);

  return {
    wsUrl,
    channel,
    status,
    errorMessage,
    reconnectCount,
    isResyncing,
    lastReconnectAt,
    lastMessageAt,
    buses: liveBuses,
    selfBus,
    neighbors,
  };
}
