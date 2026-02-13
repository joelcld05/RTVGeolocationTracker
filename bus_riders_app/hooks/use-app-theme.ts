import { AppTheme, type AppThemeColors } from "@/constants/app-theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export type AppThemeWithMode = AppThemeColors & { mode: "light" | "dark" };

export function useAppTheme(): AppThemeWithMode {
  const scheme = useColorScheme() ?? "light";
  const palette = scheme === "dark" ? AppTheme.dark : AppTheme.light;
  return {
    ...palette,
    mode: scheme,
  };
}
