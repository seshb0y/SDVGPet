import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { claimOutbox, getOutboxToday } from '../../src/db/outbox.js';
import { addNote, addPhoto } from '../../src/db/rewards.js';
import { createRoutine } from '../../src/db/routines.js';
import { getPet, savePet } from '../../src/db/state.js';
import { createTask } from '../../src/db/tasks.js';
import { completeRoutine, completeTask, quickComplete } from '../../src/services/completion.js';
import { testDb } from '../helpers/db.js';

// 12:00 МСК — бодрствование
const NOW = new Date('2026-12-27T09:00:00Z');

async function dbWithPet(needs = { food: 20, walk: 85, play: 85, love: 85 }, completedTotal = 0): Promise<Db> {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: NOW, lastCompletedAt: NOW, completedTotal, lastNoteDate: null });
  return db;
}

describe('completeTask', () => {
  it('добавляет 35 к потребности задачи и увеличивает счётчик', async () => {
    const db = await dbWithPet();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    const result = await completeTask(db, task.id, NOW);
    expect(result?.needs.food).toBe(55);
    expect((await getPet(db)).completedTotal).toBe(1);
  });

  it('двойное нажатие засчитывается один раз', async () => {
    const db = await dbWithPet();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await completeTask(db, task.id, NOW);
    expect(await completeTask(db, task.id, NOW)).toBeNull();
    expect((await getPet(db)).needs.food).toBe(55);
  });

  it('выдаёт записку, когда все шкалы ≥ 80, и не чаще раза в день', async () => {
    const db = await dbWithPet({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    await addNote(db, 'вторая');
    const first = await createTask(db, { title: 'a', need: 'food', dueAt: null });
    const second = await createTask(db, { title: 'b', need: 'food', dueAt: null });
    expect((await completeTask(db, first.id, NOW))?.rewards).toMatchObject([{ kind: 'note', text: 'ты умница' }]);
    expect((await completeTask(db, second.id, NOW))?.rewards).toEqual([]);
    expect((await getPet(db)).lastNoteDate).toBe('2026-12-27');
  });

  it('выдаёт фото на 10-й выполненной задаче', async () => {
    const db = await dbWithPet(undefined, 9);
    await addPhoto(db, 'FILE', 'море');
    const task = await createTask(db, { title: 'a', need: 'walk', dueAt: null });
    expect((await completeTask(db, task.id, NOW))?.rewards).toMatchObject([{ kind: 'photo', fileId: 'FILE' }]);
  });

  it('без неоткрытых наград ничего не выдаёт и не ломается', async () => {
    const db = await dbWithPet({ food: 90, walk: 90, play: 90, love: 90 }, 9);
    const task = await createTask(db, { title: 'a', need: 'walk', dueAt: null });
    expect((await completeTask(db, task.id, NOW))?.rewards).toEqual([]);
    expect((await getPet(db)).lastNoteDate).toBeNull();
  });

  it('отмечает открытые сигналы отвеченными', async () => {
    const db = await dbWithPet();
    await claimOutbox(db, { dedupKey: 'need:food:x', kind: 'need', need: 'food', localDate: '2026-12-27', now: NOW });
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await completeTask(db, task.id, NOW);
    expect((await getOutboxToday(db, '2026-12-27'))[0]?.answeredAt).toEqual(NOW);
  });
});

describe('completeRoutine и quickComplete', () => {
  it('рутина засчитывается один раз за дату', async () => {
    const db = await dbWithPet();
    const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    expect((await completeRoutine(db, pills.id, '2026-12-27', NOW))?.needs.food).toBe(55);
    expect(await completeRoutine(db, pills.id, '2026-12-27', NOW)).toBeNull();
    expect(await completeRoutine(db, 999, '2026-12-27', NOW)).toBeNull();
  });

  it('quickComplete создаёт и выполняет задачу', async () => {
    const db = await dbWithPet();
    expect((await quickComplete(db, 'food', 'выпить воды', NOW)).needs.food).toBe(55);
  });
});
