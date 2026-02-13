import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useLanguage } from '@/contexts/language-context';
import { useAppTheme } from '@/hooks/use-app-theme';
import { fontFamilies } from '@/constants/themes';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const validationSchema = useMemo(
    () =>
      Yup.object({
        password: Yup.string().required(t('validation.required')),
        confirmPassword: Yup.string()
          .oneOf([Yup.ref('password')], t('validation.passwordMismatch'))
          .required(t('validation.required')),
      }),
    [t],
  );

  const formik = useFormik({
    initialValues: { password: '', confirmPassword: '' },
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
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardAnim, headerAnim]);

  const passwordError = formik.touched.password ? formik.errors.password : undefined;
  const confirmPasswordError = formik.touched.confirmPassword
    ? formik.errors.confirmPassword
    : undefined;

  return (
    <LinearGradient
      colors={
        theme.mode === 'dark' ? ['#0F1418', '#111A1F'] : ['#F6FCFD', '#E5F1F3']
      }
      style={styles.background}>
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <Pressable
                onPress={() => router.push('/login')}
                accessibilityRole="button"
                style={styles.backButton}>
                <Ionicons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={styles.topTitle}>{t("common.resetPassword").toUpperCase()}</Text>
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
              ]}>
              <View style={styles.heroBadge}>
                <Ionicons name="lock-closed" size={26} color={theme.accent} />
              </View>
              <Text style={styles.heroTitle}>{t("auth.createNewPassword")}</Text>
              <Text style={styles.heroSubtitle}>
                {t("auth.createPasswordSubtitle")}
              </Text>
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
              ]}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{t("common.newPassword")}</Text>
                <View
                  style={[
                    styles.inputRow,
                    passwordError && styles.inputRowError,
                  ]}>
                  <TextInput
                    value={formik.values.password}
                    onChangeText={formik.handleChange('password')}
                    onBlur={formik.handleBlur('password')}
                    placeholder={t("placeholders.newPassword")}
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
                    hitSlop={8}>
                    <Ionicons
                      name={showPassword ? 'eye' : 'eye-off'}
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
                  ]}>
                  <TextInput
                    value={formik.values.confirmPassword}
                    onChangeText={formik.handleChange('confirmPassword')}
                    onBlur={formik.handleBlur('confirmPassword')}
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
                    hitSlop={8}>
                    <Ionicons
                      name={showConfirm ? 'eye' : 'eye-off'}
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
                ]}>
                <View style={styles.buttonContent}>
                  {formik.isSubmitting ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                      style={styles.buttonSpinner}
                    />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {formik.isSubmitting
                      ? t("auth.updating")
                      : t("common.updatePassword")}
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
    position: 'absolute',
    top: -140,
    right: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: theme.accentSoft,
  },
  glowTwo: {
    position: 'absolute',
    bottom: -160,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: theme.surfaceMuted,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    maxWidth: 420,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
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
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    marginTop: 24,
  },
  heroBadge: {
    width: 78,
    height: 78,
    borderRadius: 22,
    backgroundColor: theme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.shadow,
    shadowOpacity: 0.16,
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
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.body,
    maxWidth: 300,
  },
  formCard: {
    width: '100%',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'center',
    shadowColor: theme.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#FFFFFF',
    fontSize: 16,
    letterSpacing: 0.6,
    fontFamily: fontFamilies.display,
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
});
