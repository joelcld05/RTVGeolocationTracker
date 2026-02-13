import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useFormik } from "formik";
import * as Yup from "yup";
import { fontFamilies } from "@/constants/themes";
import { useAuth, type BusData } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { useNotification } from "@/contexts/notification-context";
import { useAppTheme } from "@/hooks/use-app-theme";
import { _post } from "@/libs/request";

type BusRegistrationModalProps = {
  visible: boolean;
  onLogout?: () => void;
};

type BusRegistrationFormProps = {
  visible?: boolean;
  onComplete?: () => void;
  onLogout?: () => void;
};

const emptyBusData: BusData = {
  name: "",
  route: "",
  number: "",
  plate: "",
  phone: "",
};

export function BusRegistrationModal({
  visible,
  onLogout,
}: BusRegistrationModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {}}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <BusRegistrationForm visible={visible} onLogout={onLogout} />
      </SafeAreaProvider>
    </Modal>
  );
}

export function BusRegistrationForm({
  visible = true,
  onComplete,
  onLogout,
}: BusRegistrationFormProps) {
  const theme = useAppTheme();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const { busData, updateBusData, refreshSession, signOut } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme.mode]);
  const insets = useSafeAreaInsets();
  const { f_post: saveBusData } = _post({
    url: "/bus",
    useAuth: true,
    saveData: false,
  });

  const validationSchema = useMemo(
    () =>
      Yup.object({
        name: Yup.string().trim().required(t("validation.required")),
        route: Yup.string().trim().required(t("validation.required")),
        number: Yup.string().trim().required(t("validation.required")),
        plate: Yup.string().trim().required(t("validation.required")),
        phone: Yup.string().trim().required(t("validation.required")),
      }),
    [t],
  );

  const formik = useFormik({
    initialValues: busData ?? emptyBusData,
    validationSchema,
    validateOnMount: true,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const payload = {
          name: values.name.trim(),
          route: values.route.trim(),
          number: values.number.trim(),
          plate: values.plate.trim(),
          phone: values.phone.trim(),
        };
        const response = await saveBusData({ body: payload });
        if (response?.saved === false) {
          throw response?.error ?? new Error("BUS_SAVE_FAILED");
        }
        const savedBus = response?.data ?? payload;
        updateBusData(savedBus);
        await refreshSession();
        onComplete?.();
      } catch (error) {
        console.error("Bus registration failed", error);
        notify({ error, type: "error" });
      } finally {
        setSubmitting(false);
      }
    },
  });

  useEffect(() => {
    if (visible) {
      formik.resetForm({ values: busData ?? emptyBusData });
    }
  }, [busData, formik.resetForm, visible]);

  const isDisabled = useMemo(
    () => formik.isSubmitting || !formik.isValid,
    [formik.isSubmitting, formik.isValid],
  );

  const nameError = formik.touched.name ? formik.errors.name : undefined;
  const routeError = formik.touched.route ? formik.errors.route : undefined;
  const numberError = formik.touched.number ? formik.errors.number : undefined;
  const plateError = formik.touched.plate ? formik.errors.plate : undefined;
  const phoneError = formik.touched.phone ? formik.errors.phone : undefined;

  return (
    <View style={styles.modalSafe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalSafe}
      >
        <ScrollView
          contentContainerStyle={[
            styles.modalContent,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: 32 + insets.bottom,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* <View style={styles.modalHeader}>
              <View style={styles.backButton}>
                <Ionicons name="arrow-back" size={22} color={theme.textMuted} />
              </View>
              <Text style={styles.headerTitle}>
                {t("busRegistration.title")}
              </Text>
              <View style={styles.headerSpacer} />
            </View> */}

          <Text style={styles.title}>
            {t("busRegistration.informationTitle")}
          </Text>
          <Text style={styles.subtitle}>
            {t("busRegistration.informationSubtitle")}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t("busRegistration.busNameLabel")}
            </Text>
            <TextInput
              value={formik.values.name}
              onChangeText={formik.handleChange("name")}
              onBlur={formik.handleBlur("name")}
              placeholder={t("busRegistration.busNamePlaceholder")}
              placeholderTextColor={theme.textSubtle}
              autoCapitalize="words"
              style={[styles.input, nameError && styles.inputError]}
            />
            {nameError ? (
              <Text style={styles.errorText}>{nameError}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t("busRegistration.busRouteLabel")}
            </Text>
            <View
              style={[styles.inputWithIcon, routeError && styles.inputError]}
            >
              <TextInput
                value={formik.values.route}
                onChangeText={formik.handleChange("route")}
                onBlur={formik.handleBlur("route")}
                placeholder={t("busRegistration.busRoutePlaceholder")}
                placeholderTextColor={theme.textSubtle}
                autoCapitalize="words"
                style={styles.inputText}
              />
              <View style={styles.inputIcon}>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={theme.textSubtle}
                />
              </View>
            </View>
            {routeError ? (
              <Text style={styles.errorText}>{routeError}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t("busRegistration.busNumberLabel")}
            </Text>
            <TextInput
              value={formik.values.number}
              onChangeText={formik.handleChange("number")}
              onBlur={formik.handleBlur("number")}
              placeholder={t("busRegistration.busNumberPlaceholder")}
              placeholderTextColor={theme.textSubtle}
              autoCapitalize="characters"
              style={[styles.input, numberError && styles.inputError]}
            />
            {numberError ? (
              <Text style={styles.errorText}>{numberError}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t("busRegistration.busPlateLabel")}
            </Text>
            <TextInput
              value={formik.values.plate}
              onChangeText={formik.handleChange("plate")}
              onBlur={formik.handleBlur("plate")}
              placeholder={t("busRegistration.busPlatePlaceholder")}
              placeholderTextColor={theme.textSubtle}
              autoCapitalize="characters"
              style={[styles.input, plateError && styles.inputError]}
            />
            {plateError ? (
              <Text style={styles.errorText}>{plateError}</Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t("busRegistration.phoneNumberLabel")}
            </Text>
            <TextInput
              value={formik.values.phone}
              onChangeText={formik.handleChange("phone")}
              onBlur={formik.handleBlur("phone")}
              placeholder={t("busRegistration.phoneNumberPlaceholder")}
              placeholderTextColor={theme.textSubtle}
              keyboardType="phone-pad"
              autoComplete="tel"
              style={[styles.input, phoneError && styles.inputError]}
            />
            {phoneError ? (
              <Text style={styles.errorText}>{phoneError}</Text>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={() => formik.handleSubmit()}
            style={({ pressed }) => [
              styles.submitButton,
              isDisabled && styles.submitButtonDisabled,
              pressed && !isDisabled && styles.submitButtonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              {formik.isSubmitting ? (
                <ActivityIndicator
                  color="#FFFFFF"
                  style={styles.buttonSpinner}
                />
              ) : null}
              <Text style={styles.submitButtonText}>
                {formik.isSubmitting
                  ? t("busRegistration.registering")
                  : t("busRegistration.registerBus")}
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              await signOut();
              onLogout?.();
            }}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutButtonPressed,
            ]}
          >
            <Text style={styles.logoutButtonText}>{t("common.logout")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    modalSafe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    modalContent: {
      paddingHorizontal: 24,
    },
    modalHeader: {
      marginTop: 6,
      marginBottom: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    backButton: {
      position: "absolute",
      left: 0,
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 16,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    headerSpacer: {
      width: 36,
    },
    title: {
      fontSize: 30,
      color: theme.text,
      fontFamily: fontFamilies.display,
    },
    subtitle: {
      marginTop: 10,
      fontSize: 15,
      lineHeight: 22,
      color: theme.textMuted,
      fontFamily: fontFamilies.body,
    },
    fieldGroup: {
      marginTop: 20,
    },
    label: {
      fontSize: 12,
      letterSpacing: 1,
      color: theme.textSubtle,
      textTransform: "uppercase",
      fontFamily: fontFamilies.eyebrow,
    },
    input: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.surface,
      fontFamily: fontFamilies.body,
    },
    inputError: {
      borderColor: theme.danger,
      backgroundColor: theme.dangerSoft,
    },
    inputWithIcon: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.surface,
      flexDirection: "row",
      alignItems: "center",
    },
    inputText: {
      flex: 1,
      padding: 0,
      fontSize: 16,
      color: theme.text,
      fontFamily: fontFamilies.body,
    },
    inputIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    errorText: {
      marginTop: 6,
      color: theme.danger,
      fontSize: 12,
      fontFamily: fontFamilies.body,
    },
    submitButton: {
      marginTop: 28,
      backgroundColor: theme.accent,
      borderRadius: 18,
      paddingVertical: 16,
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
    submitButtonDisabled: {
      backgroundColor: theme.accentMuted,
      shadowOpacity: 0,
      elevation: 0,
    },
    submitButtonPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.9,
    },
    submitButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      letterSpacing: 0.6,
      fontFamily: fontFamilies.display,
    },
    logoutButton: {
      marginTop: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: theme.surface,
    },
    logoutButtonPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.9,
    },
    logoutButtonText: {
      color: theme.text,
      fontSize: 14,
      letterSpacing: 0.6,
      fontFamily: fontFamilies.display,
    },
  });
