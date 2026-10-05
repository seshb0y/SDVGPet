import { lowestNeed } from '../mood.js';
import type { LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { Need, Needs, OutboxEntry } from '../types.js';

const MS_PER_MINUTE = 60_000;

export interface SignalDecision {
  need: Need;
  slot: string;
}

const bySentAt = (a: OutboxEntry, b: OutboxEntry) => a.sentAt.getTime() - b.sentAt.getTime();

function isTired(sentToday: readonly OutboxEntry[]): boolean {
  const signals = sentToday.filter((e) => e.kind === 'need' || e.kind === 'followup').sort(bySentAt);
  const lastFew = signals.slice(-TUNING.tiredAfterUnanswered);
  return lastFew.length === TUNING.tiredAfterUnanswered && lastFew.every((e) => e.answeredAt === null);
}

export function needSignal(
  needs: Needs,
  local: LocalTime,
  now: Date,
  sentToday: readonly OutboxEntry[],
): SignalDecision | null {
  const need = lowestNeed(needs);
  if (needs[need] >= TUNING.askBelow) return null;

  const slotHours = isTired(sentToday) ? TUNING.tiredSignalSlotHours : TUNING.signalSlotHours;
  const since = now.getTime() - slotHours * 60 * MS_PER_MINUTE;
  const recentlyAsked = sentToday.some((e) => e.kind === 'need' && e.need === need && e.sentAt.getTime() > since);
  if (recentlyAsked) return null;

  return { need, slot: `${slotHours}h:${Math.floor(local.minutes / (slotHours * 60))}` };
}

export function dueFollowup(needs: Needs, now: Date, sentToday: readonly OutboxEntry[]): OutboxEntry | null {
  const threshold = now.getTime() - TUNING.followupAfterMinutes * MS_PER_MINUTE;
  const candidates = sentToday
    .filter(
      (e) =>
        e.kind === 'need' &&
        e.need !== null &&
        e.answeredAt === null &&
        !e.followedUp &&
        e.sentAt.getTime() <= threshold &&
        needs[e.need] < TUNING.askBelow,
    )
    .sort(bySentAt);
  return candidates[0] ?? null;
}
