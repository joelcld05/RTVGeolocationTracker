import { useContext, useEffect, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

import { ThemePreferenceContext } from "@/contexts/theme-preference-context";

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const systemScheme = useRNColorScheme() ?? "light";
  const context = useContext(ThemePreferenceContext);
  const resolvedScheme = context?.colorScheme ?? systemScheme;

  if (hasHydrated) {
    return resolvedScheme;
  }

  return "light";
}
