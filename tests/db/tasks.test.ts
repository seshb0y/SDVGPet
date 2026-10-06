import { describe, expect, it } from 'vitest';
import {
  createDraft,
  createTask,
  deleteTask,
  getTask,
  listDoneSince,
  listOpenTasks,
  listTasksSince,
  markTaskDone,
  setTaskNeed,
  updateTask,
} from '../../src/db/tasks.js';
import { testDb } from '../helpers/db.js';

const NOW = new Date('2026-12-27T10:00:00Z');

describe('tasks repo', () => {
  it('черновик из чата создаётся один раз на message_id', async () => {
    const db = await testDb();
    const first = await createDraft(db, 'купить корм', 555);
    const repeat = await createDraft(db, 'купить корм', 555);
    expect(first).toMatchObject({ title: 'купить корм', need: null });
    expect(repeat).toBeNull();
  });

  it('черновик без потребности не попадает в списки, после выбора — попадает', async () => {
    const db = await testDb();
    const draft = await createDraft(db, 'купить корм', 1);
    expect(await listOpenTasks(db)).toEqual([]);
    await setTaskNeed(db, draft!.id, 'walk');
    expect((await listOpenTasks(db)).map((t) => t.title)).toEqual(['купить корм']);
  });

  it('выполнение засчитывается один раз', async () => {
    const db = await testDb();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    expect(await markTaskDone(db, task.id, NOW)).toMatchObject({ id: task.id, doneAt: NOW });
    expect(await markTaskDone(db, task.id, NOW)).toBeNull();
  });

  it('черновик без потребности выполнить нельзя', async () => {
    const db = await testDb();
    const draft = await createDraft(db, 'что-то', 2);
    expect(await markTaskDone(db, draft!.id, NOW)).toBeNull();
  });

  it('обновляет поля частично и умеет сбросить срок', async () => {
    const db = await testDb();
    const task = await createTask(db, { title: 'врач', need: 'play', dueAt: NOW });
    expect(await updateTask(db, task.id, { title: 'записаться к врачу' })).toMatchObject({
      title: 'записаться к врачу',
      need: 'play',
      dueAt: NOW,
    });
    expect(await updateTask(db, task.id, { dueAt: null })).toMatchObject({ dueAt: null });
    expect(await updateTask(db, 999, { title: 'нет' })).toBeNull();
  });

  it('удаляет задачу', async () => {
    const db = await testDb();
    const task = await createTask(db, { title: 'x', need: 'love', dueAt: null });
    expect(await deleteTask(db, task.id)).toBe(true);
    expect(await getTask(db, task.id)).toBeNull();
    expect(await deleteTask(db, task.id)).toBe(false);
  });

  it('открытые задачи упорядочены по сроку, без срока — в конце', async () => {
    const db = await testDb();
    await createTask(db, { title: 'без срока', need: 'food', dueAt: null });
    await createTask(db, { title: 'позже', need: 'food', dueAt: new Date('2026-12-27T15:00:00Z') });
    await createTask(db, { title: 'раньше', need: 'food', dueAt: new Date('2026-12-27T11:00:00Z') });
    expect((await listOpenTasks(db)).map((t) => t.title)).toEqual(['раньше', 'позже', 'без срока']);
  });

  it('listTasksSince — открытые и выполненные после границы; listDoneSince — только выполненные', async () => {
    const db = await testDb();
    const old = await createTask(db, { title: 'старая', need: 'food', dueAt: null });
    const fresh = await createTask(db, { title: 'свежая', need: 'food', dueAt: null });
    await createTask(db, { title: 'открытая', need: 'food', dueAt: null });
    await markTaskDone(db, old.id, new Date('2026-12-26T10:00:00Z'));
    await markTaskDone(db, fresh.id, NOW);
    const since = new Date('2026-12-27T00:00:00Z');
    expect((await listTasksSince(db, since)).map((t) => t.title).sort()).toEqual(['открытая', 'свежая']);
    expect((await listDoneSince(db, since)).map((t) => t.title)).toEqual(['свежая']);
  });
});
