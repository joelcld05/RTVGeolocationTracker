import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { translate, type LanguageCode } from "@/locales";

type LanguageContextValue = {
  language: LanguageCode;
  isReady: boolean;
  setLanguage: (next: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const STORAGE_KEY = "language-preference";

const LanguageContext = createContext<LanguageContextValue | null>(null);

const detectSystemLanguage = (): LanguageCode => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    return locale.toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(
    detectSystemLanguage(),
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadPreference = async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (isMounted && (stored === "en" || stored === "es")) {
          setLanguageState(stored);
        }
      } catch {
        // Ignore storage errors and fall back to system preference.
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    loadPreference();

    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = useCallback((next: LanguageCode) => {
    setLanguageState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // Ignore storage errors.
    });
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      isReady,
      setLanguage,
      t,
    }),
    [language, isReady, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
