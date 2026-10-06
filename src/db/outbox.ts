import type { CappedKind, Need, OutboxEntry } from '../core/types.js';
import type { Db } from './client.js';

interface OutboxRow {
  id: number;
  kind: CappedKind;
  need: Need | null;
  sent_at: Date;
  answered_at: Date | null;
  followed_up: boolean;
}

export interface OutboxClaim {
  dedupKey: string;
  kind: CappedKind;
  need: Need | null;
  localDate: string;
  now: Date;
}

export async function getOutboxToday(db: Db, localDate: string): Promise<OutboxEntry[]> {
  const rows = await db.query<OutboxRow>(
    'SELECT id, kind, need, sent_at, answered_at, followed_up FROM outbox_log WHERE local_date = $1 ORDER BY sent_at, id',
    [localDate],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    need: row.need,
    sentAt: new Date(row.sent_at),
    answeredAt: row.answered_at ? new Date(row.answered_at) : null,
    followedUp: row.followed_up,
  }));
}

export async function claimOutbox(db: Db, claim: OutboxClaim): Promise<number | null> {
  const [row] = await db.query<{ id: number }>(
    `INSERT INTO outbox_log (dedup_key, kind, need, local_date, sent_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
    [claim.dedupKey, claim.kind, claim.need, claim.localDate, claim.now],
  );
  return row?.id ?? null;
}

export async function releaseOutbox(db: Db, id: number): Promise<void> {
  await db.query('DELETE FROM outbox_log WHERE id = $1', [id]);
}

export async function markFollowedUp(db: Db, id: number): Promise<void> {
  await db.query('UPDATE outbox_log SET followed_up = true WHERE id = $1', [id]);
}

export async function answerOpenSignals(db: Db, now: Date): Promise<void> {
  await db.query(
    `UPDATE outbox_log SET answered_at = $1 WHERE answered_at IS NULL AND kind IN ('need', 'followup')`,
    [now],
  );
}
