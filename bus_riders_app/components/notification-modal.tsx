import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fontFamilies } from "@/constants/themes";
import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";

export type NotificationType = "error" | "warning" | "info" | "normal";

type NotificationModalProps = {
  visible: boolean;
  type?: NotificationType;
  title?: string;
  message: string;
  onClose: () => void;
};

type TypeConfig = {
  accent: string;
  soft: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const resolveTypeConfig = (
  type: NotificationType,
  theme: ReturnType<typeof useAppTheme>,
): TypeConfig => {
  switch (type) {
    case "error":
      return {
        accent: theme.danger,
        soft: theme.dangerSoft,
        icon: "alert-circle",
      };
    case "warning":
      return {
        accent: theme.mode === "dark" ? "#F7C85F" : "#E09B00",
        soft: theme.mode === "dark" ? "#33260D" : "#FFF6E0",
        icon: "warning",
      };
    case "info":
      return {
        accent: theme.accent,
        soft: theme.accentSoft,
        icon: "information-circle",
      };
    case "normal":
      return {
        accent: theme.textMuted,
        soft: theme.surfaceAlt,
        icon: "notifications",
      };
  }
};

export function NotificationModal({
  visible,
  type = "normal",
  title,
  message,
  onClose,
}: NotificationModalProps) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const typeConfig = useMemo(
    () => resolveTypeConfig(type, theme),
    [type, theme],
  );
  const titleText = title ?? t(`notifications.${type}`);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.card, { borderColor: typeConfig.accent }]}
            onPress={() => {}}
            accessibilityRole="dialog"
          >
            <View style={styles.header}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: typeConfig.soft },
                ]}
              >
                <Ionicons
                  name={typeConfig.icon}
                  size={22}
                  color={typeConfig.accent}
                />
              </View>
              <View style={styles.titleWrap}>
                <Text style={[styles.title, { color: typeConfig.accent }]}>
                  {titleText}
                </Text>
              </View>
            </View>

            <Text style={styles.message}>{message}</Text>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.dismissButton,
                  { borderColor: typeConfig.accent },
                  pressed && styles.dismissButtonPressed,
                ]}
              >
                <Text style={[styles.dismissText, { color: typeConfig.accent }]}>
                  {t("notifications.dismiss")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    safe: {
      flex: 1,
    },
    backdrop: {
      flex: 1,
      padding: 24,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor:
        theme.mode === "dark" ? "rgba(0, 0, 0, 0.65)" : "rgba(9, 18, 22, 0.45)",
    },
    card: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      shadowColor: theme.shadow,
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    titleWrap: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontFamily: fontFamilies.display,
      letterSpacing: 0.4,
    },
    message: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.text,
      fontFamily: fontFamilies.body,
    },
    actions: {
      marginTop: 18,
      alignItems: "flex-end",
    },
    dismissButton: {
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 12,
    },
    dismissButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    dismissText: {
      fontSize: 13,
      letterSpacing: 0.4,
      fontFamily: fontFamilies.eyebrow,
    },
  });
