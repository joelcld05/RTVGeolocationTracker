import { useCallback, useEffect, useMemo, useRef } from "react";
import Cookies from "js-cookie";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { _get } from "../../libs/request";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  clearLiveBuses,
  resetDashboardState,
  setBuses,
  setDashboardError,
  setRouteFilter,
  setRoutes,
  setSelectedRouteId,
  setSocketStatus,
  upsertLiveBus,
} from "../../store/slices/dashboardSlice";
import {
  BusCatalogItem,
  Direction,
  LiveBusState,
  RouteItem,
} from "../../types/domain";

const TOKEN_KEY = "token_v2";
const DEFAULT_MAP_CENTER: [number, number] = [8.9833, -79.5197];
const DEFAULT_MAP_ZOOM = 12;
const WS_BASE_URL = process.env.REACT_APP_WS_URL || "ws://192.168.1.155:8081";

const normalizeDirection = (value: unknown): Direction => {
  return String(value || "")
    .trim()
    .toUpperCase() === "BACKWARD"
    ? "BACKWARD"
    : "FORWARD";
};

const toDataArray = <T,>(payload: unknown): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as T[];
  if (
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as any).data)
  ) {
    return (payload as any).data as T[];
  }
  return [];
};

const toRouteId = (route: BusCatalogItem["route"]): string => {
  if (!route) return "";
  if (typeof route === "string") return route;
  return String(route._id || "");
};

const formatAge = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) return "--";
  const deltaSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const mins = Math.floor(deltaSeconds / 60);
  const secs = deltaSeconds % 60;
  return `${mins}m ${secs}s ago`;
};

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const {
    routes,
    buses,
    selectedRouteId,
    routeFilter,
    liveBuses,
    socketStatus,
    error,
  } = useAppSelector((state) => state.dashboard);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const hasFittedRef = useRef(false);
  const selectedRouteIdRef = useRef(selectedRouteId);

  const routesRequest = _get<RouteItem[]>({
    onLoad: false,
    url: "/bus/routes",
  });
  const busesRequest = _get<BusCatalogItem[]>({
    onLoad: false,
    url: "/buses?rows=500&populate=route",
  });
  const routesFetchRef = useRef(routesRequest.f_get);
  const busesFetchRef = useRef(busesRequest.f_get);

  const selectedRoute = useMemo(
    () => routes.find((route) => route._id === selectedRouteId) || null,
    [routes, selectedRouteId],
  );

  const filteredRoutes = useMemo(() => {
    const query = routeFilter.trim().toLowerCase();
    if (!query) return routes;
    return routes.filter((route) => {
      const haystack =
        `${route.number} ${route.name} ${route.direction}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [routes, routeFilter]);

  const selectedRouteCatalogBuses = useMemo(() => {
    if (!selectedRouteId) return [];
    return buses.filter((bus) => toRouteId(bus.route) === selectedRouteId);
  }, [buses, selectedRouteId]);

  const selectedRouteLiveBuses = useMemo(() => {
    return Object.values(liveBuses).sort((a, b) => b.timestamp - a.timestamp);
  }, [liveBuses]);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
  }, []);

  useEffect(() => {
    routesFetchRef.current = routesRequest.f_get;
    busesFetchRef.current = busesRequest.f_get;
  }, [routesRequest.f_get, busesRequest.f_get]);

  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
  }, [selectedRouteId]);

  useEffect(() => {
    if (!isAuthenticated || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      dispatch(resetDashboardState());
      clearMarkers();
      return;
    }

    let ignore = false;
    const loadData = async () => {
      try {
        dispatch(setDashboardError(""));
        const [routeData, busData] = await Promise.all([
          routesFetchRef.current({ url: "/bus/routes" }),
          busesFetchRef.current({ url: "/buses?rows=500&populate=route" }),
        ]);

        if (ignore) return;

        const parsedRoutes = toDataArray<RouteItem>(routeData).map((route) => ({
          ...route,
          direction: normalizeDirection(route.direction),
        }));
        const parsedBuses = toDataArray<BusCatalogItem>(busData);

        dispatch(setRoutes(parsedRoutes));
        dispatch(setBuses(parsedBuses));

        if (parsedRoutes.length === 0) {
          dispatch(setSelectedRouteId(""));
          return;
        }

        const previousRouteId = selectedRouteIdRef.current;
        const hasPreviousRoute = parsedRoutes.some(
          (route) => route._id === previousRouteId,
        );
        if (!previousRouteId || !hasPreviousRoute) {
          dispatch(setSelectedRouteId(parsedRoutes[0]._id));
        }
      } catch {
        if (!ignore) {
          dispatch(
            setDashboardError(
              "Unable to load routes and buses. Verify API URL and credentials.",
            ),
          );
        }
      }
    };

    void loadData();
    return () => {
      ignore = true;
    };
  }, [clearMarkers, dispatch, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !selectedRoute) return;

    const token = Cookies.get(TOKEN_KEY);
    if (!token) {
      dispatch(setSocketStatus("error"));
      return;
    }

    const wsUrl = `${WS_BASE_URL.replace(/\/$/, "")}?token=${encodeURIComponent(token)}`;
    const channel = `admin-route:${selectedRoute._id}:${selectedRoute.direction}`;

    dispatch(setSocketStatus("connecting"));
    dispatch(clearLiveBuses());
    clearMarkers();
    hasFittedRef.current = false;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "subscribe", channel }));
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data));

        if (payload.type === "ack" && payload.action === "subscribe") {
          dispatch(setSocketStatus("connected"));
          return;
        }

        if (payload.type === "error") {
          dispatch(setSocketStatus("error"));
          return;
        }

        if (
          payload.channel !== channel ||
          typeof payload.data !== "object" ||
          !payload.data
        ) {
          return;
        }

        const nextState = payload.data as LiveBusState;
        const lat = Number((nextState as any).lat);
        const lng = Number((nextState as any).lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !nextState.busId)
          return;

        dispatch(
          upsertLiveBus({
            ...nextState,
            lat,
            lng,
            speed: Number(nextState.speed || 0),
            timestamp: Number(nextState.timestamp || Date.now()),
            direction: normalizeDirection(nextState.direction),
            tripStatus:
              nextState.tripStatus === "ARRIVED" ? "ARRIVED" : "IN_ROUTE",
            isOffTrack: Boolean(nextState.isOffTrack),
          }),
        );
      } catch {
        dispatch(setSocketStatus("error"));
      }
    };

    socket.onerror = () => {
      dispatch(setSocketStatus("error"));
    };

    socket.onclose = () => {
      dispatch(setSocketStatus("idle"));
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [clearMarkers, dispatch, isAuthenticated, selectedRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const entries = selectedRouteLiveBuses;
    const liveBusIds = new Set(entries.map((item) => item.busId));

    markersRef.current.forEach((marker, busId) => {
      if (!liveBusIds.has(busId)) {
        marker.remove();
        markersRef.current.delete(busId);
      }
    });

    const bounds = L.latLngBounds([]);
    for (const bus of entries) {
      const point = L.latLng(bus.lat, bus.lng);
      bounds.extend(point);

      const markerColor = bus.isOffTrack
        ? "#f97316"
        : bus.tripStatus === "ARRIVED"
          ? "#22c55e"
          : "#3b82f6";
      const existing = markersRef.current.get(bus.busId);

      if (existing) {
        existing.setLatLng(point);
        existing.setStyle({ color: markerColor, fillColor: markerColor });
        existing.bindTooltip(`${bus.busId} • ${Math.round(bus.speed)} km/h`, {
          direction: "top",
        });
      } else {
        const marker = L.circleMarker(point, {
          radius: 9,
          color: markerColor,
          fillColor: markerColor,
          fillOpacity: 0.9,
          weight: 2,
        });
        marker.bindTooltip(`${bus.busId} • ${Math.round(bus.speed)} km/h`, {
          direction: "top",
        });
        marker.addTo(map);
        markersRef.current.set(bus.busId, marker);
      }
    }

    if (!hasFittedRef.current && entries.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      hasFittedRef.current = true;
    }
  }, [selectedRouteLiveBuses]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      clearMarkers();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [clearMarkers]);

  return (
    <>
      <header className="admin-topbar">
        <div>
          <h2>Route Admin Live Map</h2>
          <p>
            {selectedRoute
              ? `${selectedRoute.number} · ${selectedRoute.name} (${selectedRoute.direction})`
              : "Select a route to start monitoring"}
          </p>
        </div>
        <div className="topbar-actions">
          <input
            value={routeFilter}
            onChange={(event) => dispatch(setRouteFilter(event.target.value))}
            placeholder="Search by route number or name"
          />
          <div className={`socket-pill ${socketStatus}`}>{socketStatus}</div>
        </div>
      </header>

      <section className="admin-content">
        <div className="map-card">
          <div className="map-card-header">
            <h3>Current Locations (OpenStreetMap)</h3>
            <span>{selectedRouteLiveBuses.length} live buses</span>
          </div>
          <div ref={mapContainerRef} className="map-view" />
          {error ? <p className="panel-error">{error}</p> : null}
        </div>

        <div className="side-panels">
          <article className="panel">
            <div className="panel-header">
              <h4>Routes List</h4>
              <span>{filteredRoutes.length} total</span>
            </div>
            <div className="route-list">
              {filteredRoutes.map((route) => (
                <button
                  type="button"
                  key={`${route._id}-${route.direction}`}
                  className={`route-item ${selectedRouteId === route._id ? "selected" : ""}`}
                  onClick={() => dispatch(setSelectedRouteId(route._id))}
                >
                  <div>
                    <strong>{route.number}</strong>
                    <p>{route.name}</p>
                  </div>
                  <span>{route.direction}</span>
                </button>
              ))}
              {filteredRoutes.length === 0 ? (
                <p className="empty-state">No routes found.</p>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h4>Live Buses</h4>
              <span>{selectedRouteCatalogBuses.length} assigned</span>
            </div>
            <div className="bus-list">
              {selectedRouteLiveBuses.map((bus) => {
                const busMeta = selectedRouteCatalogBuses.find(
                  (item) => item._id === bus.busId,
                );
                return (
                  <div key={bus.busId} className="bus-item">
                    <div>
                      <strong>{busMeta?.number || bus.busId}</strong>
                      <p>{busMeta?.name || "Bus in route"}</p>
                    </div>
                    <div className="bus-meta">
                      <span>{Math.round(bus.speed)} km/h</span>
                      <span>{formatAge(bus.timestamp)}</span>
                      <span
                        className={
                          bus.isOffTrack ? "status-warn" : "status-good"
                        }
                      >
                        {bus.isOffTrack ? "OFF TRACK" : bus.tripStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
              {selectedRouteLiveBuses.length === 0 ? (
                <p className="empty-state">
                  Waiting for live bus updates on selected route.
                </p>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
