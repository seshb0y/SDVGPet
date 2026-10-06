import type { Need } from '../core/types.js';
import type { Db } from './client.js';

export interface Task {
  id: number;
  title: string;
  need: Need | null;
  dueAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
}

interface TaskRow {
  id: number;
  title: string;
  need: Need | null;
  due_at: Date | null;
  done_at: Date | null;
  created_at: Date;
}

const COLUMNS = 'id, title, need, due_at, done_at, created_at';
const ORDER_OPEN = 'ORDER BY due_at ASC NULLS LAST, created_at ASC, id ASC';

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    need: row.need,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    createdAt: new Date(row.created_at),
  };
}

async function one(db: Db, text: string, params: unknown[]): Promise<Task | null> {
  const [row] = await db.query<TaskRow>(text, params);
  return row ? toTask(row) : null;
}

export function createDraft(db: Db, title: string, sourceMessageId: number): Promise<Task | null> {
  return one(
    db,
    `INSERT INTO tasks (title, source_message_id) VALUES ($1, $2)
     ON CONFLICT (source_message_id) DO NOTHING RETURNING ${COLUMNS}`,
    [title, sourceMessageId],
  );
}

export async function createQuickTask(
  db: Db,
  input: { title: string; need: Need },
  sourceMessageId: number,
): Promise<Task | null> {
  return one(
    db,
    `INSERT INTO tasks (title, need, source_message_id) VALUES ($1, $2, $3)
     ON CONFLICT (source_message_id) DO NOTHING RETURNING ${COLUMNS}`,
    [input.title, input.need, sourceMessageId],
  );
}

export async function createTask(db: Db, input: { title: string; need: Need; dueAt: Date | null }): Promise<Task> {
  const task = await one(db, `INSERT INTO tasks (title, need, due_at) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [
    input.title,
    input.need,
    input.dueAt,
  ]);
  if (!task) throw new Error('INSERT tasks не вернул строку');
  return task;
}

export function getTask(db: Db, id: number): Promise<Task | null> {
  return one(db, `SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
}

export function setTaskNeed(db: Db, id: number, need: Need): Promise<Task | null> {
  return one(db, `UPDATE tasks SET need = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, need]);
}

export async function updateTask(
  db: Db,
  id: number,
  patch: { title?: string; need?: Need; dueAt?: Date | null },
): Promise<Task | null> {
  const current = await getTask(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  return one(db, `UPDATE tasks SET title = $2, need = $3, due_at = $4 WHERE id = $1 RETURNING ${COLUMNS}`, [
    id,
    next.title,
    next.need,
    next.dueAt,
  ]);
}

export async function deleteTask(db: Db, id: number): Promise<boolean> {
  const rows = await db.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export function markTaskDone(db: Db, id: number, now: Date): Promise<Task | null> {
  return one(
    db,
    `UPDATE tasks SET done_at = $2 WHERE id = $1 AND done_at IS NULL AND need IS NOT NULL RETURNING ${COLUMNS}`,
    [id, now],
  );
}

export async function listOpenTasks(db: Db): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks WHERE need IS NOT NULL AND done_at IS NULL ${ORDER_OPEN}`,
  );
  return rows.map(toTask);
}

export async function listTasksSince(db: Db, since: Date): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks WHERE need IS NOT NULL AND (done_at IS NULL OR done_at >= $1)
     ORDER BY done_at ASC NULLS FIRST, due_at ASC NULLS LAST, created_at ASC, id ASC`,
    [since],
  );
  return rows.map(toTask);
}

export async function listDoneSince(db: Db, since: Date): Promise<Task[]> {
  const rows = await db.query<TaskRow>(`SELECT ${COLUMNS} FROM tasks WHERE done_at >= $1 ORDER BY done_at`, [since]);
  return rows.map(toTask);
}
