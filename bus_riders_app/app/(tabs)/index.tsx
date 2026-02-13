import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Region, UrlTile, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { BusApprovalPendingOverlay } from "@/components/bus-approval-pending";
import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAuth } from "@/contexts/auth-context";
import { useMqttPublisher } from "@/hooks/use-mqtt-publisher";
import { fontFamilies } from "@/constants/themes";

const busesAhead = [
  {
    id: "402",
    route: "Albrook - Transistmica",
    meta: "300m away",
    status: "5m",
    tone: "onTime",
  },
  {
    id: "501",
    route: "Metromall - Costa del Este",
    meta: "850m away",
    status: "1m",
    tone: "delayed",
  },
];

const busesBehind = [
  {
    id: "488",
    route: "Paitilla - Clayton",
    meta: "1.2km away - Passed 4m ago",
    status: "1m",
    tone: "delayed",
  },
];

const mapTilesUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const initialRegion: Region = {
  latitude: 8.9824,
  longitude: -79.5199,
  latitudeDelta: 0.16,
  longitudeDelta: 0.16,
};

export default function HomeScreen() {
  const {
    isBusDataComplete,
    busApprovalStatus,
    busId,
    routeId,
    busData,
    hasBusInfo,
  } = useAuth();

  const { publishLocation } = useMqttPublisher({
    busId,
    routeId,
    direction: "FORWARD",
    enabled: isBusDataComplete,
  });
  const theme = useAppTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const isApproved = isBusDataComplete && busApprovalStatus === "approved";

  const isPendingApproval = isBusDataComplete && !isApproved;
  const mapRef = useRef<MapView | null>(null);
  const mapRegionRef = useRef<Region>(initialRegion);
  const smoothedLocationRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lastRecenterAtRef = useRef(0);
  const [mapRegion, setMapRegion] = useState<Region>(initialRegion);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [intersections, setIntersections] = useState([]);

  useEffect(() => {
    mapRegionRef.current = mapRegion;
  }, [mapRegion]);

  useEffect(() => {
    if (busData?.routeCoordinates) {
      setIntersections(busData?.routeCoordinates as any);
    }
  }, [hasBusInfo, busData]);

  const smoothCoords = useCallback(
    (coords: { latitude: number; longitude: number }, smooth: boolean) => {
      if (!smooth) {
        const next = { latitude: coords.latitude, longitude: coords.longitude };
        smoothedLocationRef.current = next;
        return next;
      }

      const previous = smoothedLocationRef.current;
      if (!previous) {
        const next = { latitude: coords.latitude, longitude: coords.longitude };
        smoothedLocationRef.current = next;
        return next;
      }

      const smoothingFactor = 0.2;
      const next = {
        latitude:
          previous.latitude +
          (coords.latitude - previous.latitude) * smoothingFactor,
        longitude:
          previous.longitude +
          (coords.longitude - previous.longitude) * smoothingFactor,
      };

      smoothedLocationRef.current = next;
      return next;
    },
    [],
  );

  const moveToCoords = useCallback(
    (
      coords: { latitude: number; longitude: number },
      duration = 800,
      smooth = true,
    ) => {
      const smoothed = smoothCoords(coords, smooth);
      const nextRegion = {
        ...mapRegionRef.current,
        latitude: smoothed.latitude,
        longitude: smoothed.longitude,
      };

      setUserLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, duration);
    },
    [smoothCoords],
  );

  useEffect(() => {
    if (!isApproved) {
      setHasLocationPermission(false);
      setIsLocating(false);
      setUserLocation(null);
      return;
    }

    let isMounted = true;

    const requestLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMounted) {
        return;
      }

      if (status !== "granted") {
        setHasLocationPermission(false);
        return;
      }

      setHasLocationPermission(true);
      setIsLocating(true);

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isMounted) {
          return;
        }

        moveToCoords(current.coords, 700, false);
      } catch {
        // Ignore initial location errors.
      } finally {
        if (isMounted) {
          setIsLocating(false);
        }
      }
    };

    requestLocation();

    return () => {
      isMounted = false;
    };
  }, [isApproved, moveToCoords]);

  const handleZoom = (direction: "in" | "out") => {
    const zoomFactor = direction === "in" ? 0.5 : 2;
    const nextRegion = {
      ...mapRegion,
      latitudeDelta: mapRegion.latitudeDelta * zoomFactor,
      longitudeDelta: mapRegion.longitudeDelta * zoomFactor,
    };

    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 200);
  };

  const handleLocate = async () => {
    if (!isApproved) {
      return;
    }
    if (userLocation) {
      moveToCoords(userLocation, 700, false);
      return;
    }

    if (!hasLocationPermission) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }
      setHasLocationPermission(true);
    }

    setIsLocating(true);
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      moveToCoords(current.coords, 700, false);
    } finally {
      setIsLocating(false);
    }
  };

  const handleUserLocationChange = useCallback(
    (event: {
      nativeEvent: {
        coordinate?: {
          latitude: number;
          longitude: number;
          speed?: number | null;
          heading?: number | null;
        };
      };
    }) => {
      const coordinate = event.nativeEvent.coordinate;
      if (!coordinate) {
        return;
      }

      const now = Date.now();
      if (now - lastRecenterAtRef.current < 250) {
        return;
      }

      lastRecenterAtRef.current = now;
      void publishLocation({
        lat: coordinate.latitude,
        lng: coordinate.longitude,
        speed: coordinate.speed ?? 0,
        heading: coordinate.heading ?? undefined,
        timestamp: now,
      });
      moveToCoords(
        { latitude: coordinate.latitude, longitude: coordinate.longitude },
        1000,
        true,
      );
    },
    [moveToCoords, publishLocation],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.mapArea, !isApproved && styles.mapAreaFull]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          onRegionChangeComplete={setMapRegion}
          onUserLocationChange={
            isApproved ? handleUserLocationChange : undefined
          }
          showsUserLocation={isApproved && hasLocationPermission}
          showsMyLocationButton={isApproved && hasLocationPermission}
          rotateEnabled
          pitchEnabled
          mapType={Platform.OS === "android" ? "none" : "standard"}
        >
          <UrlTile
            urlTemplate={mapTilesUrl}
            maximumZ={19}
            shouldReplaceMapContent={Platform.OS === "ios"}
          />
          {isApproved ? (
            <Polyline
              coordinates={intersections}
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
              fillColor={theme.border}
              strokeColors={[theme.accent]}
            />
          ) : null}
        </MapView>

        {isApproved ? (
          <>
            <SafeAreaView
              edges={["top"]}
              style={styles.mapOverlay}
              pointerEvents="box-none"
            >
              <View style={styles.trackingCard}>
                <View style={styles.trackingIcon}>
                  <Ionicons name="trail-sign" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.trackingInfo}>
                  <Text style={styles.trackingLabel}>
                    {t("home.currentTracking")}
                  </Text>
                  <Text style={styles.trackingRoute}>
                    {t("home.routePrefix")} Albrook - Transistmica
                  </Text>
                </View>
              </View>
            </SafeAreaView>

            <View style={styles.mapControls} pointerEvents="box-none">
              <View style={styles.controlGroup}>
                <Pressable
                  style={styles.controlButton}
                  accessibilityRole="button"
                >
                  <Ionicons name="layers" size={18} color={theme.textMuted} />
                </Pressable>
                <View style={styles.controlDivider} />
                <Pressable
                  style={styles.controlButton}
                  accessibilityRole="button"
                  onPress={() => handleZoom("in")}
                >
                  <Ionicons name="add" size={20} color={theme.textMuted} />
                </Pressable>
                <View style={styles.controlDivider} />
                <Pressable
                  style={styles.controlButton}
                  accessibilityRole="button"
                  onPress={() => handleZoom("out")}
                >
                  <Ionicons name="remove" size={20} color={theme.textMuted} />
                </Pressable>
              </View>
              <Pressable
                style={[
                  styles.controlFloating,
                  isLocating && styles.controlFloatingActive,
                ]}
                accessibilityRole="button"
                onPress={handleLocate}
              >
                <Ionicons
                  name="locate"
                  size={22}
                  color={isLocating ? theme.accent : theme.accentMuted}
                />
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      {isApproved ? (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sectionRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="play-forward" size={18} color={theme.accent} />
                <Text style={styles.sectionTitle}>{t("home.busesAhead")}</Text>
              </View>
              <Text style={styles.sectionMeta}>{t("home.nextTenMinutes")}</Text>
            </View>

            {busesAhead.map((bus) => (
              <View key={bus.id} style={styles.busCard}>
                <View style={styles.busBadge}>
                  <Text style={styles.busBadgeText}>{bus.id}</Text>
                </View>
                <View style={styles.busInfo}>
                  <Text style={styles.busRoute}>{bus.route}</Text>
                  <Text style={styles.busMeta}>{bus.meta}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    bus.tone === "onTime"
                      ? styles.statusOnTime
                      : styles.statusDelayed,
                  ]}
                >
                  {bus.tone === "onTime" ? (
                    <View style={styles.statusDot} />
                  ) : null}
                  <Text
                    style={[
                      styles.statusText,
                      bus.tone === "onTime"
                        ? styles.statusTextOnTime
                        : styles.statusTextDelayed,
                    ]}
                  >
                    {bus.status}
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.sectionRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={theme.textSubtle}
                />
                <Text style={styles.sectionTitleMuted}>
                  {t("home.busesBehind")}
                </Text>
              </View>
            </View>

            {busesBehind.map((bus) => (
              <View key={bus.id} style={[styles.busCard, styles.busCardMuted]}>
                <View style={[styles.busBadge, styles.busBadgeMuted]}>
                  <Text style={styles.busBadgeMutedText}>{bus.id}</Text>
                </View>
                <View style={styles.busInfo}>
                  <Text style={styles.busRouteMuted}>{bus.route}</Text>
                  <Text style={styles.busMetaMuted}>{bus.meta}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    bus.tone === "onTime"
                      ? styles.statusOnTime
                      : styles.statusDelayed,
                  ]}
                >
                  {bus.tone === "onTime" ? (
                    <View style={styles.statusDot} />
                  ) : null}
                  <Text
                    style={[
                      styles.statusText,
                      bus.tone === "onTime"
                        ? styles.statusTextOnTime
                        : styles.statusTextDelayed,
                    ]}
                  >
                    {bus.status}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <BusApprovalPendingOverlay visible={isPendingApproval} />
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    mapArea: {
      flex: 1,
      maxHeight: "65%",
    },
    mapAreaFull: {
      maxHeight: "100%",
    },
    map: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.mapBackground,
    },
    mapOverlay: {
      paddingHorizontal: 10,
    },
    backButton: {
      position: "absolute",
      left: 0,
      paddingVertical: 6,
      paddingRight: 8,
    },
    topTitle: {
      fontSize: 12,
      letterSpacing: 2,
      color: theme.textSubtle,
      fontFamily: fontFamilies.eyebrow,
    },
    trackingCard: {
      marginTop: 10,
      borderRadius: 18,
      backgroundColor: theme.surface,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    trackingIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    trackingInfo: {
      flex: 1,
    },
    trackingLabel: {
      fontSize: 12,
      letterSpacing: 1.2,
      color: theme.textSubtle,
      fontFamily: fontFamilies.eyebrow,
    },
    trackingRoute: {
      marginTop: 2,
      fontSize: 16,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    trackingClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    chipRow: {
      marginTop: 12,
      flexDirection: "row",
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 18,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginRight: 10,
    },
    chipIcon: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#27C55C",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    chipSuccess: {
      backgroundColor: "#3DBF5A",
    },
    chipNeutral: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    chipTextLight: {
      color: "#FFFFFF",
      fontSize: 13,
      fontFamily: fontFamilies.brand,
    },
    chipTextDark: {
      marginLeft: 8,
      color: theme.text,
      fontSize: 13,
      fontFamily: fontFamilies.brand,
    },
    mapPin: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    busMarker: {
      alignItems: "center",
    },
    busMarkerIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    busMarkerLabel: {
      marginTop: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    busMarkerText: {
      color: theme.accent,
      fontSize: 12,
      fontFamily: fontFamilies.display,
    },
    mapControls: {
      position: "absolute",
      right: 16,
      top: "40%",
      alignItems: "center",
    },
    controlGroup: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    controlButton: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    controlDivider: {
      height: 1,
      backgroundColor: theme.border,
    },
    controlFloating: {
      marginTop: 12,
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.surface,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    controlFloatingActive: {
      borderWidth: 1,
      borderColor: theme.accent,
    },
    bottomSheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: "40%",
      backgroundColor: theme.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 10,
      paddingHorizontal: 20,
      paddingBottom: 24,
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -6 },
      elevation: 12,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.border,
      marginBottom: 12,
    },
    sheetContent: {
      paddingBottom: 24,
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    sectionTitle: {
      marginLeft: 8,
      fontSize: 18,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    sectionTitleMuted: {
      marginLeft: 8,
      fontSize: 18,
      color: theme.textSubtle,
      fontFamily: fontFamilies.display,
    },
    sectionMeta: {
      fontSize: 12,
      color: theme.textSubtle,
      letterSpacing: 1,
      fontFamily: fontFamilies.eyebrow,
    },
    busCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      padding: 5,
      marginBottom: 5,
    },
    busCardMuted: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.border,
    },
    busBadge: {
      width: 54,
      height: 54,
      borderRadius: 16,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    busBadgeText: {
      color: theme.accent,
      fontSize: 18,
      fontFamily: fontFamilies.display,
    },
    busBadgeMuted: {
      backgroundColor: theme.surfaceMuted,
    },
    busBadgeMutedText: {
      color: theme.textSubtle,
      fontSize: 18,
      fontFamily: fontFamilies.display,
    },
    busInfo: {
      flex: 1,
    },
    busRoute: {
      fontSize: 16,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    busRouteMuted: {
      fontSize: 16,
      color: theme.textSubtle,
      fontFamily: fontFamilies.display,
    },
    busMeta: {
      marginTop: 4,
      fontSize: 13,
      color: theme.textMuted,
      fontFamily: fontFamilies.body,
    },
    busMetaMuted: {
      marginTop: 4,
      fontSize: 13,
      color: theme.textSubtle,
      fontFamily: fontFamilies.body,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    statusOnTime: {
      backgroundColor: theme.mode === "dark" ? "#1E3B2B" : "#E0F5E7",
    },
    statusDelayed: {
      backgroundColor: theme.mode === "dark" ? "#3D2220" : "#FBE4E1",
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.mode === "dark" ? "#6FE0A4" : "#34C36E",
      marginRight: 6,
    },
    statusText: {
      fontSize: 11,
      letterSpacing: 0.8,
      fontFamily: fontFamilies.eyebrow,
    },
    statusTextOnTime: {
      color: theme.mode === "dark" ? "#6FE0A4" : "#2F9C5A",
    },
    statusTextDelayed: {
      color: theme.mode === "dark" ? "#FF9C8B" : "#E5523B",
    },
  });
