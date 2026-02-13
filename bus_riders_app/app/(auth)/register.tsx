import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFormik } from "formik";
import * as Yup from "yup";
import { AuthResponse, useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useNotification } from "@/contexts/notification-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { fontFamilies } from "@/constants/themes";
import { _post } from "@/libs/request";

export default function RegisterScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { applySession } = useAuth();
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const { f_post: authPost } = _post({
    useAuth: false,
    saveData: false,
  });

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const response = (await authPost({
        url: "/auth/register",
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        },
      })) as AuthResponse;
      await applySession(response);
      return response;
    },
    [applySession, authPost],
  );

  const validationSchema = useMemo(
    () =>
      Yup.object({
        fullName: Yup.string().trim().required(t("validation.required")),
        email: Yup.string()
          .trim()
          .email(t("validation.invalidEmail"))
          .required(t("validation.required")),
        password: Yup.string().required(t("validation.required")),
        confirmPassword: Yup.string()
          .oneOf([Yup.ref("password")], t("validation.passwordMismatch"))
          .required(t("validation.required")),
      }),
    [t],
  );

  const formik = useFormik({
    initialValues: {
      fullName: "joshua",
      email: "joshua@crowmie.com",
      password: "123123",
      confirmPassword: "123123",
    },
    validationSchema,
    validateOnMount: true,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const response = await signUp(
          values.fullName,
          values.email,
          values.password,
        );
        // if (typeof response?.message === "string") {
        //   notify({ message: response.message, type: "info" });
        // }
      } catch (error: any) {
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
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, headerAnim]);

  const fullNameError = formik.touched.fullName
    ? formik.errors.fullName
    : undefined;
  const emailError = formik.touched.email ? formik.errors.email : undefined;
  const passwordError = formik.touched.password
    ? formik.errors.password
    : undefined;
  const confirmPasswordError = formik.touched.confirmPassword
    ? formik.errors.confirmPassword
    : undefined;

  return (
    <LinearGradient
      colors={
        theme.mode === "dark" ? ["#0F1418", "#111A1F"] : ["#F6FBFB", "#E6F2F4"]
      }
      style={styles.background}
    >
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
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
              <Text style={styles.topTitle}>{t("auth.newAccount")}</Text>
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
                <Ionicons name="bus" size={30} color={theme.accent} />
              </View>
              <Text style={styles.heroTitle}>{t("auth.joinJourney")}</Text>
              <Text style={styles.heroSubtitle}>{t("auth.joinSubtitle")}</Text>
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
                        outputRange: [22, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("common.fullName")}</Text>
                <View
                  style={[
                    styles.inputRow,
                    fullNameError && styles.inputRowError,
                  ]}
                >
                  <TextInput
                    value={formik.values.fullName}
                    onChangeText={formik.handleChange("fullName")}
                    onBlur={formik.handleBlur("fullName")}
                    placeholder={t("placeholders.fullName")}
                    placeholderTextColor={theme.textSubtle}
                    autoCapitalize="words"
                    autoCorrect={false}
                    textContentType="name"
                    style={styles.input}
                  />
                  <Ionicons name="person" size={18} color={theme.accent} />
                </View>
                {fullNameError ? (
                  <Text style={styles.errorText}>{fullNameError}</Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("common.emailAddress")}</Text>
                <View
                  style={[styles.inputRow, emailError && styles.inputRowError]}
                >
                  <TextInput
                    value={formik.values.email}
                    onChangeText={formik.handleChange("email")}
                    onBlur={formik.handleBlur("email")}
                    placeholder={t("placeholders.emailPanama")}
                    placeholderTextColor={theme.textSubtle}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    style={styles.input}
                  />
                  <Ionicons name="mail" size={18} color={theme.accent} />
                </View>
                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("common.password")}</Text>
                <View
                  style={[
                    styles.inputRow,
                    passwordError && styles.inputRowError,
                  ]}
                >
                  <TextInput
                    value={formik.values.password}
                    onChangeText={formik.handleChange("password")}
                    onBlur={formik.handleBlur("password")}
                    placeholder={t("placeholders.createPassword")}
                    placeholderTextColor={theme.textSubtle}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    textContentType="newPassword"
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => setShowPassword((prev) => !prev)}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showPassword ? "eye" : "eye-off"}
                      size={18}
                      color={theme.textMuted}
                    />
                  </Pressable>
                </View>
                {passwordError ? (
                  <Text style={styles.errorText}>{passwordError}</Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("common.confirmPassword")}</Text>
                <View
                  style={[
                    styles.inputRow,
                    confirmPasswordError && styles.inputRowError,
                  ]}
                >
                  <TextInput
                    value={formik.values.confirmPassword}
                    onChangeText={formik.handleChange("confirmPassword")}
                    onBlur={formik.handleBlur("confirmPassword")}
                    placeholder={t("placeholders.repeatPassword")}
                    placeholderTextColor={theme.textSubtle}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    textContentType="password"
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => setShowConfirm((prev) => !prev)}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Ionicons
                      name={showConfirm ? "eye" : "eye-off"}
                      size={18}
                      color={theme.textMuted}
                    />
                  </Pressable>
                </View>
                {confirmPasswordError ? (
                  <Text style={styles.errorText}>{confirmPasswordError}</Text>
                ) : null}
              </View>

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
                      color="#FFFFFF"
                      style={styles.buttonSpinner}
                    />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {formik.isSubmitting
                      ? t("auth.creating")
                      : t("common.createAccount")}
                  </Text>
                </View>
              </Pressable>

              {/* <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t("auth.orSignUpWith")}</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialRow}>
                <Pressable style={styles.socialButton} accessibilityRole="button">
                  <Ionicons name="logo-google" size={18} color={theme.text} />
                  <Text style={styles.socialText}>Google</Text>
                </Pressable>
                <Pressable style={styles.socialButton} accessibilityRole="button">
                  <Ionicons name="logo-apple" size={18} color={theme.text} />
                  <Text style={styles.socialText}>Apple</Text>
                </Pressable>
              </View> */}
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {t("auth.alreadyHaveAccount")}
              </Text>
              <Link href="/login" asChild>
                <Pressable accessibilityRole="button">
                  <Text style={styles.footerLink}>{t("common.logIn")}</Text>
                </Pressable>
              </Link>
            </View>

            <Text style={styles.terms}>
              {t("auth.termsPrefix") + " "}
              <Text style={styles.termsLink}>
                {t("auth.termsService")}
              </Text>{" "}
              {t("auth.termsAnd") + " "}
              <Text style={styles.termsLink}>{t("auth.termsPrivacy")}</Text>.
            </Text>
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
    glowOne: {
      position: "absolute",
      top: -120,
      right: -80,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: theme.accentSoft,
    },
    glowTwo: {
      position: "absolute",
      bottom: -140,
      left: -120,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: theme.surfaceMuted,
    },
    content: {
      padding: 24,
      paddingBottom: 40,
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
      fontSize: 18,
      color: theme.text,
      fontFamily: fontFamilies.brand,
      letterSpacing: 0.4,
    },
    headerBlock: {
      width: "100%",
      maxWidth: 420,
      alignItems: "center",
      marginTop: 18,
    },
    heroBadge: {
      width: 76,
      height: 76,
      borderRadius: 22,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    heroTitle: {
      marginTop: 16,
      fontSize: 26,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    heroSubtitle: {
      marginTop: 8,
      textAlign: "center",
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fontFamilies.body,
      maxWidth: 300,
    },
    formCard: {
      width: "100%",
      maxWidth: 420,
      marginTop: 20,
      backgroundColor: theme.surface,
      borderRadius: 24,
      padding: 24,
      shadowColor: theme.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    },
    fieldGroup: {
      marginBottom: 14,
    },
    label: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 8,
      fontFamily: fontFamilies.body,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: theme.surfaceAlt,
    },
    inputRowError: {
      borderColor: theme.danger,
      backgroundColor: theme.dangerSoft,
    },
    input: {
      flex: 1,
      paddingVertical: 12,
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
      marginTop: 10,
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
    primaryButtonDisabled: {
      backgroundColor: theme.accentMuted,
    },
    primaryButtonPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.95,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      letterSpacing: 0.6,
      fontFamily: fontFamilies.display,
    },
    dividerRow: {
      marginTop: 18,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.border,
    },
    dividerText: {
      marginHorizontal: 10,
      fontSize: 11,
      color: theme.textSubtle,
      letterSpacing: 1,
      fontFamily: fontFamilies.eyebrow,
    },
    socialRow: {
      flexDirection: "row",
      gap: 12,
    },
    socialButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    socialText: {
      marginLeft: 8,
      fontSize: 14,
      color: theme.text,
      fontFamily: fontFamilies.brand,
    },
    footer: {
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
    terms: {
      marginTop: 12,
      textAlign: "center",
      color: theme.textSubtle,
      fontSize: 11,
      lineHeight: 16,
      fontFamily: fontFamilies.body,
      maxWidth: 320,
    },
    termsLink: {
      color: theme.accentMuted,
      textDecorationLine: "underline",
      fontFamily: fontFamilies.eyebrow,
    },
  });
