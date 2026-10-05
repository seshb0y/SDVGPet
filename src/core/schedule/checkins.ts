import { minutesSince, parseHHMM, type LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { OutboxEntry, QuietHours } from '../types.js';

export type Checkin = 'morning' | 'evening';

function inWindow(minutes: number, start: number): boolean {
  return minutesSince(start, minutes) < TUNING.checkinWindowMinutes;
}

export function dueCheckin(local: LocalTime, quiet: QuietHours, sentToday: readonly OutboxEntry[]): Checkin | null {
  const alreadySent = (kind: Checkin) => sentToday.some((entry) => entry.kind === kind);
  const morningStart = parseHHMM(quiet.end) + TUNING.morningAfterQuietMinutes;
  const eveningStart = parseHHMM(quiet.start) - TUNING.eveningBeforeQuietMinutes;

  if (inWindow(local.minutes, morningStart % 1440) && !alreadySent('morning')) return 'morning';
  if (inWindow(local.minutes, (eveningStart + 1440) % 1440) && !alreadySent('evening')) return 'evening';
  return null;
}
