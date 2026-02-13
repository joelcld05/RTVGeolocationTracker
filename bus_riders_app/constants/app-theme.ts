export type AppThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentMuted: string;
  danger: string;
  dangerSoft: string;
  tabBar: string;
  shadow: string;
  mapBackground: string;
};

export const AppTheme = {
  light: {
    background: "#F6F8FA",
    surface: "#FFFFFF",
    surfaceAlt: "#F4F7F8",
    surfaceMuted: "#EEF2F4",
    text: "#1A2A2E",
    textMuted: "#6B7A80",
    textSubtle: "#9AA4A9",
    border: "#D8E2E6",
    accent: "#00B0B9",
    accentSoft: "#E7F6F8",
    accentMuted: "#7AD9E0",
    danger: "#E14D4D",
    dangerSoft: "#FFF6F6",
    tabBar: "#FFFFFF",
    shadow: "#1A2A2E",
    mapBackground: "#F6F8FA",
  } satisfies AppThemeColors,
  dark: {
    background: "#0F1418",
    surface: "#171E24",
    surfaceAlt: "#1D242B",
    surfaceMuted: "#1A2128",
    text: "#E6EDF2",
    textMuted: "#A3ADB3",
    textSubtle: "#7C8790",
    border: "#2A343B",
    accent: "#2CCCD5",
    accentSoft: "#123A40",
    accentMuted: "#4AD9E1",
    danger: "#FF6B6B",
    dangerSoft: "#2B1A1A",
    tabBar: "#10161B",
    shadow: "#000000",
    mapBackground: "#0E1418",
  } satisfies AppThemeColors,
};
