import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamilies } from "@/constants/themes";
import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";

type BusApprovalPendingOverlayProps = {
  visible: boolean;
  onContactSupport?: () => void;
};

export function BusApprovalPendingOverlay({
  visible,
  onContactSupport,
}: BusApprovalPendingOverlayProps) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={[styles.statusPill, { marginTop: insets.top + 12 }]}>
        <View style={styles.statusIcon}>
          <Ionicons name="hourglass-outline" size={18} color={theme.textMuted} />
        </View>
        <View style={styles.statusTextGroup}>
          <Text style={styles.statusLabel}>{t("busApproval.statusLabel")}</Text>
          <Text style={styles.statusValue}>
            {t("busApproval.awaitingVerification")}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.cardWrapper,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Ionicons
              name="clipboard-outline"
              size={26}
              color={theme.accent}
            />
          </View>
          <Text style={styles.title}>
            {t("busApproval.pendingTitle")}
          </Text>
          <Text style={styles.subtitle}>
            {t("busApproval.pendingMessage")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onContactSupport ?? (() => {})}
            style={({ pressed }) => [
              styles.contactButton,
              pressed && styles.contactButtonPressed,
            ]}
          >
            <Ionicons name="headset-outline" size={18} color="#FFFFFF" />
            <Text style={styles.contactButtonText}>
              {t("busApproval.contactSupport")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.mode === "dark" ? "rgba(7, 12, 15, 0.6)" : "rgba(8, 16, 20, 0.35)",
      paddingHorizontal: 24,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: theme.surface,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 14,
      shadowColor: theme.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    statusIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    statusTextGroup: {
      flex: 1,
    },
    statusLabel: {
      fontSize: 11,
      letterSpacing: 1.2,
      color: theme.textSubtle,
      fontFamily: fontFamilies.eyebrow,
    },
    statusValue: {
      marginTop: 2,
      fontSize: 14,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    cardWrapper: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: theme.surface,
      borderRadius: 28,
      padding: 24,
      alignItems: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    iconBadge: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    title: {
      fontSize: 20,
      color: theme.text,
      textAlign: "center",
      fontFamily: fontFamilies.display,
    },
    subtitle: {
      marginTop: 10,
      fontSize: 14,
      lineHeight: 20,
      color: theme.textMuted,
      textAlign: "center",
      fontFamily: fontFamilies.body,
    },
    contactButton: {
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accent,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 18,
      shadowColor: theme.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    contactButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    contactButtonText: {
      marginLeft: 10,
      fontSize: 16,
      color: "#FFFFFF",
      fontFamily: fontFamilies.display,
    },
  });
