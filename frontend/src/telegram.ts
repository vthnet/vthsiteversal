// Telegram WebApp bridge. Safe to call outside Telegram (development browser fallback).
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name: string; username?: string } };
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  ready: () => void;
  expand: () => void;
  close?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: { impactOccurred: (style: "light" | "medium" | "heavy") => void; notificationOccurred: (type: "error" | "success" | "warning") => void; selectionChanged: () => void };
};

function getWebApp(): TelegramWebApp | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg && tg.initData !== undefined ? tg : null;
}

export const telegram = {
  isInsideTelegram(): boolean {
    return Boolean(getWebApp()?.initData);
  },
  getInitData(): string {
    return getWebApp()?.initData ?? "";
  },
  init(backgroundColor: string) {
    const tg = getWebApp();
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor?.(backgroundColor);
      tg.setBackgroundColor?.(backgroundColor);
    } catch {
      // Never let Telegram initialization block the app.
    }
  },
  setBackButton(visible: boolean, onPress?: () => void) {
    const tg = getWebApp();
    if (!tg?.BackButton) return () => {};
    if (!visible || !onPress) {
      tg.BackButton.hide();
      return () => {};
    }
    tg.BackButton.onClick(onPress);
    tg.BackButton.show();
    return () => tg.BackButton?.offClick(onPress);
  },
  openLink(url: string) {
    const tg = getWebApp();
    if (tg && url.startsWith("https://t.me/")) tg.openTelegramLink?.(url);
    else if (tg) tg.openLink?.(url);
    else if (Platform.OS === "web" && typeof window !== "undefined") window.open(url, "_blank");
  },
  haptic(kind: "selection" | "light" | "success" | "error" = "light") {
    const tg = getWebApp();
    if (tg?.HapticFeedback) {
      if (kind === "selection") tg.HapticFeedback.selectionChanged();
      else if (kind === "light") tg.HapticFeedback.impactOccurred("light");
      else tg.HapticFeedback.notificationOccurred(kind);
      return;
    }
    if (Platform.OS === "web") return;
    if (kind === "selection") void Haptics.selectionAsync();
    else if (kind === "light") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else void Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
  },
};
