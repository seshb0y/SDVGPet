import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { claimOutbox, getOutboxToday } from '../../src/db/outbox.js';
import { createRoutine, getRoutineLog } from '../../src/db/routines.js';
import { savePet } from '../../src/db/state.js';
import { createTask } from '../../src/db/tasks.js';
import type { OutgoingMessage } from '../../src/services/messages.js';
import { runTick } from '../../src/services/tick.js';
import { testDb } from '../helpers/db.js';

const FULL = { food: 100, walk: 100, play: 100, love: 100 };

async function setup(now: Date, needs = FULL): Promise<Db> {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: now, lastCompletedAt: now, completedTotal: 0, lastNoteDate: null });
  return db;
}

function recorder(failTimes = 0) {
  const sent: OutgoingMessage[] = [];
  let failures = failTimes;
  const send = async (message: OutgoingMessage) => {
    if (failures > 0) {
      failures--;
      throw new Error('telegram down');
    }
    sent.push(message);
  };
  return { sent, send };
}

const deps = (db: Db, send: (m: OutgoingMessage) => Promise<void>, now: Date) => ({
  db,
  send,
  now,
  random: () => 0,
  miniAppUrl: 'https://app.example',
});

describe('runTick', () => {
  it('отправляет рутину в её время и не дублирует при повторном tick', async () => {
    const now = new Date('2026-12-27T17:05:00Z'); // 20:05 МСК
    const db = await setup(now);
    await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const rec = recorder();
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 1, failed: 0 });
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 0, failed: 0 });
    expect(rec.sent).toHaveLength(1);
    expect(rec.sent[0]?.text).toContain('таблетки');
  });

  it('при ошибке Telegram снимает захват, следующий tick повторяет', async () => {
    const now = new Date('2026-12-27T17:05:00Z');
    const db = await setup(now);
    await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const rec = recorder(1);
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 0, failed: 1 });
    expect(await getRoutineLog(db, '2026-12-27')).toEqual([]);
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 1, failed: 0 });
  });

  it('сигнал потребности предлагает её открытую задачу', async () => {
    const now = new Date('2026-12-27T09:00:00Z'); // 12:00 МСК
    const db = await setup(now, { food: 20, walk: 90, play: 90, love: 90 });
    await createTask(db, { title: 'пообедать', need: 'food', dueAt: null });
    const rec = recorder();
    await runTick(deps(db, rec.send, now));
    expect(rec.sent[0]?.text).toContain('пообедать');
    expect(await getOutboxToday(db, '2026-12-27')).toMatchObject([{ kind: 'need', need: 'food' }]);
  });

  it('повтор сигнала помечает родителя followed_up', async () => {
    const now = new Date('2026-12-27T10:30:00Z'); // 13:30 МСК
    const db = await setup(now, { food: 20, walk: 90, play: 90, love: 90 });
    const parentId = await claimOutbox(db, {
      dedupKey: 'need:food:2026-12-27:3h:3',
      kind: 'need',
      need: 'food',
      localDate: '2026-12-27',
      now: new Date('2026-12-27T08:50:00Z'), // 100 минут назад
    });
    const rec = recorder();
    await runTick(deps(db, rec.send, now));
    const parent = (await getOutboxToday(db, '2026-12-27')).find((e) => e.id === parentId);
    expect(parent?.followedUp).toBe(true);
    expect(rec.sent).toHaveLength(1);
  });

  it('утро — без звука, перечисляет рутины дня', async () => {
    const now = new Date('2026-12-27T06:40:00Z'); // 09:40 МСК
    const db = await setup(now);
    await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const rec = recorder();
    await runTick(deps(db, rec.send, now));
    expect(rec.sent[0]).toMatchObject({ silent: true });
    expect(rec.sent[0]?.text).toContain('таблетки в 20:00');
  });

  it('в тихие часы ничего не шлёт', async () => {
    const now = new Date('2026-12-26T23:00:00Z'); // 02:00 МСК
    const db = await setup(now, { food: 10, walk: 10, play: 10, love: 10 });
    const rec = recorder();
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 0, failed: 0 });
  });
});
