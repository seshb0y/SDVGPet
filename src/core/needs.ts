import { isQuiet, localTime } from './time.js';
import { TUNING } from './tuning.js';
import { NEEDS, type Need, type Needs, type Settings } from './types.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

export const INITIAL_NEEDS: Needs = Object.freeze({ food: 100, walk: 100, play: 100, love: 100 });

function mapNeeds(needs: Needs, fn: (value: number, need: Need) => number): Needs {
  return Object.fromEntries(NEEDS.map((need) => [need, fn(needs[need], need)])) as Record<Need, number>;
}

export function wakingMinutes(from: Date, to: Date, settings: Settings): number {
  const startMs = Math.max(from.getTime(), to.getTime() - TUNING.maxDecayHours * MS_PER_HOUR);
  const total = Math.floor((to.getTime() - startMs) / MS_PER_MINUTE);
  if (total <= 0) return 0;

  // ponytail: поминутный обход с постоянным сдвигом пояса — переход на летнее время
  // внутри окна не учитывается (для МСК неважно). Окно ограничено 72 ч → ≤ 4320 итераций.
  let minute = localTime(new Date(startMs), settings.timezone).minutes;
  let waking = 0;
  for (let i = 0; i < total; i++) {
    if (!isQuiet(minute, settings.quiet)) waking++;
    minute = (minute + 1) % 1440;
  }
  return waking;
}

export function decay(needs: Needs, from: Date, to: Date, settings: Settings): Needs {
  const hours = wakingMinutes(from, to, settings) / 60;
  return mapNeeds(needs, (value, need) => Math.max(TUNING.floor, value - TUNING.decayPerHour[need] * hours));
}

export function applyCompletion(needs: Needs, need: Need, lastCompletedAt: Date | null, now: Date): Needs {
  const isComeback =
    lastCompletedAt !== null && now.getTime() - lastCompletedAt.getTime() >= TUNING.comebackAfterHours * MS_PER_HOUR;
  const gain = isComeback ? TUNING.comebackGain : TUNING.completionGain;
  return { ...needs, [need]: Math.min(TUNING.max, needs[need] + gain) };
}
