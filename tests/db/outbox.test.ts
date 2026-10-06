import { describe, expect, it } from 'vitest';
import {
  answerOpenSignals,
  claimOutbox,
  getOutboxToday,
  markFollowedUp,
  releaseOutbox,
} from '../../src/db/outbox.js';
import { testDb } from '../helpers/db.js';

const NOW = new Date('2026-12-27T09:00:00Z');
const signal = { dedupKey: 'need:food:2026-12-27:3h:4', kind: 'need' as const, need: 'food' as const, localDate: '2026-12-27', now: NOW };

describe('outbox repo', () => {
  it('ключ захватывается один раз; откат освобождает', async () => {
    const db = await testDb();
    const id = await claimOutbox(db, signal);
    expect(id).toBeTypeOf('number');
    expect(await claimOutbox(db, signal)).toBeNull();
    await releaseOutbox(db, id!);
    expect(await claimOutbox(db, signal)).toBeTypeOf('number');
  });

  it('getOutboxToday возвращает записи только за дату', async () => {
    const db = await testDb();
    await claimOutbox(db, signal);
    await claimOutbox(db, { ...signal, dedupKey: 'morning:2026-12-26', kind: 'morning', need: null, localDate: '2026-12-26' });
    expect(await getOutboxToday(db, '2026-12-27')).toEqual([
      { id: expect.any(Number), kind: 'need', need: 'food', sentAt: NOW, answeredAt: null, followedUp: false },
    ]);
  });

  it('повтор помечается, ответ закрывает только сигналы', async () => {
    const db = await testDb();
    const id = await claimOutbox(db, signal);
    await claimOutbox(db, { ...signal, dedupKey: 'morning:2026-12-27', kind: 'morning', need: null });
    await markFollowedUp(db, id!);
    const later = new Date('2026-12-27T10:00:00Z');
    await answerOpenSignals(db, later);
    const entries = await getOutboxToday(db, '2026-12-27');
    expect(entries.find((e) => e.kind === 'need')).toMatchObject({ followedUp: true, answeredAt: later });
    expect(entries.find((e) => e.kind === 'morning')).toMatchObject({ answeredAt: null });
  });
});
