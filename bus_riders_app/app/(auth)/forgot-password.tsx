import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  Animated,
  Easing,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFormik } from "formik";
import * as Yup from "yup";
import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";

const barHeights = [32, 68, 40, 58, 78, 36, 70, 46, 60, 34];

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;

  const validationSchema = useMemo(
    () =>
      Yup.object({
        email: Yup.string()
          .trim()
          .email(t("validation.invalidEmail"))
          .required(t("validation.required")),
      }),
    [t],
  );

  const formik = useFormik({
    initialValues: { email: "" },
    validationSchema,
    validateOnMount: true,
    onSubmit: async (_values, { setSubmitting }) => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 700));
      } finally {
        setSubmitting(false);
      }
    },
  });

  const isDisabled = useMemo(
    () => formik.isSubmitting || !formik.isValid,
    [formik.isSubmitting, formik.isValid],
  );

  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [formAnim, headerAnim]);

  const emailError = formik.touched.email ? formik.errors.email : undefined;

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.safe}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <Pressable
                onPress={() => router.push("/login")}
                accessibilityRole="button"
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={styles.topTitle}>{t("app.name").toUpperCase()}</Text>
            </View>

            <Animated.View
              style={[
                styles.headerBlock,
                {
                  opacity: headerAnim,
                  transform: [
                    {
                      translateY: headerAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.heroBadge}>
                <Ionicons name="lock-open" size={26} color={theme.accent} />
              </View>
              <Text style={styles.heroTitle}>{t("auth.forgotPassword")}</Text>
              <Text style={styles.heroSubtitle}>
                {t("auth.forgotSubtitle")}
              </Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.formBlock,
                {
                  opacity: formAnim,
                  transform: [
                    {
                      translateY: formAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [18, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.label}>{t("common.emailAddress")}</Text>
              <View
                style={[
                  styles.inputRow,
                  emailError && styles.inputRowError,
                ]}
              >
                <Ionicons name="mail" size={18} color={theme.textMuted} />
                <TextInput
                  value={formik.values.email}
                  onChangeText={formik.handleChange("email")}
                  onBlur={formik.handleBlur("email")}
                  placeholder={t("placeholders.emailAlt")}
                  placeholderTextColor={theme.textSubtle}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  style={styles.input}
                />
              </View>
              {emailError ? (
                <Text style={styles.errorText}>{emailError}</Text>
              ) : null}

              <Pressable
                onPress={() => formik.handleSubmit()}
                accessibilityRole="button"
                disabled={isDisabled}
                style={({ pressed }) => [
                  styles.primaryButton,
                  isDisabled && styles.primaryButtonDisabled,
                  pressed && !isDisabled && styles.primaryButtonPressed,
                ]}
              >
                <View style={styles.buttonContent}>
                  {formik.isSubmitting ? (
                    <ActivityIndicator
                      color={theme.surface}
                      style={styles.buttonSpinner}
                    />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {formik.isSubmitting
                      ? t("auth.sending")
                      : t("auth.sendResetLink")}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t("auth.rememberPrompt")}</Text>
              <Link href="/login" asChild>
                <Pressable accessibilityRole="button">
                  <Text style={styles.footerLink}>{t("common.logIn")}</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.barRow}>
              {barHeights.map((height, index) => (
                <View
                  key={`${height}-${index}`}
                  style={[styles.bar, { height }]}
                />
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    background: {
      flex: 1,
      backgroundColor: theme.background,
    },
    safe: {
      flex: 1,
    },
    content: {
      padding: 24,
      paddingBottom: 36,
      alignItems: "center",
    },
    topBar: {
      width: "100%",
      maxWidth: 420,
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
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
    headerBlock: {
      width: "100%",
      maxWidth: 420,
      marginTop: 24,
    },
    heroBadge: {
      width: 80,
      height: 80,
      borderRadius: 18,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    heroTitle: {
      marginTop: 22,
      fontSize: 30,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    heroSubtitle: {
      marginTop: 12,
      fontSize: 15,
      lineHeight: 22,
      color: theme.textMuted,
      fontFamily: fontFamilies.body,
      maxWidth: 320,
    },
    formBlock: {
      width: "100%",
      maxWidth: 420,
      marginTop: 28,
    },
    label: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 10,
      fontFamily: fontFamilies.body,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: theme.surface,
      shadowColor: theme.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    inputRowError: {
      borderColor: theme.danger,
      backgroundColor: theme.dangerSoft,
    },
    input: {
      flex: 1,
      paddingVertical: 12,
      marginLeft: 10,
      fontSize: 15,
      color: theme.text,
      fontFamily: fontFamilies.body,
    },
    errorText: {
      marginTop: 6,
      color: theme.danger,
      fontSize: 12,
      fontFamily: fontFamilies.body,
    },
    primaryButton: {
      marginTop: 20,
      backgroundColor: theme.accent,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    buttonContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    buttonSpinner: {
      marginRight: 8,
    },
    primaryButtonDisabled: {
      backgroundColor: theme.accentMuted,
    },
    primaryButtonPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.95,
    },
    primaryButtonText: {
      color: theme.surface,
      fontSize: 16,
      letterSpacing: 0.6,
      fontFamily: fontFamilies.display,
    },
    footer: {
      marginTop: 26,
      flexDirection: "row",
      alignItems: "center",
    },
    footerText: {
      color: theme.textMuted,
      fontSize: 14,
      fontFamily: fontFamilies.body,
      marginRight: 6,
    },
    footerLink: {
      color: theme.accent,
      fontSize: 14,
      fontFamily: fontFamilies.display,
    },
    barRow: {
      marginTop: 36,
      width: "100%",
      maxWidth: 420,
      height: 90,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingHorizontal: 8,
    },
    bar: {
      width: 6,
      borderRadius: 4,
      backgroundColor: theme.accentSoft,
    },
  });
