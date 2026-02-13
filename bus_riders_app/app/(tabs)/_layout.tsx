import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Tabs } from "expo-router";

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { isOn } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const trackingState = useMemo(() => {
    if (isOn === 1) {
      return {
        label: t("tabs.on"),
        ringStyle: styles.centerButtonOn,
        textStyle: styles.centerTopOn,
      };
    }
    if (isOn === -1) {
      return {
        label: t("tabs.pending"),
        ringStyle: styles.centerButtonPending,
        textStyle: styles.centerTopPending,
      };
    }
    return {
      label: t("tabs.off"),
      ringStyle: styles.centerButtonOff,
      textStyle: styles.centerTopOff,
    };
  }, [isOn, styles, t]);
  const insets = useSafeAreaInsets();
  const routesByName = useMemo(
    () => new Map(state.routes.map((route) => [route.name, route])),
    [state.routes],
  );
  const tabConfig = useMemo(
    () =>
      [
        { name: "index", label: t("tabs.map"), icon: "map", type: "standard" },
        {
          name: "routes",
          label: t("tabs.routes"),
          icon: "swap-horizontal",
          type: "standard",
        },
        {
          name: "tracking",
          label: t("tabs.tracking"),
          icon: "navigate",
          type: "center",
        },
        {
          name: "alerts",
          label: t("tabs.alerts"),
          icon: "notifications",
          type: "standard",
        },
        {
          name: "profile",
          label: t("tabs.profile"),
          icon: "person",
          type: "standard",
        },
      ] as const,
    [t],
  );

  return (
    <View
      style={[
        styles.tabBar,
        { paddingBottom: Math.max(insets.bottom - 5, 14) },
      ]}
    >
      <View style={styles.tabRow}>
        {tabConfig.map((tab) => {
          const route = routesByName.get(tab.name);
          if (!route) {
            return null;
          }
          const isFocused = state.routes[state.index]?.key === route.key;
          const options = descriptors[route.key]?.options ?? {};

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          if (tab.type === "center") {
            return (
              <View key={route.key} style={styles.centerSlot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={({ pressed }) => [
                    styles.centerButton,
                    trackingState.ringStyle,
                    pressed && styles.centerButtonPressed,
                  ]}
                >
                  <Text style={[styles.centerTop, trackingState.textStyle]}>
                    {trackingState.label}
                  </Text>
                  <Text style={styles.centerBottom}>
                    {t("tabs.trackingLabel")}
                  </Text>
                </Pressable>
              </View>
            );
          }

          const iconColor = isFocused ? theme.surface : theme.textSubtle;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabItem}
            >
              <View
                style={[
                  styles.tabIconWrap,
                  isFocused && styles.tabIconWrapActive,
                ]}
              >
                <Ionicons name={tab.icon} size={18} color={iconColor} />
              </View>
              <Text
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useLanguage();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.map"),
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: t("tabs.routes"),
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: t("tabs.tracking"),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t("tabs.alerts"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
        }}
      />
    </Tabs>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    tabBar: {
      backgroundColor: theme.tabBar,
      paddingTop: 5,
      paddingHorizontal: 5,
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -6 },
      elevation: 12,
      overflow: "visible",
    },
    tabRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    tabItem: {
      alignItems: "center",
      justifyContent: "flex-end",
      minWidth: 60,
    },
    tabIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
      backgroundColor: "transparent",
    },
    tabIconWrapActive: {
      backgroundColor: theme.accent,
    },
    tabLabel: {
      fontSize: 10,
      color: theme.textSubtle,
      letterSpacing: 1,
      fontFamily: fontFamilies.eyebrow,
      textTransform: "uppercase",
    },
    tabLabelActive: {
      color: theme.accent,
    },
    centerSlot: {
      alignItems: "center",
      width: 92,
      marginTop: -36,
    },
    centerButton: {
      width: 74,
      height: 74,
      borderRadius: 37,
      backgroundColor: theme.surface,
      borderWidth: 4,
      borderColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    centerButtonOn: {
      borderColor: theme.accent,
      backgroundColor: theme.surface,
    },
    centerButtonOff: {
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
    },
    centerButtonPending: {
      borderColor: theme.accentMuted,
      backgroundColor: theme.surface,
    },
    centerButtonPressed: {
      transform: [{ scale: 0.97 }],
    },
    centerTop: {
      fontSize: 14,
      letterSpacing: 1,
      fontFamily: fontFamilies.display,
    },
    centerTopOn: {
      color: theme.accent,
    },
    centerTopOff: {
      color: theme.textSubtle,
    },
    centerTopPending: {
      color: theme.textMuted,
    },
    centerBottom: {
      fontSize: 8,
      color: theme.textMuted,
      letterSpacing: 1,
      fontFamily: fontFamilies.eyebrow,
      marginTop: 2,
    },
  });
