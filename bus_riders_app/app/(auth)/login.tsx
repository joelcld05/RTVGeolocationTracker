import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Animated,
  Platform,
  Easing,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useNotification } from "@/contexts/notification-context";
import { AuthResponse, useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";
import { _post } from "@/libs/request";

export default function LoginScreen() {
  const { applySession } = useAuth();
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const heroAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const { f_post: authPost } = _post({
    useAuth: false,
    saveData: false,
  });

  const signIn = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      const response = (await authPost({
        url: "/auth/login",
        body: { email: normalizedEmail, password },
      })) as AuthResponse;
      await applySession(response);
      return response;
    },
    [applySession, authPost],
  );

  const validationSchema = useMemo(
    () =>
      Yup.object({
        email: Yup.string()
          .trim()
          .email(t("validation.invalidEmail"))
          .required(t("validation.required")),
        password: Yup.string().required(t("validation.required")),
      }),
    [t],
  );

  const formik = useFormik({
    initialValues: { email: "joshua@crowmie.com", password: "123123" },
    validationSchema,
    validateOnMount: true,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const response = await signIn(values.email.trim(), values.password);
        if (typeof response?.message === "string") {
          notify({ message: response.message, type: "info" });
        }
      } catch (error) {
        notify({ error, type: "error" });
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
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, heroAnim]);

  const emailError = formik.touched.email ? formik.errors.email : undefined;
  const passwordError = formik.touched.password
    ? formik.errors.password
    : undefined;

  return (
    <LinearGradient
      colors={
        theme.mode === "dark" ? ["#0F1418", "#111A1F"] : ["#F5FCFD", "#E7F2F4"]
      }
      style={styles.background}
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.safe}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brandRow}>
              <View style={styles.brandBadge}>
                <Ionicons name="bus" size={22} color={theme.accent} />
              </View>
              <Text style={styles.brandText}>{t("app.name")}</Text>
            </View>

            <Animated.View
              style={[
                styles.heroCard,
                {
                  opacity: heroAnim,
                  transform: [
                    {
                      translateY: heroAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [16, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={["#07B7C9", "#008489"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGradient}
              >
                <Text style={styles.heroEyebrow}>
                  {t("auth.realTimeTransit")}
                </Text>
                <Text style={styles.heroTitle}>
                  {t("auth.connectingPanamaCity")}
                </Text>
              </LinearGradient>
            </Animated.View>

            <Animated.View
              style={[
                styles.formCard,
                {
                  opacity: cardAnim,
                  transform: [
                    {
                      translateY: cardAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.formTitle}>{t("auth.welcomeBack")}</Text>
              <Text style={styles.formSubtitle}>{t("auth.loginSubtitle")}</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("common.emailAddress")}</Text>
                <TextInput
                  value={formik.values.email}
                  onChangeText={formik.handleChange("email")}
                  onBlur={formik.handleBlur("email")}
                  placeholder={t("placeholders.email")}
                  placeholderTextColor={theme.textSubtle}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  style={[styles.input, emailError && styles.inputError]}
                />
                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.passwordRow}>
                  <Text style={styles.label}>{t("common.password")}</Text>
                  <Link href="/forgot-password" asChild>
                    <Pressable accessibilityRole="button">
                      <Text style={styles.linkText}>
                        {t("auth.forgotPassword")}
                      </Text>
                    </Pressable>
                  </Link>
                </View>
                <TextInput
                  value={formik.values.password}
                  onChangeText={formik.handleChange("password")}
                  onBlur={formik.handleBlur("password")}
                  placeholder={t("placeholders.password")}
                  placeholderTextColor={theme.textSubtle}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  style={[styles.input, passwordError && styles.inputError]}
                />
                {passwordError ? (
                  <Text style={styles.errorText}>{passwordError}</Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => formik.handleSubmit()}
                accessibilityRole="button"
                disabled={isDisabled}
                style={({ pressed }) => [
                  styles.loginButton,
                  isDisabled && styles.loginButtonDisabled,
                  pressed && !isDisabled && styles.loginButtonPressed,
                ]}
              >
                <View style={styles.buttonContent}>
                  {formik.isSubmitting ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      style={styles.buttonSpinner}
                    />
                  ) : null}
                  <Text style={styles.loginButtonText}>
                    {formik.isSubmitting
                      ? t("auth.signingIn")
                      : t("common.login")}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t("auth.dontHaveAccount")}</Text>
              <Link href="/register" asChild>
                <Pressable accessibilityRole="button">
                  <Text style={styles.footerLink}>{t("common.signUp")}</Text>
                </Pressable>
              </Link>
            </View>

            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={theme.textSubtle} />
              <Text style={styles.locationText}>{t("app.city")}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    background: {
      flex: 1,
    },
    safe: {
      flex: 1,
    },
    content: {
      padding: 24,
      paddingBottom: 40,
      alignItems: "center",
    },
    brandRow: {
      width: "100%",
      maxWidth: 420,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
    },
    brandBadge: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    brandText: {
      marginLeft: 12,
      fontSize: 20,
      color: theme.text,
      fontFamily: fontFamilies.brand,
      letterSpacing: 0.4,
    },
    heroCard: {
      width: "100%",
      maxWidth: 420,
      marginTop: 22,
      borderRadius: 24,
      shadowColor: theme.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    heroGradient: {
      borderRadius: 24,
      padding: 28,
      minHeight: 150,
      justifyContent: "flex-end",
    },
    heroEyebrow: {
      color: "#D9F6F8",
      fontSize: 12,
      letterSpacing: 2,
      fontFamily: fontFamilies.eyebrow,
    },
    heroTitle: {
      color: "#FFFFFF",
      fontSize: 28,
      marginTop: 8,
      fontFamily: fontFamilies.display,
    },
    formCard: {
      width: "100%",
      maxWidth: 420,
      marginTop: 22,
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 24,
      shadowColor: theme.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    },
    formTitle: {
      fontSize: 24,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    formSubtitle: {
      marginTop: 8,
      fontSize: 14,
      color: theme.textMuted,
      lineHeight: 20,
      fontFamily: fontFamilies.body,
    },
    fieldGroup: {
      marginTop: 18,
    },
    label: {
      fontSize: 12,
      color: theme.textSubtle,
      letterSpacing: 0.9,
      textTransform: "uppercase",
      fontFamily: fontFamilies.eyebrow,
    },
    input: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.surfaceAlt,
      fontFamily: fontFamilies.body,
    },
    inputError: {
      borderColor: theme.danger,
      backgroundColor: theme.dangerSoft,
    },
    errorText: {
      marginTop: 6,
      color: theme.danger,
      fontSize: 12,
      fontFamily: fontFamilies.body,
    },
    passwordRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    linkText: {
      color: theme.accent,
      fontSize: 12,
      fontFamily: fontFamilies.eyebrow,
    },
    loginButton: {
      marginTop: 22,
      backgroundColor: theme.accent,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 10,
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
    loginButtonDisabled: {
      backgroundColor: theme.accentMuted,
    },
    loginButtonPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.95,
    },
    loginButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      letterSpacing: 0.6,
      fontFamily: fontFamilies.display,
    },
    footer: {
      width: "100%",
      maxWidth: 420,
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    footerText: {
      color: theme.textMuted,
      fontSize: 13,
      fontFamily: fontFamilies.body,
      marginRight: 6,
    },
    footerLink: {
      color: theme.accent,
      fontSize: 13,
      fontFamily: fontFamilies.display,
    },
    locationRow: {
      marginTop: 18,
      flexDirection: "row",
      alignItems: "center",
    },
    locationText: {
      marginLeft: 6,
      color: theme.textSubtle,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      fontFamily: fontFamilies.eyebrow,
    },
  });
