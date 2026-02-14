import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import * as SecureStore from "expo-secure-store";
import { jwtDecode } from "../libs/request/jwtDecode";
import { _post, _put, disconnectSession, setSession } from "@/libs/request";

export type BusData = {
  name: string;
  route: string;
  number: string;
  plate: string;
  phone: string;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
};

export type BusDataInput = BusData & {
  _id?: string;
  id?: string;
  routeId?: string;
  route?: unknown;
  routeCoordinates?: Array<
    | { latitude?: number; longitude?: number; lat?: number; lng?: number }
    | [number, number]
  >;
  status?: number;
};

export type BusApprovalStatus = "none" | "pending" | "approved";

type AuthContextValue = {
  isAuthenticated: boolean;
  isReady: boolean;
  applySession: (response: AuthResponse) => Promise<void>;
  refreshSession: () => Promise<AuthResponse | null>;
  signOut: () => void;
  trackingSwitch: () => Promise<boolean>;
  setTrackingEnabled: (enabled: boolean) => Promise<boolean>;
  finishRoute: () => Promise<boolean>;
  userData: Record<string, unknown> | boolean;
  busData: BusData | null;
  busId: string | null;
  routeId: string | null;
  hasBusInfo: boolean;
  busApprovalStatus: BusApprovalStatus;
  updateBusData: (data: BusDataInput) => void;
  setBusApprovalStatus: (status: BusApprovalStatus) => void;
  isBusDataComplete: boolean;
  isOn: number;
  isTrackingUpdating: boolean;
  isFinishingRoute: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthResponse = {
  message?: string;
  bus?: BusDataInput | null;
  refresh: string;
  token: string;
  [key: string]: unknown;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { f_post } = _post({
    url: "/auth/refresh",
    saveData: false,
    useAuth: false,
  });
  const { f_post: finishBusRoute, isLoading: isFinishingRoute } = _post({
    url: "/bus/finish",
    saveData: false,
    useAuth: true,
  });
  const { f_put: updateBusStatus, isLoading: isTrackingUpdating } = _put({
    url: "/bus",
    saveData: false,
    useAuth: true,
  });
  /*
   * Tracking switch state
   * -1 = pending
   * 0 = off
   * 1 = on
   */
  const [isOn, setIsOn] = useState(0);
  const [userData, setUserData] = useState<Record<string, unknown> | boolean>(
    {},
  );
  const [busData, setBusData] = useState<BusData | null>(null);
  const [busId, setBusId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [busApprovalStatus, setBusApprovalStatus] =
    useState<BusApprovalStatus>("none");
  const [isReady, setIsReady] = useState(false);

  const normalizeBusData = useCallback((bus: any): BusData | null => {
    if (!bus) {
      return null;
    }

    const normalizeCoordinates = (
      raw:
        | Array<
            | {
                latitude?: number;
                longitude?: number;
                lat?: number;
                lng?: number;
              }
            | [number, number]
          >
        | undefined,
      order: "latlng" | "lnglat" = "latlng",
    ): Array<{ latitude: number; longitude: number }> => {
      if (!Array.isArray(raw)) {
        return [];
      }

      return raw
        .map((entry) => {
          if (Array.isArray(entry) && entry.length >= 2) {
            const first = Number(entry[0]);
            const second = Number(entry[1]);
            const latitude = order === "lnglat" ? second : first;
            const longitude = order === "lnglat" ? first : second;
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              return { latitude, longitude };
            }
            return null;
          }

          if (entry && typeof entry === "object") {
            const latitude = Number(
              "latitude" in entry ? entry.latitude : (entry as any).lat,
            );
            const longitude = Number(
              "longitude" in entry ? entry.longitude : (entry as any).lng,
            );
            if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
              return { latitude, longitude };
            }
          }

          return null;
        })
        .filter(
          (value): value is { latitude: number; longitude: number } =>
            value !== null,
        );
    };

    const hasDirectCoordinates =
      Array.isArray(bus?.routeCoordinates) && bus.routeCoordinates.length > 0;
    const routeCoordinatesSource = hasDirectCoordinates
      ? bus.routeCoordinates
      : bus?.route?.route?.coordinates ?? bus?.route?.coordinates;
    const coordinateOrder = hasDirectCoordinates ? "latlng" : "lnglat";

    let routeValue = "";
    if (typeof bus.route === "string") {
      routeValue = bus.route;
    } else if (bus?.route) {
      if (typeof bus.route?.name === "string") {
        routeValue = bus.route.name;
      } else if (typeof bus.route?.number === "string") {
        routeValue = bus.route.number;
      } else {
        routeValue = String(bus.route);
      }
    }

    const normalizeField = (value: unknown) =>
      typeof value === "string"
        ? value.trim()
        : value == null
          ? ""
          : String(value).trim();

    return {
      name: normalizeField(bus.name),
      route: normalizeField(routeValue),
      number: normalizeField(bus.number),
      plate: normalizeField(bus.plate),
      phone: normalizeField(bus.phone),
      routeCoordinates: normalizeCoordinates(
        routeCoordinatesSource,
        coordinateOrder,
      ),
    };
  }, [disconnectSession]);

  const extractIdentifiers = useCallback((bus: any) => {
    if (!bus) {
      return { busId: null, routeId: null };
    }

    const normalizeId = (value: unknown) =>
      typeof value === "string"
        ? value.trim()
        : value == null
          ? ""
          : String(value).trim();

    const busIdValue = normalizeId(bus?._id ?? bus?.id);
    const routeIdValue = normalizeId(
      bus?.routeId ??
        (typeof bus?.route === "string"
          ? bus.route
          : (bus?.route?._id ?? bus?.route?.id)),
    );

    return {
      busId: busIdValue.length ? busIdValue : null,
      routeId: routeIdValue.length ? routeIdValue : null,
    };
  }, []);

  const applySession = useCallback(
    async (response: AuthResponse) => {
      if (!response?.token || !response?.refresh) {
        throw new Error("Invalid auth response");
      }
      await setSession({ token: response.token, refresh: response.refresh });
      const normalizedBus = normalizeBusData(response?.bus);
      const identifiers = extractIdentifiers(response?.bus);
      setBusData(normalizedBus);
      setBusId(identifiers.busId);
      setRouteId(identifiers.routeId);
      if (normalizedBus) {
        const rawStatus = response?.bus?.status;
        const numericStatus =
          typeof rawStatus === "number" && [-1, 0, 1].includes(rawStatus)
            ? rawStatus
            : -1;
        setIsOn(numericStatus);
        setBusApprovalStatus(numericStatus <= -1 ? "pending" : "approved");
      } else {
        setBusApprovalStatus("none");
        setIsOn(0);
      }
      setIsAuthenticated(true);

      setUserData(jwtDecode(response.token));
    },
    [extractIdentifiers, normalizeBusData],
  );

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const refresh_token = await SecureStore.getItemAsync("refreshToken");
        if (!refresh_token) {
          setIsAuthenticated(false);
          return;
        }
        const response = await f_post({
          body: {},
          headersIn: { Authorization: `Bearer ${refresh_token}` },
        });
        await applySession(response);
      } catch (error: any) {
        signOut();
      } finally {
        setIsReady(true);
      }
    };
    bootstrapAuth();
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const refresh_token = await SecureStore.getItemAsync("refreshToken");
      if (!refresh_token) {
        throw new Error("NO_REFRESH_TOKEN");
      }
      const response = (await f_post({
        body: {},
        headersIn: { Authorization: `Bearer ${refresh_token}` },
      })) as AuthResponse;
      await applySession(response);
      return response;
    } catch (error) {
      console.error("Failed to refresh session", error);
      return null;
    }
  }, [applySession, f_post]);

  const signOut = useCallback(() => {
    setIsAuthenticated(false);
    setBusApprovalStatus("none");
    setBusData(null);
    setBusId(null);
    setRouteId(null);
    setUserData({});
    setIsOn(0);
    void disconnectSession();
  }, []);

  const setTrackingEnabled = useCallback(
    async (enabled: boolean) => {
      const nextStatus = enabled ? 1 : 0;
      try {
        const response = (await updateBusStatus({
          body: { status: nextStatus },
        })) as { saved?: boolean };
        if (response?.saved === false) {
          return false;
        }

        setIsOn(nextStatus);
        return true;
      } catch (error) {
        console.error("Failed to update tracking status", error);
        return false;
      }
    },
    [updateBusStatus],
  );

  const trackingSwitch = useCallback(
    async () => setTrackingEnabled(isOn !== 1),
    [isOn, setTrackingEnabled],
  );

  const finishRoute = useCallback(async () => {
    try {
      const response = (await finishBusRoute({
        body: {},
      })) as { saved?: boolean; data?: { status?: number } };
      if (response?.saved === false) {
        return false;
      }

      const nextStatus =
        typeof response?.data?.status === "number" ? response.data.status : 0;
      setIsOn(nextStatus);
      return true;
    } catch (error) {
      console.error("Failed to finish route", error);
      return false;
    }
  }, [finishBusRoute]);

  const updateBusData = useCallback(
    (data: BusDataInput) => {
      const normalized = normalizeBusData(data);
      const identifiers = extractIdentifiers(data);
      const merged = normalized
        ? {
            ...normalized,
            routeCoordinates:
              normalized.routeCoordinates &&
              normalized.routeCoordinates.length > 0
                ? normalized.routeCoordinates
                : (busData?.routeCoordinates ?? normalized.routeCoordinates),
          }
        : null;
      setBusData(merged);
      if (identifiers.busId) {
        setBusId(identifiers.busId);
      }
      if (identifiers.routeId) {
        setRouteId(identifiers.routeId);
      }
      if (merged) {
        setBusApprovalStatus("pending");
      }
    },
    [busData?.routeCoordinates, extractIdentifiers, normalizeBusData],
  );

  const isBusDataComplete = useMemo(() => {
    if (!busData) {
      return false;
    }
    const requiredFields: Array<keyof BusData> = [
      "name",
      "route",
      "number",
      "phone",
    ];
    return requiredFields.every((field) => {
      const value = busData[field];
      return typeof value === "string" && value.trim().length > 0;
    });
  }, [busData]);

  const hasBusInfo = useMemo(() => Boolean(busId || busData), [busData, busId]);

  const value = useMemo(
    () => ({
      isAuthenticated,
      isReady,

      signOut,
      applySession,
      refreshSession,
      trackingSwitch,
      setTrackingEnabled,
      finishRoute,
      userData,
      busData,
      busId,
      routeId,
      hasBusInfo,
      busApprovalStatus,
      updateBusData,
      setBusApprovalStatus,
      isBusDataComplete,
      isOn,
      isTrackingUpdating,
      isFinishingRoute,
    }),
    [
      isAuthenticated,
      isReady,
      applySession,
      refreshSession,
      signOut,
      trackingSwitch,
      setTrackingEnabled,
      finishRoute,
      userData,
      busData,
      busId,
      routeId,
      hasBusInfo,
      busApprovalStatus,
      updateBusData,
      setBusApprovalStatus,
      isBusDataComplete,
      isOn,
      isTrackingUpdating,
      isFinishingRoute,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
