import { isQuiet, parseHHMM, type LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { QuietHours, Routine, RoutineLogEntry } from '../types.js';

export interface DueRoutine {
  routineId: number;
  resend: boolean;
}

function isScheduledToday(routine: Routine, weekday: number): boolean {
  return routine.active && (routine.days & (1 << weekday)) !== 0;
}

function dueOne(
  routine: Routine,
  entry: RoutineLogEntry | undefined,
  now: Date,
  local: LocalTime,
  quiet: QuietHours,
): DueRoutine | null {
  const time = parseHHMM(routine.time);
  if (!isScheduledToday(routine, local.weekday) || isQuiet(time, quiet)) return null;

  if (!entry) {
    const late = local.minutes - time;
    return late >= 0 && late < TUNING.routineWindowMinutes ? { routineId: routine.id, resend: false } : null;
  }
  if (entry.doneAt) return null;
  const snoozeOver = entry.snoozedUntil !== null && entry.snoozedUntil.getTime() <= now.getTime();
  return snoozeOver ? { routineId: routine.id, resend: true } : null;
}

export function dueRoutines(
  routines: readonly Routine[],
  todayLog: readonly RoutineLogEntry[],
  now: Date,
  local: LocalTime,
  quiet: QuietHours,
): DueRoutine[] {
  return routines.flatMap((routine) => {
    const entry = todayLog.find((e) => e.routineId === routine.id);
    const due = dueOne(routine, entry, now, local, quiet);
    return due ? [due] : [];
  });
}
