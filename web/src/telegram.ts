interface WebApp {
  initData: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  HapticFeedback?: { notificationOccurred(type: 'success' | 'error' | 'warning'): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

/** Как у iPhone 15/16 — чтобы в браузере видеть раскладку с вырезом и полоской. */
const DEV_SAFE_AREA: Record<string, string> = {
  '--tg-safe-area-inset-top': '47px',
  '--tg-safe-area-inset-bottom': '34px',
  '--tg-content-safe-area-inset-top': '0px',
  '--tg-content-safe-area-inset-bottom': '0px',
};

const CREAM = '#fdf6ec';

const webApp = (): WebApp | undefined => window.Telegram?.WebApp;

export function getInitData(): string {
  return webApp()?.initData ?? '';
}

export function isDevPreview(): boolean {
  return import.meta.env.DEV && getInitData() === '';
}

export function initTelegram(): void {
  webApp()?.ready();
  webApp()?.expand();
  const tg = webApp();
  if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.();
  if (tg?.isVersionAtLeast?.('6.1')) {
    tg.setHeaderColor?.(CREAM);
    tg.setBackgroundColor?.(CREAM);
  }
  if (!isDevPreview()) return;
  for (const [name, value] of Object.entries(DEV_SAFE_AREA)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export function hapticSuccess(): void {
  webApp()?.HapticFeedback?.notificationOccurred('success');
}
