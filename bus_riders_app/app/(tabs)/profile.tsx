import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useThemePreference } from "@/contexts/theme-preference-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";

const profile = {
  name: "Carlos Chen",
  email: "carlos.chen@email.com",
};

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const { language, setLanguage, t } = useLanguage();
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.wave} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={theme.accent} />
          </Pressable>
          <Text style={styles.title}>{t("profile.title")}</Text>
          <View style={styles.topBarSpacer} />
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatarShell}>
            <View style={styles.avatarInner}>
              <Ionicons name="person" size={56} color={theme.text} />
            </View>
            <Pressable accessibilityRole="button" style={styles.editButton}>
              <Ionicons name="pencil" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>
        </View>

        <View style={styles.cardGroup}>
          <Pressable style={[styles.itemRow, styles.itemRowDivider]} accessibilityRole="button">
            <View style={styles.iconBadge}>
              <Ionicons name="bus" size={20} color={theme.accent} />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{t("profile.busInformation")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSubtle} />
          </Pressable>

          <Pressable style={styles.itemRow} accessibilityRole="button">
            <View style={styles.iconBadge}>
              <Ionicons name="globe-outline" size={20} color={theme.accent} />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{t("profile.changeLanguage")}</Text>
              <Text style={styles.itemSubtitle}>
                {language === "es"
                  ? t("profile.languageSpanish")
                  : t("profile.languageEnglish")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSubtle} />
          </Pressable>
          <View style={styles.segmentRow}>
            {[
              { key: "en", label: t("profile.languageEnglish") },
              { key: "es", label: t("profile.languageSpanish") },
            ].map((option) => {
              const isActive = language === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.segmentButton,
                    isActive && styles.segmentButtonActive,
                  ]}
                  accessibilityRole="button"
                  onPress={() => setLanguage(option.key as "en" | "es")}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      isActive && styles.segmentLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.cardGroup}>
          <View style={styles.itemRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="contrast" size={20} color={theme.accent} />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{t("profile.appearance")}</Text>
              <Text style={styles.itemSubtitleMuted}>
                {t("profile.chooseAppearance")}
              </Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            {[
              { key: "system", label: t("profile.system") },
              { key: "light", label: t("profile.light") },
              { key: "dark", label: t("profile.dark") },
            ].map((option) => {
              const isActive = preference === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.segmentButton,
                    isActive && styles.segmentButtonActive,
                  ]}
                  accessibilityRole="button"
                  onPress={() =>
                    setPreference(option.key as "system" | "light" | "dark")
                  }
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      isActive && styles.segmentLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.cardGroup}>
          <Link href="/change-password" asChild>
            <Pressable style={styles.itemRow} accessibilityRole="button">
              <View style={[styles.iconBadge, styles.iconBadgeMuted]}>
                <Ionicons name="refresh" size={20} color={theme.textMuted} />
              </View>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{t("profile.resetPassword")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSubtle} />
            </Pressable>
          </Link>
        </View>

        <Pressable onPress={signOut} accessibilityRole="button" style={styles.logoutButton}>
          <Ionicons name="log-out" size={18} color={theme.danger} />
          <Text style={styles.logoutText}>{t("profile.logout")}</Text>
        </Pressable>

        <Text style={styles.footer}>{t("profile.footer")}</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  wave: {
    position: "absolute",
    bottom: -40,
    left: -80,
    right: -80,
    height: 160,
    borderTopLeftRadius: 220,
    borderTopRightRadius: 220,
    backgroundColor: theme.surfaceMuted,
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarSpacer: {
    width: 40,
  },
  title: {
    fontSize: 20,
    color: theme.text,
    fontFamily: fontFamilies.display,
  },
  avatarSection: {
    alignItems: "center",
    marginTop: 8,
  },
  avatarShell: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 60,
    backgroundColor: theme.surface,
    shadowColor: theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  avatarInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: theme.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: theme.surface,
  },
  editButton: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: theme.surface,
  },
  name: {
    marginTop: 16,
    fontSize: 26,
    color: theme.text,
    fontFamily: fontFamilies.display,
  },
  email: {
    marginTop: 6,
    fontSize: 15,
    color: theme.textMuted,
    fontFamily: fontFamilies.body,
  },
  cardGroup: {
    marginTop: 24,
    backgroundColor: theme.surface,
    borderRadius: 20,
    shadowColor: theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadgeMuted: {
    backgroundColor: theme.surfaceMuted,
  },
  itemText: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    fontSize: 16,
    color: theme.text,
    fontFamily: fontFamilies.display,
  },
  itemSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: theme.accent,
    fontFamily: fontFamilies.brand,
  },
  itemSubtitleMuted: {
    marginTop: 4,
    fontSize: 13,
    color: theme.textMuted,
    fontFamily: fontFamilies.body,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    backgroundColor: theme.surfaceAlt,
  },
  segmentButtonActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  segmentLabel: {
    fontSize: 12,
    color: theme.textMuted,
    letterSpacing: 0.6,
    fontFamily: fontFamilies.eyebrow,
  },
  segmentLabelActive: {
    color: theme.surface,
  },
  logoutButton: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: theme.danger,
    backgroundColor: theme.dangerSoft,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  logoutText: {
    marginLeft: 10,
    fontSize: 16,
    color: theme.danger,
    fontFamily: fontFamilies.display,
  },
  footer: {
    marginTop: 26,
    textAlign: "center",
    fontSize: 12,
    color: theme.textSubtle,
    letterSpacing: 1.6,
    fontFamily: fontFamilies.eyebrow,
  },
});
