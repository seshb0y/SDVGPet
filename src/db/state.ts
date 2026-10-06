import type { Needs, Settings } from '../core/types.js';
import type { Db } from './client.js';

export interface PetRecord {
  needs: Needs;
  updatedAt: Date;
  lastCompletedAt: Date | null;
  completedTotal: number;
  lastNoteDate: string | null;
}

interface SettingsRow {
  timezone: string;
  quiet_start: string;
  quiet_end: string;
}

interface PetRow {
  food: number;
  walk: number;
  play: number;
  love: number;
  updated_at: Date;
  last_completed_at: Date | null;
  completed_total: number;
  last_note_date: string | null;
}

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.query<SettingsRow>('SELECT timezone, quiet_start, quiet_end FROM settings WHERE id = 1');
  if (!row) throw new Error('Нет строки settings — схема не применена');
  return { timezone: row.timezone, quiet: { start: row.quiet_start, end: row.quiet_end } };
}

export async function saveSettings(db: Db, settings: Settings): Promise<void> {
  await db.query('UPDATE settings SET timezone = $1, quiet_start = $2, quiet_end = $3 WHERE id = 1', [
    settings.timezone,
    settings.quiet.start,
    settings.quiet.end,
  ]);
}

export async function getPet(db: Db): Promise<PetRecord> {
  const [row] = await db.query<PetRow>('SELECT * FROM pet WHERE id = 1');
  if (!row) throw new Error('Нет строки pet — схема не применена');
  return {
    needs: { food: row.food, walk: row.walk, play: row.play, love: row.love },
    updatedAt: new Date(row.updated_at),
    lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at) : null,
    completedTotal: row.completed_total,
    lastNoteDate: row.last_note_date,
  };
}

export async function savePet(db: Db, pet: PetRecord): Promise<void> {
  await db.query(
    `UPDATE pet SET food = $1, walk = $2, play = $3, love = $4, updated_at = $5,
       last_completed_at = $6, completed_total = $7, last_note_date = $8 WHERE id = 1`,
    [
      pet.needs.food,
      pet.needs.walk,
      pet.needs.play,
      pet.needs.love,
      pet.updatedAt,
      pet.lastCompletedAt,
      pet.completedTotal,
      pet.lastNoteDate,
    ],
  );
}
