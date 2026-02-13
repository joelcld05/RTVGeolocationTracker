import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  NotificationModal,
  type NotificationType,
} from "@/components/notification-modal";
import { useLanguage } from "@/contexts/language-context";

type NotificationPayload = {
  type?: NotificationType;
  title?: string;
  message?: string;
  error?: unknown;
  autoHideMs?: number;
};

type NotificationState = {
  type: NotificationType;
  title?: string;
  message: string;
};

type NotificationContextValue = {
  notify: (payload: NotificationPayload) => void;
  notifyError: (error: unknown, title?: string) => void;
  dismiss: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

const DEFAULT_TYPE: NotificationType = "normal";

const isResponseCodeKey = (value: string) => /^[A-Z0-9_]+$/.test(value);

const extractErrorMessage = (error: unknown): string | null => {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object") {
    const maybeMessage = (error as any).response?.data?.message;

    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
    if (Array.isArray(maybeMessage) && typeof maybeMessage[0] === "string") {
      return maybeMessage[0];
    }
    const responseData = (error as any).response?.data;
    if (typeof responseData === "string") {
      return responseData;
    }
    const fallback = (error as any).message;
    if (typeof fallback === "string") {
      return fallback;
    }
  }
  return null;
};

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const dismiss = useCallback(() => {
    clearTimer();
    setNotification(null);
  }, [clearTimer]);

  const translateResponseCode = useCallback(
    (value: string) => {
      if (!isResponseCodeKey(value)) {
        return value;
      }
      const key = `responseCodes.${value}`;
      const translated = t(key);
      return translated === key ? value : translated;
    },
    [t],
  );

  const notify = useCallback(
    ({ type, title, message, error, autoHideMs }: NotificationPayload) => {
      const rawMessage =
        message ??
        extractErrorMessage(error) ??
        t("notifications.genericError");
      const nextType = type ?? (error ? "error" : DEFAULT_TYPE);
      setNotification({
        type: nextType,
        title,
        message: translateResponseCode(rawMessage),
      });

      clearTimer();
      if (autoHideMs && autoHideMs > 0) {
        timerRef.current = setTimeout(() => {
          setNotification(null);
          timerRef.current = null;
        }, autoHideMs);
      }
    },
    [clearTimer, t, translateResponseCode],
  );

  const notifyError = useCallback(
    (error: unknown, title?: string) => {
      notify({ error, type: "error", title });
    },
    [notify],
  );

  const value = useMemo(
    () => ({
      notify,
      notifyError,
      dismiss,
    }),
    [dismiss, notify, notifyError],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationModal
        visible={!!notification}
        type={notification?.type}
        title={notification?.title}
        message={notification?.message ?? ""}
        onClose={dismiss}
      />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}
