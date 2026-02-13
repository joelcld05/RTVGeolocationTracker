import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";

const routeFilters = [
  { key: "active", labelKey: "routes.activeNow" },
  { key: "metro", labelKey: "routes.metroBus" },
  { key: "corredor", labelKey: "routes.corredor" },
  { key: "express", labelKey: "routes.express" },
];

type RouteTone = "teal" | "orange" | "gray" | "purple" | "blue";

type RouteStatus = "on" | "off";

type RouteLastSeen =
  | { type: "minutes"; value: number }
  | { type: "justNow" }
  | { type: "unknown" };

type RouteItem = {
  id: string;
  name: string;
  descriptorKey: string;
  status: RouteStatus;
  lastSeen: RouteLastSeen;
  tone: RouteTone;
};

const routes: RouteItem[] = [
  {
    id: "T040",
    name: "Albrook - Transistmica",
    descriptorKey: "routes.viaCentral",
    status: "on",
    lastSeen: { type: "minutes", value: 2 },
    tone: "teal",
  },
  {
    id: "S420",
    name: "Costa del Este - Corredor Sur",
    descriptorKey: "routes.directService",
    status: "on",
    lastSeen: { type: "minutes", value: 5 },
    tone: "orange",
  },
  {
    id: "V500",
    name: "Via Espana - Tocumen",
    descriptorKey: "routes.mainArterial",
    status: "off",
    lastSeen: { type: "unknown" },
    tone: "gray",
  },
  {
    id: "C641",
    name: "Paitilla - Calle 50",
    descriptorKey: "routes.financialDistrict",
    status: "on",
    lastSeen: { type: "justNow" },
    tone: "purple",
  },
  {
    id: "D120",
    name: "Don Bosco - Via Israel",
    descriptorKey: "routes.eastCoast",
    status: "on",
    lastSeen: { type: "minutes", value: 12 },
    tone: "blue",
  },
];

export default function RoutesScreen() {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const [activeTab, setActiveTab] = useState<"all" | "favorites">("all");
  const [activeFilter, setActiveFilter] = useState(routeFilters[0].key);
  const [search, setSearch] = useState("");

  const formatLastSeen = useCallback(
    (entry: RouteLastSeen) => {
      if (entry.type === "minutes") {
        return t("routes.minutesAgo", { count: entry.value });
      }
      if (entry.type === "justNow") {
        return t("routes.justNow");
      }
      return t("routes.unknownTime");
    },
    [t],
  );

  const badgeToneStyles = useMemo(() => {
    const isDark = theme.mode === "dark";
    return {
      teal: {
        backgroundColor: theme.accentSoft,
        borderColor: theme.accentMuted,
        color: theme.accent,
      },
      orange: {
        backgroundColor: isDark ? "#3A2A1A" : "#FFE7CF",
        borderColor: isDark ? "#5C3A1D" : "#FFC796",
        color: isDark ? "#FFB074" : "#E36B00",
      },
      gray: {
        backgroundColor: theme.surfaceMuted,
        borderColor: theme.border,
        color: theme.textSubtle,
      },
      purple: {
        backgroundColor: isDark ? "#2E2440" : "#F0E2FF",
        borderColor: isDark ? "#4B3568" : "#D6BBFF",
        color: isDark ? "#C7A6FF" : "#7C3AED",
      },
      blue: {
        backgroundColor: isDark ? "#1B2A48" : "#DEE9FF",
        borderColor: isDark ? "#2D3F66" : "#B9D2FF",
        color: isDark ? "#9CB7FF" : "#1D4ED8",
      },
    } satisfies Record<RouteTone, { backgroundColor: string; borderColor: string; color: string }>;
  }, [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerBadge}>
              <Ionicons name="bus" size={22} color={theme.accent} />
            </View>
            <Text style={styles.headerTitle}>{t("routes.title")}</Text>
          </View>
          <Pressable style={styles.headerAction} accessibilityRole="button">
            <Ionicons name="notifications" size={20} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("routes.searchPlaceholder")}
            placeholderTextColor={theme.textSubtle}
            style={styles.searchInput}
          />
          <Pressable style={styles.searchAction} accessibilityRole="button">
            <Ionicons name="options-outline" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={styles.segmentedControl}>
          {[
            { key: "all", label: t("routes.all") },
            { key: "favorites", label: t("routes.favorites") },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                onPress={() => setActiveTab(tab.key as "all" | "favorites")}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {routeFilters.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                accessibilityRole="button"
                onPress={() => setActiveFilter(filter.key)}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {t(filter.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.cardList}>
          {routes.map((route) => {
            const tone = badgeToneStyles[route.tone as RouteTone];
            const isOnline = route.status === "on";
            return (
              <View key={route.id} style={styles.routeCard}>
                <View
                  style={[
                    styles.routeBadge,
                    { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
                  ]}
                >
                  <Text style={[styles.routeBadgeText, { color: tone.color }]}>
                    {route.id}
                  </Text>
                </View>
                <View style={styles.routeInfo}>
                  <Text style={styles.routeTitle}>{route.name}</Text>
                  <Text style={styles.routeSubtitle}>{t(route.descriptorKey)}</Text>
                </View>
              <View style={styles.routeMeta}>
                <View style={[styles.statusPill, isOnline ? styles.statusOn : styles.statusOff]}>
                  <Text
                    style={[
                      styles.statusText,
                      isOnline ? styles.statusTextOn : styles.statusTextOff,
                    ]}
                  >
                    {t("routes.status")}: {isOnline ? t("routes.on") : t("routes.off")}
                  </Text>
                </View>
                <View style={styles.timeRow}>
                  <Ionicons name="time-outline" size={14} color={theme.textSubtle} />
                  <Text style={styles.timeText}>{formatLastSeen(route.lastSeen)}</Text>
                </View>
              </View>
            </View>
          );
        })}
        </View>
      </ScrollView>

      <Pressable style={styles.fab} accessibilityRole="button">
        <Ionicons name="paper-plane" size={22} color={theme.surface} />
      </Pressable>
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
      padding: 20,
      paddingBottom: 140,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 26,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    headerAction: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    searchInput: {
      flex: 1,
      marginLeft: 10,
      fontSize: 15,
      color: theme.text,
      fontFamily: fontFamilies.body,
    },
    searchAction: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    segmentedControl: {
      flexDirection: "row",
      backgroundColor: theme.surfaceAlt,
      borderRadius: 18,
      padding: 4,
      marginBottom: 16,
    },
    segmentButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 14,
      alignItems: "center",
    },
    segmentButtonActive: {
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    segmentText: {
      fontSize: 14,
      color: theme.textMuted,
      fontFamily: fontFamilies.brand,
    },
    segmentTextActive: {
      color: theme.accent,
    },
    filterRow: {
      paddingBottom: 6,
      gap: 10,
      paddingHorizontal: 2,
    },
    filterChip: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 18,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterChipActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    filterText: {
      fontSize: 14,
      color: theme.text,
      fontFamily: fontFamilies.brand,
    },
    filterTextActive: {
      color: theme.surface,
    },
    cardList: {
      marginTop: 10,
      gap: 14,
    },
    routeCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      backgroundColor: theme.surface,
      borderRadius: 18,
      shadowColor: theme.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    routeBadge: {
      width: 64,
      height: 64,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    routeBadgeText: {
      fontSize: 18,
      fontFamily: fontFamilies.display,
    },
    routeInfo: {
      flex: 1,
      paddingRight: 10,
    },
    routeTitle: {
      fontSize: 16,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    routeSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: theme.textMuted,
      fontFamily: fontFamilies.body,
    },
    routeMeta: {
      alignItems: "flex-end",
      gap: 8,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
    },
    statusOn: {
      backgroundColor: theme.mode === "dark" ? "#1E3B2B" : "#DFF6E8",
    },
    statusOff: {
      backgroundColor: theme.mode === "dark" ? "#23272E" : "#F1F3F5",
    },
    statusText: {
      fontSize: 11,
      letterSpacing: 0.6,
      fontFamily: fontFamilies.eyebrow,
    },
    statusTextOn: {
      color: theme.mode === "dark" ? "#6FE0A4" : "#1F9D5A",
    },
    statusTextOff: {
      color: theme.textSubtle,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    timeText: {
      marginLeft: 6,
      fontSize: 12,
      color: theme.textSubtle,
      fontFamily: fontFamilies.body,
    },
    fab: {
      position: "absolute",
      right: 24,
      bottom: 110,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
  });
