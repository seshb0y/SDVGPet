import { describe, expect, it } from 'vitest';
import { dueRoutines, snoozeFits } from '../../../src/core/schedule/routines.js';
import { parseHHMM, type LocalTime } from '../../../src/core/time.js';
import type { Routine, RoutineLogEntry } from '../../../src/core/types.js';

const QUIET = { start: '23:00', end: '09:00' };
const EVERY_DAY = 0b1111111;
const PILLS: Routine = { id: 1, need: 'food', time: '20:00', days: EVERY_DAY, active: true };
const NOW = new Date('2026-12-27T17:05:00Z');

// 27.12.2026 — воскресенье (weekday 6)
function at(hhmm: string): LocalTime {
  return { date: '2026-12-27', minutes: parseHHMM(hhmm), weekday: 6 };
}

describe('dueRoutines', () => {
  it('отправляет рутину в её время', () => {
    expect(dueRoutines([PILLS], [], NOW, at('20:00'), QUIET)).toEqual([{ routineId: 1, resend: false }]);
  });

  it('отправляет с опозданием до 59 минут', () => {
    expect(dueRoutines([PILLS], [], NOW, at('20:59'), QUIET)).toHaveLength(1);
  });

  it('не отправляет пропущенную рутину спустя час и больше', () => {
    expect(dueRoutines([PILLS], [], NOW, at('21:00'), QUIET)).toEqual([]);
  });

  it('не отправляет раньше времени', () => {
    expect(dueRoutines([PILLS], [], NOW, at('19:59'), QUIET)).toEqual([]);
  });

  it('не отправляет в чужой день недели', () => {
    const weekdays: Routine = { ...PILLS, days: 0b0011111 }; // пн–пт
    expect(dueRoutines([weekdays], [], NOW, at('20:00'), QUIET)).toEqual([]);
  });

  it('не отправляет неактивную рутину', () => {
    expect(dueRoutines([{ ...PILLS, active: false }], [], NOW, at('20:00'), QUIET)).toEqual([]);
  });

  it('никогда не отправляет рутину, чьё время внутри тихих часов', () => {
    const early: Routine = { ...PILLS, time: '08:00' };
    expect(dueRoutines([early], [], NOW, at('08:00'), QUIET)).toEqual([]);
    expect(dueRoutines([early], [], NOW, at('09:00'), QUIET)).toEqual([]);
  });

  it('не отправляет повторно уже отправленную сегодня', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: null, snoozedUntil: null }];
    expect(dueRoutines([PILLS], log, NOW, at('20:10'), QUIET)).toEqual([]);
  });

  it('не отправляет выполненную', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: NOW, snoozedUntil: new Date('2026-12-27T17:00:00Z') }];
    expect(dueRoutines([PILLS], log, NOW, at('21:30'), QUIET)).toEqual([]);
  });

  it('повторяет после отложенного времени, даже вне окна', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: null, snoozedUntil: new Date('2026-12-27T17:00:00Z') }];
    expect(dueRoutines([PILLS], log, NOW, at('21:30'), QUIET)).toEqual([{ routineId: 1, resend: true }]);
  });

  it('не повторяет, пока отложенное время не наступило', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: null, snoozedUntil: new Date('2026-12-27T18:00:00Z') }];
    expect(dueRoutines([PILLS], log, NOW, at('21:30'), QUIET)).toEqual([]);
  });
});

describe('snoozeFits', () => {
  const settings = { timezone: 'Europe/Moscow', quiet: QUIET };
  // МСК = UTC+3
  it('отложить на час в 20:00 — подходит', () => {
    expect(snoozeFits(new Date('2026-12-27T17:00:00Z'), 60, settings)).toBe(true);
  });

  it('22:30 + 60 мин попадает в тихие часы', () => {
    expect(snoozeFits(new Date('2026-12-27T19:30:00Z'), 60, settings)).toBe(false);
  });

  it('22:30 + 15 мин ещё до тихих часов', () => {
    expect(snoozeFits(new Date('2026-12-27T19:30:00Z'), 15, settings)).toBe(true);
  });

  it('без тихих часов 23:30 + 60 мин переходит через полночь', () => {
    const open = { timezone: 'Europe/Moscow', quiet: { start: '00:00', end: '00:00' } };
    expect(snoozeFits(new Date('2026-12-27T20:30:00Z'), 60, open)).toBe(false);
  });
});
