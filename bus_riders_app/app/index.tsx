import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { LanguageProvider } from "@/contexts/language-context";
import { NotificationProvider } from "@/contexts/notification-context";
import { ThemePreferenceProvider } from "@/contexts/theme-preference-context";
import { Stack, useRouter, useSegments } from "expo-router";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootLayoutNav() {
  const { isAuthenticated, isReady, hasBusInfo } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const inAuthGroup = segments[0] === "(auth)";
    const isBusRegistration = segments[1] === "bus-registration";

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace("/login");
      }
      return;
    }

    if (!hasBusInfo) {
      if (!inAuthGroup || !isBusRegistration) {
        router.replace("/bus-registration");
      }
      return;
    }

    if (inAuthGroup) {
      router.replace("/");
    }
  }, [hasBusInfo, isAuthenticated, isReady, router, segments]);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemePreferenceProvider>
        <LanguageProvider>
          <NotificationProvider>
            <AppThemeRoot />
          </NotificationProvider>
        </LanguageProvider>
      </ThemePreferenceProvider>
    </AuthProvider>
  );
}

function AppThemeRoot() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <RootLayoutNav />
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}
