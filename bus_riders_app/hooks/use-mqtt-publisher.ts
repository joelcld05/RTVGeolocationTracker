import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { IClientOptions, MqttClient } from "mqtt";

export type PublishLocationInput = {
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  timestamp?: number;
};

type MqttStatus = "idle" | "connecting" | "connected" | "closed" | "error";

type UseMqttPublisherOptions = {
  enabled?: boolean;
  busId?: string | null;
  routeId?: string | null;
  direction?: "FORWARD" | "BACKWARD";
  brokerUrl?: string;
  caPem?: string;
  topicPrefix?: string;
  clientIdPrefix?: string;
  qos?: 0 | 1 | 2;
  keepalive?: number;
  reconnectPeriodMs?: number;
};

const DEFAULT_TOPIC_PREFIX = "gps";
const DEFAULT_CLIENT_PREFIX = "BUS_";
const DEFAULT_KEEPALIVE = 30;
const DEFAULT_RECONNECT_MS = 1000;

const allowedDirections = new Set(["FORWARD", "BACKWARD"] as const);

type MqttModuleLike = {
  connect: (url: string, options?: IClientOptions) => MqttClient;
};

let mqttLoaderPromise: Promise<MqttModuleLike> | null = null;

async function loadMqttModule() {
  if (!mqttLoaderPromise) {
    mqttLoaderPromise = (async () => {
      const [{ Buffer }, processModule] = await Promise.all([
        import("buffer"),
        import("process"),
      ]);
      const globalTarget = globalThis as typeof globalThis & {
        Buffer?: typeof Buffer;
        process?: any;
      };
      if (!globalTarget.Buffer) {
        globalTarget.Buffer = Buffer;
      }
      if (!globalTarget.process) {
        globalTarget.process = processModule.default ?? processModule;
      }
      const normalizeModule = (module: any): MqttModuleLike => {
        if (module?.connect) {
          return module as MqttModuleLike;
        }
        if (module?.default?.connect) {
          return module.default as MqttModuleLike;
        }
        const maybeDefault = module?.default ?? module;
        if (typeof maybeDefault === "function") {
          return { connect: maybeDefault as MqttModuleLike["connect"] };
        }
        if (maybeDefault?.connect) {
          return maybeDefault as MqttModuleLike;
        }
        throw new Error("MQTT module does not expose connect()");
      };

      try {
        const module = await import("mqtt/dist/mqtt" as any);
        return normalizeModule(module);
      } catch (error) {
        console.log("🚀 ~ loadMqttModule ~ error:", error);
        const module = await import("mqtt");
        return normalizeModule(module);
      }
    })();
  }
  return mqttLoaderPromise;
}

function resolveBrokerUrl(override?: string) {
  const fromConfig =
    override ??
    Constants.expoConfig?.extra?.mqttBrokerUrl ??
    process.env.EXPO_PUBLIC_MQTT_BROKER_URL;

  let brokerUrl = fromConfig ?? "ws://localhost:8083/mqtt";

  if (brokerUrl.startsWith("mqtt://") || brokerUrl.startsWith("mqtts://")) {
    const secure = brokerUrl.startsWith("mqtts://");
    const stripped = brokerUrl.replace(/^mqtts?:\/\//, "");
    const hostPart = stripped.split("/")[0] ?? "localhost";
    const hostname = hostPart.split(":")[0] ?? "localhost";
    const wsPort = secure ? 8084 : 8083;
    brokerUrl = `${secure ? "wss" : "ws"}://${hostname}:${wsPort}/mqtt`;
  }

  return brokerUrl;
}

function sanitizeTopicSegment(value: string) {
  return value.trim().replace(/\//g, "_");
}

function normalizeDirection(value?: string) {
  const direction = value?.toUpperCase() ?? "FORWARD";
  return allowedDirections.has(direction as "FORWARD" | "BACKWARD")
    ? (direction as "FORWARD" | "BACKWARD")
    : "FORWARD";
}

export function useMqttPublisher(options: UseMqttPublisherOptions = {}) {
  const {
    enabled = true,
    busId,
    routeId,
    direction,
    brokerUrl: brokerOverride,
    caPem: caOverride,
    topicPrefix = DEFAULT_TOPIC_PREFIX,
    clientIdPrefix = DEFAULT_CLIENT_PREFIX,
    qos = 0,
    keepalive = DEFAULT_KEEPALIVE,
    reconnectPeriodMs = DEFAULT_RECONNECT_MS,
  } = options;

  const brokerUrl = useMemo(
    () => resolveBrokerUrl(brokerOverride),
    [brokerOverride],
  );
  const caPem = useMemo(
    () =>
      caOverride ??
      Constants.expoConfig?.extra?.mqttCaPem ??
      process.env.EXPO_PUBLIC_MQTT_CA_PEM,
    [caOverride],
  );
  const normalizedDirection = useMemo(
    () => normalizeDirection(direction),
    [direction],
  );

  const clientRef = useRef<MqttClient | null>(null);
  const connectionKeyRef = useRef<string>("");
  const [status, setStatus] = useState<MqttStatus>("idle");
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateStatus = useCallback((next: MqttStatus) => {
    if (isMountedRef.current) {
      setStatus(next);
    }
  }, []);

  const endClient = useCallback(
    (force = true) => {
      if (clientRef.current) {
        clientRef.current.end(force);
        clientRef.current = null;
      }
      connectionKeyRef.current = "";
      updateStatus("closed");
    },
    [updateStatus],
  );

  const connectClient = useCallback(async () => {
    if (!enabled || !busId || !routeId) {
      return null;
    }

    const token = await SecureStore.getItemAsync("accessToken");
    if (!token) {
      return null;
    }

    const normalizedBusId = sanitizeTopicSegment(busId);
    const normalizedRouteId = sanitizeTopicSegment(routeId);
    const clientId = normalizedBusId.startsWith(clientIdPrefix)
      ? normalizedBusId
      : `${clientIdPrefix}${normalizedBusId}`;
    const connectionKey = `${brokerUrl}|${clientId}|${normalizedRouteId}|${normalizedDirection}|${token.slice(-8)}`;

    if (clientRef.current && connectionKeyRef.current === connectionKey) {
      return clientRef.current;
    }

    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }

    updateStatus("connecting");

    const mqtt = await loadMqttModule();
    const options: IClientOptions = {
      clientId,
      username: clientId,
      password: token,
      keepalive,
      reconnectPeriod: reconnectPeriodMs,
      clean: true,
    };
    if (caPem) {
      options.ca = caPem;
    }

    const client: MqttClient = mqtt.connect(brokerUrl, options);
    clientRef.current = client;
    connectionKeyRef.current = connectionKey;

    client.on("connect", () => updateStatus("connected"));
    client.on("reconnect", () => updateStatus("connecting"));
    client.on("close", () => updateStatus("closed"));
    client.on("error", () => updateStatus("error"));

    return client;
  }, [
    enabled,
    busId,
    routeId,
    brokerUrl,
    normalizedDirection,
    clientIdPrefix,
    keepalive,
    reconnectPeriodMs,
    updateStatus,
  ]);

  useEffect(() => {
    if (!enabled || !busId || !routeId) {
      if (clientRef.current) {
        endClient(true);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      const client = await connectClient();
      if (cancelled && client) {
        client.end(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, busId, routeId, connectClient, endClient]);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.end(true);
      }
    };
  }, []);

  const publishLocation = useCallback(
    async (payload: PublishLocationInput) => {
      if (!enabled || !busId || !routeId) {
        return false;
      }

      const client = clientRef.current ?? (await connectClient());
      if (!client || !client.connected) {
        return false;
      }

      const normalizedBusId = sanitizeTopicSegment(busId);
      const normalizedRouteId = sanitizeTopicSegment(routeId);
      const topic = `${topicPrefix}/${normalizedRouteId}/${normalizedDirection}/${normalizedBusId}`;
      const speed = Number.isFinite(payload.speed) ? Number(payload.speed) : 0;
      const heading = Number.isFinite(payload.heading)
        ? Number(payload.heading)
        : undefined;
      const message = {
        lat: payload.lat,
        lng: payload.lng,
        speed: speed < 0 ? 0 : speed,
        timestamp: payload.timestamp ?? Date.now(),
        ...(heading === undefined ? {} : { heading }),
      };

      client.publish(topic, JSON.stringify(message), { qos, retain: false });
      return true;
    },
    [
      enabled,
      busId,
      routeId,
      connectClient,
      topicPrefix,
      normalizedDirection,
      qos,
    ],
  );

  return {
    status,
    brokerUrl,
    platform: Platform.OS,
    publishLocation,
  };
}
