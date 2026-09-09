import { Platform } from "react-native";

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: Record<string, unknown>;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

function getWebApp(): TelegramWebApp | null {
  if (Platform.OS !== "web" || typeof window === "undefined") {
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

function readLaunchInitData(): string {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "";
  }

  const read = (value: string): string => {
    if (!value) return "";

    try {
      const cleaned = value
        .replace(/^#/, "")
        .replace(/^\?/, "");

      const params = new URLSearchParams(cleaned);

      return params.get("tgWebAppData") || "";
    } catch {
      return "";
    }
  };

  const direct =
    read(window.location.hash) ||
    read(window.location.search);

  if (direct) {
    return direct;
  }

  return "";
}

function getInitDataNow(): string {
  const webApp = getWebApp();

  const sdkInitData = webApp?.initData || "";

  if (sdkInitData) {
    return sdkInitData;
  }

  return readLaunchInitData();
}

export const telegram = {
  isInsideTelegram(): boolean {
    return Boolean(getInitDataNow());
  },

  getInitData(): string {
    return getInitDataNow();
  },

  async waitForInitData(
    timeoutMs = 15000
  ): Promise<string> {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return "";
    }

    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const webApp = getWebApp();

      if (webApp) {
        try {
          webApp.ready?.();
          webApp.expand?.();
        } catch {
          // Ignore Telegram UI API errors.
        }
      }

      const initData = getInitDataNow();

      if (initData) {
        return initData;
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 250);
      });
    }

    return "";
  },

  init(backgroundColor?: string) {
    const webApp = getWebApp();

    if (!webApp) {
      return;
    }

    try {
      webApp.ready?.();
      webApp.expand?.();

      if (backgroundColor) {
        webApp.setBackgroundColor?.(backgroundColor);
      }
    } catch {
      // Telegram WebApp methods are optional.
    }
  },
};