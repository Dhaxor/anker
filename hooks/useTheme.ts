import { useColorScheme } from "react-native";
import { palette, type ThemeColors } from "@/constants/theme";

/** The active colour set. Screens never touch `palette` directly. */
export function useTheme(): ThemeColors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}
