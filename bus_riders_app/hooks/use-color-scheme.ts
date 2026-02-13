import { useContext } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { ThemePreferenceContext } from "@/contexts/theme-preference-context";

export function useColorScheme() {
  const systemScheme = useSystemColorScheme() ?? "light";
  const context = useContext(ThemePreferenceContext);
  return context?.colorScheme ?? systemScheme;
}
