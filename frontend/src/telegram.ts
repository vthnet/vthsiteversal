// Telegram WebApp bridge.
// Safe to call outside Telegram (development browser fallback).

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name: string;
      username?: string;
    };
  };
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;

  ready: () => void;
  expand: () => void;

  close?: () => void;

  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;

  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;

  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };

  HapticFeedback?: {
    impactOccurred: (
      style: "light" | "medium" | "heavy"
    ) => void;

    notificationOccurred: (
      type: "error" | "success" | "warning"
    ) => void;

    selectionChanged: () => void;
  };
};


function getWebApp(): TelegramWebApp | null {
  if (
    Platform.OS !== "web" ||
    typeof window === "undefined"
  ) {
    return null;
  }

  return (
    window as unknown as {
      Telegram?: {
        WebApp?: TelegramWebApp;
      };
    }
  ).Telegram?.WebApp ?? null;
}


export const telegram = {
  /**
   * Wait until Telegram WebApp has supplied initData.
   *
   * This is important because the Telegram bridge can load slightly
   * after the React application starts.
   */
  async waitForInitData(
    timeoutMs = 5000
  ): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const tg = getWebApp();

      if (tg) {
        try {
          tg.ready();
          tg.expand();
        } catch {
          // Telegram bridge may still be initializing.
        }

        const initData = tg.initData ?? "";

        if (initData) {
          return initData;
        }
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    return "";
  },


  /**
   * Returns true only when Telegram has actually provided
   * authenticated WebApp initData.
   */
  isInsideTelegram(): boolean {
    return Boolean(getWebApp()?.initData);
  },


  /**
   * Get raw Telegram WebApp initData.
   *
   * This value must be sent to the backend for server-side
   * HMAC verification.
   */
  getInitData(): string {
    return getWebApp()?.initData ?? "";
  },


  /**
   * Initialize Telegram WebApp UI.
   */
  init(backgroundColor: string) {
    const tg = getWebApp();

    if (!tg) {
      return;
    }

    try {
      tg.ready();
      tg.expand();

      tg.setHeaderColor?.(backgroundColor);
      tg.setBackgroundColor?.(backgroundColor);
    } catch {
      // Never let Telegram initialization block the app.
    }
  },


  /**
   * Telegram Back Button.
   */
  setBackButton(
    visible: boolean,
    onPress?: () => void
  ) {
    const tg = getWebApp();

    if (!tg?.BackButton) {
      return () => {};
    }

    if (!visible || !onPress) {
      tg.BackButton.hide();
      return () => {};
    }

    tg.BackButton.onClick(onPress);
    tg.BackButton.show();

    return () => {
      tg.BackButton?.offClick(onPress);
    };
  },


  /**
   * Open Telegram / external links.
   */
  openLink(url: string) {
    const tg = getWebApp();

    if (tg && url.startsWith("https://t.me/")) {
      tg.openTelegramLink?.(url);
      return;
    }

    if (tg) {
      tg.openLink?.(url);
      return;
    }

    if (
      Platform.OS === "web" &&
      typeof window !== "undefined"
    ) {
      window.open(url, "_blank");
    }
  },


  /**
   * Haptic feedback.
   */
  haptic(
    kind:
      | "selection"
      | "light"
      | "success"
      | "error" = "light"
  ) {
    const tg = getWebApp();

    if (tg?.HapticFeedback) {
      if (kind === "selection") {
        tg.HapticFeedback.selectionChanged();
      } else if (kind === "light") {
        tg.HapticFeedback.impactOccurred("light");
      } else {
        tg.HapticFeedback.notificationOccurred(kind);
      }

      return;
    }

    if (Platform.OS === "web") {
      return;
    }

    if (kind === "selection") {
      void Haptics.selectionAsync();
    } else if (kind === "light") {
      void Haptics.impactAsync(
        Haptics.ImpactFeedbackStyle.Light
      );
    } else {
      void Haptics.notificationAsync(
        kind === "success"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error
      );
    }
  },
};