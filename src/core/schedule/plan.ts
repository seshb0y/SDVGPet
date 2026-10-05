import { isQuiet, localTime, type LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { Need, Needs, OutboxEntry, Routine, RoutineLogEntry, Settings } from '../types.js';
import { dueCheckin } from './checkins.js';
import { dueRoutines } from './routines.js';
import { dueFollowup, needSignal } from './signals.js';

export interface TickInput {
  now: Date;
  settings: Settings;
  needs: Needs;
  routines: readonly Routine[];
  routineLog: readonly RoutineLogEntry[];
  outboxToday: readonly OutboxEntry[];
}

export type Outgoing =
  | { kind: 'routine'; routineId: number; resend: boolean }
  | { kind: 'morning' | 'evening'; dedupKey: string }
  | { kind: 'need'; need: Need; dedupKey: string }
  | { kind: 'followup'; parentId: number; need: Need; dedupKey: string };

function cappedCandidates(input: TickInput, local: LocalTime): Outgoing[] {
  const { now, settings, needs, outboxToday } = input;
  const { date } = local;
  const result: Outgoing[] = [];

  const checkin = dueCheckin(local, settings.quiet, outboxToday);
  if (checkin) result.push({ kind: checkin, dedupKey: `${checkin}:${date}` });

  const followup = dueFollowup(needs, now, outboxToday);
  if (followup?.need) {
    result.push({ kind: 'followup', parentId: followup.id, need: followup.need, dedupKey: `followup:${followup.id}` });
  }

  const signal = needSignal(needs, local, now, outboxToday);
  if (signal && signal.need !== followup?.need) {
    result.push({ kind: 'need', need: signal.need, dedupKey: `need:${signal.need}:${date}:${signal.slot}` });
  }
  return result;
}

export function planTick(input: TickInput): Outgoing[] {
  const local = localTime(input.now, input.settings.timezone);
  if (isQuiet(local.minutes, input.settings.quiet)) return [];

  const routines: Outgoing[] = dueRoutines(input.routines, input.routineLog, input.now, local, input.settings.quiet).map(
    (due) => ({ kind: 'routine', ...due }),
  );
  const budget = Math.max(0, TUNING.dailyCap - input.outboxToday.length);
  const capped = cappedCandidates(input, local).slice(0, budget);
  return [...routines, ...capped];
}
