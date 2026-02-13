import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";

export default function TrackingScreen() {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t("tracking.title")}</Text>
        <Text style={styles.subtitle}>{t("tracking.subtitle")}</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 20,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  title: {
    fontSize: 22,
    color: theme.text,
    fontFamily: fontFamilies.display,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: theme.textMuted,
    fontFamily: fontFamilies.body,
  },
});
