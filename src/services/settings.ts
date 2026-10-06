import { z } from 'zod';
import type { Settings } from '../core/types.js';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(value: string): number | null {
  const match = HHMM.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Начало тихих часов 20:00–23:59 или 00:00: бодрствующий день не пересекает полночь. */
const quietStart = z.string().refine((v) => {
  const m = minutesOf(v);
  return m !== null && (m >= 20 * 60 || m === 0);
}, 'Тихие часы должны начинаться с 20:00 до 00:00');

const quietEnd = z.string().refine((v) => {
  const m = minutesOf(v);
  return m !== null && m >= 5 * 60 && m <= 12 * 60;
}, 'Тихие часы должны заканчиваться с 05:00 до 12:00');

export const SettingsInput = z.object({
  timezone: z.string().refine(isKnownTimezone, 'Неизвестный часовой пояс'),
  quiet: z.object({ start: quietStart, end: quietEnd }),
});

export function parseSettings(input: unknown): Settings {
  return SettingsInput.parse(input);
}
