import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { ProgressProvider } from "@/contexts/ProgressContext";
import { EntitlementProvider } from "@/contexts/EntitlementContext";

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? palette.dark : palette.light;

  return (
    <SafeAreaProvider>
      <EntitlementProvider>
        <ProgressProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
        </ProgressProvider>
      </EntitlementProvider>
    </SafeAreaProvider>
  );
}
