import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

type ThemePreference = "system" | "light" | "dark";

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  colorScheme: "light" | "dark";
  isReady: boolean;
  setPreference: (next: ThemePreference) => void;
};

const STORAGE_KEY = "theme-preference";

export const ThemePreferenceContext =
  createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [preference, setPreferenceState] =
    useState<ThemePreference>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadPreference = async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (
          isMounted &&
          (stored === "system" || stored === "light" || stored === "dark")
        ) {
          setPreferenceState(stored);
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

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // Ignore storage errors.
    });
  }, []);

  const colorScheme = preference === "system" ? systemScheme : preference;

  const value = useMemo(
    () => ({
      preference,
      colorScheme,
      isReady,
      setPreference,
    }),
    [preference, colorScheme, isReady, setPreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error("useThemePreference must be used within ThemePreferenceProvider");
  }
  return context;
}
