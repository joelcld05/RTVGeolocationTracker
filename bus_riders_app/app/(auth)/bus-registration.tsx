import { useRouter } from "expo-router";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { BusRegistrationForm } from "@/components/bus-registration-modal";

export default function BusRegistrationScreen() {
  const router = useRouter();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <BusRegistrationForm
        onComplete={() => router.replace("/(tabs)")}
        onLogout={() => router.replace("/login")}
      />
    </SafeAreaProvider>
  );
}
