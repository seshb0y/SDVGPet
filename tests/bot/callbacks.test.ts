import { describe, expect, it, vi } from 'vitest';
import { createBot } from '../../src/bot/bot.js';
import { parseCallback } from '../../src/bot/callbacks.js';
import { claimOutbox, getOutboxToday } from '../../src/db/outbox.js';
import { addNote } from '../../src/db/rewards.js';
import { claimRoutine, createRoutine } from '../../src/db/routines.js';
import { getPet, savePet } from '../../src/db/state.js';
import { createDraft, createTask, getTask } from '../../src/db/tasks.js';
import { testDb } from '../helpers/db.js';
import { BOT_CONFIG, USER, callbackUpdate, captureApi, methods } from '../helpers/telegram.js';

const NOW = new Date('2026-12-27T09:00:00Z');

async function setup(needs = { food: 20, walk: 85, play: 85, love: 85 }) {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: NOW, lastCompletedAt: NOW, completedTotal: 0, lastNoteDate: null });
  const bot = createBot({ config: BOT_CONFIG, db, clock: () => NOW, random: () => 0 });
  const calls = captureApi(bot);
  return { db, bot, calls };
}

describe('parseCallback', () => {
  it('разбирает все форматы и отвергает мусор', () => {
    expect(parseCallback('need:5:walk')).toEqual({ kind: 'need', taskId: 5, need: 'walk' });
    expect(parseCallback('done:7')).toEqual({ kind: 'done', taskId: 7 });
    expect(parseCallback('quick:food:1')).toEqual({ kind: 'quick', need: 'food', index: 1 });
    expect(parseCallback('later')).toEqual({ kind: 'later' });
    expect(parseCallback('rdone:3:2026-12-27')).toEqual({ kind: 'rdone', routineId: 3, date: '2026-12-27' });
    expect(parseCallback('rsnooze:3:2026-12-27:60')).toEqual({ kind: 'rsnooze', routineId: 3, date: '2026-12-27', minutes: 60 });
    expect(parseCallback('rsnooze:3:2026-12-27:5')).toBeNull();
    expect(parseCallback('need:5:cake')).toBeNull();
    expect(parseCallback('whatever')).toBeNull();
    for (const bad of ['done:', 'done:-1', 'done:0', 'done:1e3', 'done:0x10', 'done:7:x', 'need:1.5:walk', 'rdone:1:2026-99-99', 'quick:food:-1', 'quick:food:99', 'later:x']) {
      expect(parseCallback(bad), bad).toBeNull();
    }
  });
});

describe('кнопки', () => {
  it('выбор потребности превращает черновик в задачу и убирает кнопки', async () => {
    const { db, bot, calls } = await setup();
    const draft = await createDraft(db, 'купить корм', 42);
    await bot.handleUpdate(callbackUpdate(USER, `need:${draft!.id}:walk`, 'Записал: «купить корм»'));
    expect((await getTask(db, draft!.id))?.need).toBe('walk');
    expect(methods(calls)).toEqual(['answerCallbackQuery', 'editMessageText']);
    expect(calls[1]?.payload.reply_markup).toBeUndefined();
  });

  it('«Сделала» засчитывает задачу один раз', async () => {
    const { db, bot, calls } = await setup();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await bot.handleUpdate(callbackUpdate(USER, `done:${task.id}`));
    await bot.handleUpdate(callbackUpdate(USER, `done:${task.id}`));
    expect((await getPet(db)).needs.food).toBe(55);
    expect(String(calls.filter((c) => c.method === 'answerCallbackQuery')[1]?.payload.text)).toContain('Уже');
  });

  it('награда за выполнение приходит отдельным сообщением', async () => {
    const { db, bot, calls } = await setup({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await bot.handleUpdate(callbackUpdate(USER, `done:${task.id}`));
    expect(calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes('ты умница'))).toBe(true);
  });

  it('любая кнопка отмечает открытые сигналы отвеченными («Позже» — только это)', async () => {
    const { db, bot } = await setup();
    await claimOutbox(db, { dedupKey: 'need:food:x', kind: 'need', need: 'food', localDate: '2026-12-27', now: NOW });
    await bot.handleUpdate(callbackUpdate(USER, 'later'));
    expect((await getOutboxToday(db, '2026-12-27'))[0]?.answeredAt).toEqual(NOW);
  });

  it('«Сделала» на сигнале без задачи создаёт и выполняет быстрое действие', async () => {
    const { db, bot } = await setup();
    await bot.handleUpdate(callbackUpdate(USER, 'quick:food:0'));
    expect((await getPet(db)).needs.food).toBe(55);
    const [task] = await db.query<{ title: string }>('SELECT title FROM tasks');
    expect(task?.title).toBe('выпить стакан воды');
  });

  it('снуз рутины переносит напоминание', async () => {
    const { db, bot } = await setup();
    const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '12:00', days: 127 });
    await claimRoutine(db, pills.id, '2026-12-27', NOW);
    await bot.handleUpdate(callbackUpdate(USER, `rsnooze:${pills.id}:2026-12-27:15`));
    const [log] = await db.query<{ snoozed_until: Date }>('SELECT snoozed_until FROM routine_log');
    expect(new Date(log!.snoozed_until)).toEqual(new Date('2026-12-27T09:15:00Z'));
  });

  it('«Сделала» на рутине засчитывает её', async () => {
    const { db, bot } = await setup();
    const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '12:00', days: 127 });
    await claimRoutine(db, pills.id, '2026-12-27', NOW);
    await bot.handleUpdate(callbackUpdate(USER, `rdone:${pills.id}:2026-12-27`));
    expect((await getPet(db)).needs.food).toBe(55);
  });

  it('устаревшая кнопка — тост без падения', async () => {
    const { bot, calls } = await setup();
    await bot.handleUpdate(callbackUpdate(USER, 'whatever'));
    expect(calls[0]).toMatchObject({ method: 'answerCallbackQuery' });
    expect(methods(calls)).not.toContain('editMessageText');
  });

  it('ошибка действия: update не падает, в лог пишется, пользователь получает тост', async () => {
    const { db, bot, calls } = await setup();
    await db.query('DROP TABLE tasks CASCADE');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(bot.handleUpdate(callbackUpdate(USER, 'done:1'))).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(calls.find((c) => c.method === 'answerCallbackQuery')?.payload.text).toContain('Ой, что-то пошло не так');
  });
});
