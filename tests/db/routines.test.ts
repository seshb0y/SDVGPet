import { describe, expect, it } from 'vitest';
import {
  claimRoutine,
  claimRoutineResend,
  countRoutinesDoneOn,
  createRoutine,
  deleteRoutine,
  getRoutineLog,
  listRoutines,
  markRoutineDone,
  releaseRoutine,
  restoreSnooze,
  snoozeRoutine,
  updateRoutine,
} from '../../src/db/routines.js';
import { testDb } from '../helpers/db.js';

const DATE = '2026-12-27';
const T0 = new Date('2026-12-27T17:00:00Z');
const T1 = new Date('2026-12-27T17:20:00Z');

async function withPills() {
  const db = await testDb();
  const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
  return { db, pills };
}

describe('routines repo', () => {
  it('создаёт, обновляет, выключает и удаляет рутину', async () => {
    const { db, pills } = await withPills();
    expect(pills).toMatchObject({ title: 'таблетки', need: 'food', time: '20:00', days: 127, active: true });
    expect(await updateRoutine(db, pills.id, { time: '21:00', active: false })).toMatchObject({ time: '21:00', active: false });
    expect(await listRoutines(db)).toHaveLength(1);
    expect(await deleteRoutine(db, pills.id)).toBe(true);
    expect(await listRoutines(db)).toEqual([]);
  });

  it('первую отправку можно захватить один раз; откат освобождает', async () => {
    const { db, pills } = await withPills();
    expect(await claimRoutine(db, pills.id, DATE, T0)).toBe(true);
    expect(await claimRoutine(db, pills.id, DATE, T0)).toBe(false);
    await releaseRoutine(db, pills.id, DATE);
    expect(await claimRoutine(db, pills.id, DATE, T0)).toBe(true);
  });

  it('повтор после снуза захватывается один раз и только после наступления времени', async () => {
    const { db, pills } = await withPills();
    await claimRoutine(db, pills.id, DATE, T0);
    expect(await snoozeRoutine(db, pills.id, DATE, T1)).toBe(true);
    expect(await claimRoutineResend(db, pills.id, DATE, T0)).toBe(false);
    expect(await claimRoutineResend(db, pills.id, DATE, T1)).toBe(true);
    expect(await claimRoutineResend(db, pills.id, DATE, T1)).toBe(false);
    await restoreSnooze(db, pills.id, DATE, T1);
    expect(await claimRoutineResend(db, pills.id, DATE, T1)).toBe(true);
  });

  it('выполнение засчитывается один раз, даже без отправленного напоминания', async () => {
    const { db, pills } = await withPills();
    expect(await markRoutineDone(db, pills.id, DATE, T0)).toBe(true);
    expect(await markRoutineDone(db, pills.id, DATE, T1)).toBe(false);
    expect(await snoozeRoutine(db, pills.id, DATE, T1)).toBe(false);
    expect(await countRoutinesDoneOn(db, DATE)).toBe(1);
    expect(await getRoutineLog(db, DATE)).toEqual([{ routineId: pills.id, doneAt: T0, snoozedUntil: null }]);
  });
});
