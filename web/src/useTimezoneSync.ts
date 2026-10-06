import { useEffect } from 'react';
import type { Api, Settings } from './api/types';

const SYNCED_KEY = 'shantik.timezone-synced';

function alreadySynced(): boolean {
  try {
    return localStorage.getItem(SYNCED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSynced(): void {
  try {
    localStorage.setItem(SYNCED_KEY, '1');
  } catch {
    // Хранилище недоступно — синхронизация повторится при следующем открытии, это безопасно.
  }
}

let inFlight = false;

/** Спека: часовой пояс при первом открытии — из Intl. Потом пояс меняется только в настройках. */
export function useTimezoneSync(api: Api | null, settings: Settings | undefined, onSynced: (settings: Settings) => void): void {
  useEffect(() => {
    if (!api || !settings || inFlight || alreadySynced()) return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (device === settings.timezone) {
      markSynced();
      return;
    }
    inFlight = true;
    api
      .updateSettings({ ...settings, timezone: device })
      .then(
        (saved) => {
          markSynced();
          onSynced(saved);
        },
        (error: unknown) => {
          console.error('[timezone] не удалось сохранить часовой пояс, повторим при следующем открытии', error);
        },
      )
      .finally(() => {
        inFlight = false;
      });
  }, [api, settings, onSynced]);
}
