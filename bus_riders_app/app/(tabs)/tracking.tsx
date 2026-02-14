import { useCallback, useMemo } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, Region, UrlTile } from "react-native-maps";

import { fontFamilies } from "@/constants/themes";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useNotification } from "@/contexts/notification-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  useRouteLiveFeed,
  type LiveNeighbor,
} from "@/hooks/use-route-live-feed";

const mapTilesUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const defaultMapRegion: Region = {
  latitude: 8.9824,
  longitude: -79.5199,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function formatClockTime(value: number | null): string {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleTimeString();
}

export default function TrackingScreen() {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const {
    isAuthenticated,
    routeId,
    busId,
    busData,
    userData,
    refreshSession,
    isBusDataComplete,
    isOn,
    busApprovalStatus,
    setTrackingEnabled,
    isTrackingUpdating,
    finishRoute,
    isFinishingRoute,
  } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);

  const selectedDirection =
    typeof userData === "object" &&
    userData !== null &&
    "direction" in userData &&
    typeof (userData as Record<string, unknown>).direction === "string" &&
    (userData as Record<string, string>).direction.toUpperCase() === "BACKWARD"
      ? "BACKWARD"
      : "FORWARD";

  const canControlTracking =
    isBusDataComplete && busApprovalStatus === "approved";
  const isTrackingOn = canControlTracking && isOn === 1;
  const isEnabled =
    isAuthenticated && Boolean(routeId) && canControlTracking && isTrackingOn;

  const {
    status,
    errorMessage,
    reconnectCount,
    isResyncing,
    lastReconnectAt,
    lastMessageAt,
    channel,
    neighbors,
    buses,
    selfBus,
  } = useRouteLiveFeed({
    enabled: isEnabled,
    busId,
    routeId,
    direction: selectedDirection,
    refreshSession,
  });

  const statusTone = useMemo(() => {
    if (status === "connected") {
      return {
        background: theme.accentSoft,
        border: theme.accentMuted,
        text: theme.accent,
      };
    }

    if (status === "reconnecting" || status === "authenticating") {
      return {
        background: theme.surfaceAlt,
        border: theme.border,
        text: theme.textMuted,
      };
    }

    if (status === "error") {
      return {
        background: theme.dangerSoft,
        border: theme.danger,
        text: theme.danger,
      };
    }

    return {
      background: theme.surfaceAlt,
      border: theme.border,
      text: theme.textMuted,
    };
  }, [status, theme]);

  const formatDistance = useCallback(
    (value: number | null) => {
      if (value == null || !Number.isFinite(value)) {
        return t("tracking.unknownValue");
      }

      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)} km`;
      }

      return `${Math.round(value)} m`;
    },
    [t],
  );

  const formatAge = useCallback(
    (value: number | null) => {
      if (value == null || !Number.isFinite(value)) {
        return t("tracking.unknownValue");
      }

      const seconds = Math.max(0, Math.round(value / 1000));
      return t("tracking.secondsAgo", { count: seconds });
    },
    [t],
  );

  const formatEta = useCallback(
    (value: number | null) => {
      if (value == null || !Number.isFinite(value)) {
        return t("tracking.unknownValue");
      }

      const rounded = Math.max(0, Math.round(value));
      return t("tracking.secondsValue", { count: rounded });
    },
    [t],
  );

  const renderNeighborList = useCallback(
    (title: string, entries: LiveNeighbor[]) => {
      return (
        <View style={styles.neighborCard}>
          <Text style={styles.neighborTitle}>{title}</Text>

          {entries.length === 0 ? (
            <Text style={styles.emptyText}>{t("tracking.noNeighbors")}</Text>
          ) : (
            entries.map((neighbor) => (
              <View key={neighbor.busId} style={styles.neighborItem}>
                <View style={styles.neighborRow}>
                  <Text style={styles.neighborBusId}>{neighbor.busId}</Text>
                  {neighbor.isStale ? (
                    <Text style={styles.staleBadge}>{t("tracking.stale")}</Text>
                  ) : null}
                </View>
                <Text style={styles.neighborMeta}>
                  {t("tracking.distance")}:{" "}
                  {formatDistance(neighbor.distanceMeters)}
                </Text>
                <Text style={styles.neighborMeta}>
                  {t("tracking.eta")}: {formatEta(neighbor.etaSeconds)}
                </Text>
                <Text style={styles.neighborMeta}>
                  {t("tracking.updated")}: {formatAge(neighbor.ageMs)}
                </Text>
              </View>
            ))
          )}
        </View>
      );
    },
    [formatAge, formatDistance, formatEta, styles, t],
  );

  const handleToggleTracking = useCallback(async () => {
    const saved = await setTrackingEnabled(!isTrackingOn);
    if (!saved) {
      notify({
        type: "error",
        error: t("tracking.toggleError"),
      });
    }
  }, [isTrackingOn, notify, setTrackingEnabled, t]);

  const handleFinishRoute = useCallback(() => {
    Alert.alert(
      t("tracking.finishRouteTitle"),
      t("tracking.finishRouteConfirm"),
      [
        {
          text: t("tracking.cancel"),
          style: "cancel",
        },
        {
          text: t("tracking.confirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              const saved = await finishRoute();
              if (!saved) {
                notify({
                  type: "error",
                  error: t("tracking.finishRouteError"),
                });
                return;
              }

              notify({
                type: "normal",
                message: t("tracking.finishRouteSuccess"),
              });
            })();
          },
        },
      ],
    );
  }, [finishRoute, notify, t]);

  const showNoRoute = !routeId;
  const routePolylineCoordinates = useMemo(
    () =>
      Array.isArray(busData?.routeCoordinates)
        ? busData.routeCoordinates
            .map((entry) => ({
              latitude: Number(entry.latitude),
              longitude: Number(entry.longitude),
            }))
            .filter(
              (entry) =>
                Number.isFinite(entry.latitude) &&
                Number.isFinite(entry.longitude),
            )
        : [],
    [busData?.routeCoordinates],
  );

  const neighborMarkers = useMemo(() => {
    const aheadMarkers = neighbors.ahead
      .filter(
        (entry) =>
          entry.lat !== null &&
          entry.lng !== null &&
          Number.isFinite(entry.lat) &&
          Number.isFinite(entry.lng),
      )
      .map((entry) => ({
        busId: entry.busId,
        latitude: entry.lat as number,
        longitude: entry.lng as number,
        segment: "ahead" as const,
      }));

    const behindMarkers = neighbors.behind
      .filter(
        (entry) =>
          entry.lat !== null &&
          entry.lng !== null &&
          Number.isFinite(entry.lat) &&
          Number.isFinite(entry.lng),
      )
      .map((entry) => ({
        busId: entry.busId,
        latitude: entry.lat as number,
        longitude: entry.lng as number,
        segment: "behind" as const,
      }));

    const deduped = new Map<string, (typeof aheadMarkers)[number]>();
    for (const marker of [...aheadMarkers, ...behindMarkers]) {
      if (!deduped.has(marker.busId)) {
        deduped.set(marker.busId, marker as any);
      }
    }

    return Array.from(deduped.values());
  }, [neighbors.ahead, neighbors.behind]);

  const mapRegion = useMemo<Region>(() => {
    const points = [
      ...routePolylineCoordinates,
      ...(selfBus
        ? [
            {
              latitude: selfBus.lat,
              longitude: selfBus.lng,
            },
          ]
        : []),
      ...neighborMarkers.map((entry) => ({
        latitude: entry.latitude,
        longitude: entry.longitude,
      })),
    ];

    if (points.length === 0) {
      return defaultMapRegion;
    }

    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latitude = (minLat + maxLat) / 2;
    const longitude = (minLng + maxLng) / 2;
    const latitudeDelta = Math.max(0.02, (maxLat - minLat) * 1.5);
    const longitudeDelta = Math.max(0.02, (maxLng - minLng) * 1.5);

    return {
      latitude,
      longitude,
      latitudeDelta,
      longitudeDelta,
    };
  }, [neighborMarkers, routePolylineCoordinates, selfBus]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>{t("tracking.title")}</Text>
          <Text style={styles.subtitle}>{t("tracking.subtitle")}</Text>
        </View>

        {showNoRoute ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {t("tracking.noRouteTitle")}
            </Text>
            <Text style={styles.emptyText}>
              {t("tracking.noRouteSubtitle")}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.connectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t("tracking.connection")}
                </Text>
                <View
                  style={[
                    styles.connectionBadge,
                    {
                      backgroundColor: statusTone.background,
                      borderColor: statusTone.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.connectionBadgeText,
                      { color: statusTone.text },
                    ]}
                  >
                    {t(`tracking.status.${status}`)}
                  </Text>
                </View>
              </View>

              <Text style={styles.infoLine}>
                {t("tracking.route")}: {routeId}
              </Text>
              <Text style={styles.infoLine}>
                {t("tracking.direction")}: {selectedDirection}
              </Text>
              <Text style={styles.infoLine}>
                {t("tracking.channel")}: {channel || t("tracking.unknownValue")}
              </Text>
              <Text style={styles.infoLine}>
                {t("tracking.lastEvent")}: {formatClockTime(lastMessageAt)}
              </Text>
              <Text style={styles.infoLine}>
                {t("tracking.lastReconnect")}:{" "}
                {formatClockTime(lastReconnectAt)}
              </Text>
              <Text style={styles.infoLine}>
                {t("tracking.reconnectCount")}: {reconnectCount}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={handleToggleTracking}
                  disabled={!canControlTracking || isTrackingUpdating}
                  style={[
                    styles.trackingToggleButton,
                    isTrackingOn
                      ? styles.trackingToggleButtonOn
                      : styles.trackingToggleButtonOff,
                    (!canControlTracking || isTrackingUpdating) &&
                      styles.trackingToggleButtonDisabled,
                  ]}
                >
                  <Text style={styles.trackingToggleButtonText}>
                    {isTrackingUpdating
                      ? isTrackingOn
                        ? t("tracking.turningOff")
                        : t("tracking.turningOn")
                      : isTrackingOn
                        ? t("tracking.turnOff")
                        : t("tracking.turnOn")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleFinishRoute}
                  disabled={!canControlTracking || isFinishingRoute}
                  style={[
                    styles.finishRouteButton,
                    (!canControlTracking || isFinishingRoute) &&
                      styles.trackingToggleButtonDisabled,
                  ]}
                >
                  <Text style={styles.finishRouteButtonText}>
                    {isFinishingRoute
                      ? t("tracking.finishingRoute")
                      : t("tracking.finishRoute")}
                  </Text>
                </Pressable>
                {!isTrackingOn ? (
                  <Text style={styles.trackingPausedText}>
                    {t("tracking.pausedHint")}
                  </Text>
                ) : null}
              </View>

              {isResyncing ? (
                <Text style={styles.resyncText}>{t("tracking.resyncing")}</Text>
              ) : null}

              {errorMessage ? (
                <Text style={styles.errorText}>
                  {t("tracking.socketError")}: {errorMessage}
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("tracking.neighbors")}</Text>
              <Text style={styles.sectionSubtitle}>
                {t("tracking.lastNeighborUpdate")}:{" "}
                {formatClockTime(neighbors.timestamp)}
              </Text>

              <View style={styles.neighborGrid}>
                {renderNeighborList(t("tracking.ahead"), neighbors.ahead)}
                {renderNeighborList(t("tracking.behind"), neighbors.behind)}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {t("tracking.neighborMap")}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {t("tracking.mapSubtitle")}
              </Text>

              {neighborMarkers.length === 0 && !selfBus ? (
                <Text style={styles.emptyText}>
                  {t("tracking.noMapNeighbors")}
                </Text>
              ) : (
                <View style={styles.mapWrap}>
                  <MapView
                    style={styles.map}
                    initialRegion={mapRegion}
                    region={mapRegion}
                    rotateEnabled
                    pitchEnabled
                    mapType={Platform.OS === "android" ? "none" : "standard"}
                  >
                    <UrlTile
                      urlTemplate={mapTilesUrl}
                      maximumZ={19}
                      shouldReplaceMapContent={Platform.OS === "ios"}
                    />
                    {routePolylineCoordinates.length > 1 ? (
                      <Polyline
                        coordinates={routePolylineCoordinates}
                        strokeWidth={5}
                        lineCap="round"
                        lineJoin="round"
                        strokeColor={theme.accent}
                      />
                    ) : null}

                    {selfBus ? (
                      <Marker
                        key={`self-${selfBus.busId}`}
                        coordinate={{
                          latitude: selfBus.lat,
                          longitude: selfBus.lng,
                        }}
                        title={`${t("tracking.selfBus")} ${selfBus.busId}`}
                        pinColor={theme.accent}
                      />
                    ) : null}

                    {neighborMarkers.map((marker) => (
                      <Marker
                        key={`${marker.segment}-${marker.busId}`}
                        coordinate={{
                          latitude: marker.latitude,
                          longitude: marker.longitude,
                        }}
                        title={`${marker.busId}`}
                        description={
                          marker.segment === "ahead"
                            ? t("tracking.ahead")
                            : t("tracking.behind")
                        }
                        pinColor={
                          marker.segment === "ahead" ? "#1E88E5" : "#FB8C00"
                        }
                      />
                    ))}
                  </MapView>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.connectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t("tracking.liveBuses")}
                </Text>
                <Text style={styles.liveCount}>
                  {t("tracking.busCount", { count: buses.length })}
                </Text>
              </View>

              {buses.length === 0 ? (
                <Text style={styles.emptyText}>
                  {t("tracking.noLiveBuses")}
                </Text>
              ) : (
                buses.map((bus) => (
                  <View key={bus.busId} style={styles.busRow}>
                    <View style={styles.neighborRow}>
                      <Text style={styles.busId}>{bus.busId}</Text>
                      <View style={styles.badgesRow}>
                        {bus.isStale ? (
                          <Text style={styles.staleBadge}>
                            {t("tracking.stale")}
                          </Text>
                        ) : null}
                        {bus.isOffTrack ? (
                          <Text style={styles.offTrackBadge}>
                            {t("tracking.offTrack")}
                          </Text>
                        ) : null}
                        {bus.tripStatus === "ARRIVED" ? (
                          <Text style={styles.arrivedBadge}>
                            {t("tracking.arrived")}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.busMeta}>
                      {t("tracking.speed")}: {Math.round(bus.speed)} km/h
                    </Text>
                    <Text style={styles.busMeta}>
                      {t("tracking.progress")}:{" "}
                      {(bus.progress * 100).toFixed(1)}%
                    </Text>
                    <Text style={styles.busMeta}>
                      {t("tracking.distance")}:{" "}
                      {formatDistance(bus.distanceMeters)}
                    </Text>
                    <Text style={styles.busMeta}>
                      {t("tracking.coords")}: {bus.lat.toFixed(5)},{" "}
                      {bus.lng.toFixed(5)}
                    </Text>
                    <Text style={styles.busMeta}>
                      {t("tracking.updated")}: {formatAge(bus.ageMs)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 28,
      paddingTop: 16,
      gap: 14,
    },
    headerCard: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    title: {
      color: theme.text,
      fontSize: 22,
      fontFamily: fontFamilies.display,
    },
    subtitle: {
      marginTop: 4,
      color: theme.textMuted,
      fontSize: 14,
      fontFamily: fontFamilies.body,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 17,
      fontFamily: fontFamilies.brand,
    },
    sectionSubtitle: {
      marginTop: 4,
      color: theme.textMuted,
      fontSize: 13,
      fontFamily: fontFamilies.body,
    },
    connectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    connectionBadge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    connectionBadgeText: {
      fontSize: 12,
      fontFamily: fontFamilies.eyebrow,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    infoLine: {
      marginTop: 8,
      color: theme.textMuted,
      fontSize: 13,
      fontFamily: fontFamilies.body,
    },
    actionRow: {
      marginTop: 10,
      gap: 8,
    },
    trackingToggleButton: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    trackingToggleButtonOn: {
      backgroundColor: theme.dangerSoft,
      borderColor: theme.danger,
    },
    trackingToggleButtonOff: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
    },
    trackingToggleButtonDisabled: {
      opacity: 0.6,
    },
    trackingToggleButtonText: {
      fontSize: 13,
      fontFamily: fontFamilies.brand,
      color: theme.text,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    trackingPausedText: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: fontFamilies.body,
    },
    finishRouteButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.danger,
      backgroundColor: theme.dangerSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    finishRouteButtonText: {
      fontSize: 13,
      fontFamily: fontFamilies.brand,
      color: theme.danger,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    resyncText: {
      marginTop: 10,
      color: theme.accent,
      fontSize: 13,
      fontFamily: fontFamilies.brand,
    },
    errorText: {
      marginTop: 10,
      color: theme.danger,
      fontSize: 13,
      fontFamily: fontFamilies.body,
    },
    neighborGrid: {
      marginTop: 12,
      gap: 10,
    },
    mapWrap: {
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: theme.mapBackground,
    },
    map: {
      width: "100%",
      height: 260,
    },
    neighborCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.surfaceAlt,
      gap: 8,
    },
    neighborTitle: {
      color: theme.text,
      fontSize: 14,
      fontFamily: fontFamilies.brand,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    neighborItem: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 3,
    },
    neighborRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
    },
    neighborBusId: {
      color: theme.text,
      fontSize: 13,
      fontFamily: fontFamilies.brand,
    },
    neighborMeta: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: fontFamilies.body,
    },
    emptyText: {
      marginTop: 6,
      color: theme.textMuted,
      fontSize: 13,
      fontFamily: fontFamilies.body,
    },
    liveCount: {
      color: theme.textSubtle,
      fontSize: 12,
      fontFamily: fontFamilies.eyebrow,
    },
    busRow: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
    },
    busId: {
      color: theme.text,
      fontSize: 14,
      fontFamily: fontFamilies.brand,
    },
    badgesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    staleBadge: {
      color: theme.textMuted,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
      fontSize: 10,
      fontFamily: fontFamilies.eyebrow,
      letterSpacing: 0.5,
    },
    offTrackBadge: {
      color: theme.danger,
      borderWidth: 1,
      borderColor: theme.danger,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
      fontSize: 10,
      fontFamily: fontFamilies.eyebrow,
      letterSpacing: 0.5,
    },
    arrivedBadge: {
      color: theme.accent,
      borderWidth: 1,
      borderColor: theme.accent,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
      fontSize: 10,
      fontFamily: fontFamilies.eyebrow,
      letterSpacing: 0.5,
    },
    busMeta: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: fontFamilies.body,
    },
  });
