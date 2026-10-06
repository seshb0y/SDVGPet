import type { Need, Routine, RoutineLogEntry } from '../core/types.js';
import type { Db } from './client.js';

export interface RoutineRecord extends Routine {
  title: string;
}

type RoutinePatch = Partial<{ title: string; need: Need; time: string; days: number; active: boolean }>;

interface RoutineRow {
  id: number;
  title: string;
  need: Need;
  time: string;
  days: number;
  active: boolean;
}

interface LogRow {
  routine_id: number;
  done_at: Date | null;
  snoozed_until: Date | null;
}

const COLUMNS = 'id, title, need, time, days, active';

const toRoutine = (row: RoutineRow): RoutineRecord => ({ ...row });

async function oneRoutine(db: Db, text: string, params: unknown[]): Promise<RoutineRecord | null> {
  const [row] = await db.query<RoutineRow>(text, params);
  return row ? toRoutine(row) : null;
}

async function affected(db: Db, text: string, params: unknown[]): Promise<boolean> {
  return (await db.query(text, params)).length > 0;
}

export async function listRoutines(db: Db): Promise<RoutineRecord[]> {
  return (await db.query<RoutineRow>(`SELECT ${COLUMNS} FROM routines ORDER BY time, id`)).map(toRoutine);
}

export function getRoutine(db: Db, id: number): Promise<RoutineRecord | null> {
  return oneRoutine(db, `SELECT ${COLUMNS} FROM routines WHERE id = $1`, [id]);
}

export async function createRoutine(
  db: Db,
  input: { title: string; need: Need; time: string; days: number },
): Promise<RoutineRecord> {
  const routine = await oneRoutine(
    db,
    `INSERT INTO routines (title, need, time, days) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [input.title, input.need, input.time, input.days],
  );
  if (!routine) throw new Error('INSERT routines не вернул строку');
  return routine;
}

export async function updateRoutine(db: Db, id: number, patch: RoutinePatch): Promise<RoutineRecord | null> {
  const current = await getRoutine(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  return oneRoutine(
    db,
    `UPDATE routines SET title = $2, need = $3, time = $4, days = $5, active = $6 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, next.title, next.need, next.time, next.days, next.active],
  );
}

export function deleteRoutine(db: Db, id: number): Promise<boolean> {
  return affected(db, 'DELETE FROM routines WHERE id = $1 RETURNING id', [id]);
}

export async function getRoutineLog(db: Db, date: string): Promise<RoutineLogEntry[]> {
  const rows = await db.query<LogRow>(
    'SELECT routine_id, done_at, snoozed_until FROM routine_log WHERE date = $1 ORDER BY routine_id',
    [date],
  );
  return rows.map((row) => ({
    routineId: row.routine_id,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : null,
  }));
}

export function claimRoutine(db: Db, routineId: number, date: string, now: Date): Promise<boolean> {
  return affected(
    db,
    `INSERT INTO routine_log (routine_id, date, sent_at) VALUES ($1, $2, $3)
     ON CONFLICT (routine_id, date) DO NOTHING RETURNING routine_id`,
    [routineId, date, now],
  );
}

export async function releaseRoutine(db: Db, routineId: number, date: string): Promise<void> {
  await db.query('DELETE FROM routine_log WHERE routine_id = $1 AND date = $2 AND done_at IS NULL', [routineId, date]);
}

export function claimRoutineResend(db: Db, routineId: number, date: string, now: Date): Promise<boolean> {
  return affected(
    db,
    `UPDATE routine_log SET snoozed_until = NULL, sent_at = $3
     WHERE routine_id = $1 AND date = $2 AND done_at IS NULL AND snoozed_until <= $3 RETURNING routine_id`,
    [routineId, date, now],
  );
}

export async function restoreSnooze(db: Db, routineId: number, date: string, until: Date): Promise<void> {
  await db.query('UPDATE routine_log SET snoozed_until = $3 WHERE routine_id = $1 AND date = $2 AND done_at IS NULL', [
    routineId,
    date,
    until,
  ]);
}

export function snoozeRoutine(db: Db, routineId: number, date: string, until: Date): Promise<boolean> {
  return affected(
    db,
    `UPDATE routine_log SET snoozed_until = $3 WHERE routine_id = $1 AND date = $2 AND done_at IS NULL
     RETURNING routine_id`,
    [routineId, date, until],
  );
}

export function markRoutineDone(db: Db, routineId: number, date: string, now: Date): Promise<boolean> {
  return affected(
    db,
    `INSERT INTO routine_log (routine_id, date, sent_at, done_at) VALUES ($1, $2, $3, $3)
     ON CONFLICT (routine_id, date) DO UPDATE SET done_at = EXCLUDED.done_at
     WHERE routine_log.done_at IS NULL RETURNING routine_id`,
    [routineId, date, now],
  );
}

export async function countRoutinesDoneOn(db: Db, date: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM routine_log WHERE date = $1 AND done_at IS NOT NULL',
    [date],
  );
  return row?.n ?? 0;
}
