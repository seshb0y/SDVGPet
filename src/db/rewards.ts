import type { Db } from './client.js';

export type RewardKind = 'note' | 'photo';

export interface Reward {
  id: number;
  kind: RewardKind;
  text: string | null;
  fileId: string | null;
  unlockedAt: Date | null;
}

interface RewardRow {
  id: number;
  kind: RewardKind;
  text: string | null;
  file_id: string | null;
  unlocked_at: Date | null;
}

const COLUMNS = 'id, kind, text, file_id, unlocked_at';

function toReward(row: RewardRow): Reward {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    fileId: row.file_id,
    unlockedAt: row.unlocked_at ? new Date(row.unlocked_at) : null,
  };
}

async function one(db: Db, text: string, params: unknown[]): Promise<Reward | null> {
  const [row] = await db.query<RewardRow>(text, params);
  return row ? toReward(row) : null;
}

async function insert(db: Db, kind: RewardKind, text: string | null, fileId: string | null): Promise<Reward> {
  const reward = await one(db, `INSERT INTO rewards (kind, text, file_id) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [
    kind,
    text,
    fileId,
  ]);
  if (!reward) throw new Error('INSERT rewards не вернул строку');
  return reward;
}

export function addNote(db: Db, text: string): Promise<Reward> {
  return insert(db, 'note', text, null);
}

export function addPhoto(db: Db, fileId: string, caption: string | null): Promise<Reward> {
  return insert(db, 'photo', caption, fileId);
}

export function unlockOldest(db: Db, kind: RewardKind, now: Date): Promise<Reward | null> {
  return one(
    db,
    `UPDATE rewards SET unlocked_at = $2
     WHERE id = (SELECT id FROM rewards WHERE kind = $1 AND unlocked_at IS NULL ORDER BY id LIMIT 1)
       AND unlocked_at IS NULL
     RETURNING ${COLUMNS}`,
    [kind, now],
  );
}

export async function countLocked(db: Db): Promise<{ notes: number; photos: number }> {
  const [row] = await db.query<{ notes: number; photos: number }>(
    `SELECT count(*) FILTER (WHERE kind = 'note')::int AS notes,
            count(*) FILTER (WHERE kind = 'photo')::int AS photos
     FROM rewards WHERE unlocked_at IS NULL`,
  );
  return { notes: row?.notes ?? 0, photos: row?.photos ?? 0 };
}

export async function listUnlocked(db: Db): Promise<Reward[]> {
  const rows = await db.query<RewardRow>(
    `SELECT ${COLUMNS} FROM rewards WHERE unlocked_at IS NOT NULL ORDER BY unlocked_at DESC, id DESC`,
  );
  return rows.map(toReward);
}

export function getUnlockedPhoto(db: Db, id: number): Promise<Reward | null> {
  return one(db, `SELECT ${COLUMNS} FROM rewards WHERE id = $1 AND kind = 'photo' AND unlocked_at IS NOT NULL`, [id]);
}
