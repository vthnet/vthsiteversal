import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#090A0F",
  onSurface: "#F4F5F7",
  surfaceSecondary: "#131620",
  onSurfaceSecondary: "#D1D5DB",
  surfaceTertiary: "#1C2030",
  onSurfaceTertiary: "#9CA3AF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#090A0F",
  muted: "#9CA3AF",
  brand: "#FFFFFF",
  onBrand: "#090A0F",
  brandPrimary: "#F4F5F7",
  onBrandPrimary: "#090A0F",
  brandSecondary: "#E5E7EB",
  onBrandSecondary: "#090A0F",
  brandTertiary: "rgba(255, 255, 255, 0.07)",
  onBrandTertiary: "#F4F5F7",
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#090A0F",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.2)",
  divider: "rgba(255, 255, 255, 0.06)",
};

export type ThemeColors = typeof dark;
export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "dark");
}

setColorScheme("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" ? "dark" : "dark";
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
