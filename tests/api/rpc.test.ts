import { describe, expect, it, vi } from 'vitest';
import { TUNING } from '../../src/core/tuning.js';
import { handleRpc, type RpcDeps } from '../../src/api/rpc.js';
import type { Db } from '../../src/db/client.js';
import { addNote, addPhoto, unlockOldest } from '../../src/db/rewards.js';
import { getSettings, savePet } from '../../src/db/state.js';
import { testDb } from '../helpers/db.js';
import { initDataFor } from '../helpers/initData.js';

const TOKEN = '123456:TEST_TOKEN_ABCDEFGHIJKLMNOP';
const NOW = new Date('2026-12-27T09:00:00Z'); // 12:00 МСК
const USER = 111;

async function setup(needs = { food: 20.7, walk: 85, play: 85, love: 85 }) {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: NOW, lastCompletedAt: NOW, completedTotal: 0, lastNoteDate: null });
  const notify = vi.fn(async () => undefined);
  const fetchPhoto = vi.fn(async () => new Response('IMG', { headers: { 'content-type': 'image/jpeg' } }));
  const deps: RpcDeps = { db, botToken: TOKEN, allowedUserIds: [USER, 222], now: NOW, userChatId: USER, notify, fetchPhoto };
  return { db, deps, notify, fetchPhoto };
}

function call(deps: RpcDeps, body: unknown, auth = `tma ${initDataFor(USER, TOKEN, NOW)}`) {
  const req = new Request('https://x/api/app', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleRpc(req, deps);
}

async function data<T = any>(res: Response): Promise<T> {
  const json = (await res.json()) as { ok: boolean; data: T };
  expect(json.ok).toBe(true);
  return json.data;
}

async function count(db: Db, table: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return row?.n ?? 0;
}

describe('авторизация', () => {
  it('без заголовка, с поддельной подписью и с чужим user.id — 401, ничего не меняется', async () => {
    const { db, deps } = await setup();
    const create = { op: 'tasks.create', title: 'x', need: 'food' };
    expect((await call(deps, create, '')).status).toBe(401);
    expect((await call(deps, create, `tma ${initDataFor(USER, 'other:TOKEN', NOW)}`)).status).toBe(401);
    expect((await call(deps, create, `tma ${initDataFor(999, TOKEN, NOW)}`)).status).toBe(401);
    expect(await count(db, 'tasks')).toBe(0);
  });

  it('некорректное тело — 400', async () => {
    const { deps } = await setup();
    expect((await call(deps, { op: 'tasks.create', title: '', need: 'food' })).status).toBe(400);
    expect((await call(deps, { op: 'nope' })).status).toBe(400);
  });
});

describe('операции', () => {
  it('state — шкалы округлены вниз, настроение и рутины дня', async () => {
    const { deps } = await setup();
    await call(deps, { op: 'routines.create', title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const state = await data(await call(deps, { op: 'state' }));
    expect(state.needs).toEqual({ food: 20, walk: 85, play: 85, love: 85 });
    expect(state.mood).toEqual({ kind: 'asking', need: 'food' });
    expect(state.routinesToday).toMatchObject([{ title: 'таблетки', time: '20:00', done: false }]);
  });

  it('задачи: создать, изменить, выполнить один раз, удалить', async () => {
    const { deps } = await setup();
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food' }));
    const updated = await data(await call(deps, { op: 'tasks.update', id: task.id, title: 'выпить воды' }));
    expect(updated.title).toBe('выпить воды');
    expect(await data(await call(deps, { op: 'tasks.complete', id: task.id }))).toMatchObject({ completed: true });
    expect(await data(await call(deps, { op: 'tasks.complete', id: task.id }))).toMatchObject({ completed: false });
    const list = await data(await call(deps, { op: 'tasks.list' }));
    expect(list).toHaveLength(1);
    expect(await data(await call(deps, { op: 'tasks.delete', id: task.id }))).toEqual({ deleted: true });
    expect((await call(deps, { op: 'tasks.update', id: task.id, title: 'нет' })).status).toBe(404);
  });

  it('награда за выполнение уходит в чат пользователя', async () => {
    const { db, deps, notify } = await setup({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food' }));
    await call(deps, { op: 'tasks.complete', id: task.id });
    expect(notify).toHaveBeenCalledWith(USER, [expect.objectContaining({ text: expect.stringContaining('ты умница') })]);
  });

  it('награда за выполнение админом всё равно уходит в чат пользователя', async () => {
    const { db, deps, notify } = await setup({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food' }));
    await call(deps, { op: 'tasks.complete', id: task.id }, `tma ${initDataFor(222, TOKEN, NOW)}`);
    expect(notify).toHaveBeenCalledWith(USER, expect.anything());
  });

  it('рутины: создать, выполнить за сегодня один раз', async () => {
    const { deps } = await setup();
    const routine = await data(await call(deps, { op: 'routines.create', title: 'таблетки', need: 'food', time: '20:00', days: 127 }));
    expect(await data(await call(deps, { op: 'routines.complete', id: routine.id }))).toMatchObject({ completed: true });
    expect(await data(await call(deps, { op: 'routines.complete', id: routine.id }))).toMatchObject({ completed: false });
    expect(await data(await call(deps, { op: 'routines.list' }))).toHaveLength(1);
  });

  it('настройки: неверные тихие часы — 400, верные сохраняются', async () => {
    const { db, deps } = await setup();
    const bad = { timezone: 'Europe/Moscow', quiet: { start: '02:00', end: '09:00' } };
    expect((await call(deps, { op: 'settings.update', settings: bad })).status).toBe(400);
    const good = { timezone: 'Europe/Moscow', quiet: { start: '22:00', end: '08:00' } };
    await call(deps, { op: 'settings.update', settings: good });
    expect(await getSettings(db)).toEqual(good);
  });

  it('фото: закрытое — 404, открытое — проксируется через fetchPhoto', async () => {
    const { db, deps, fetchPhoto } = await setup();
    const photo = await addPhoto(db, 'FILE_1', 'море');
    expect((await call(deps, { op: 'photo', id: photo.id })).status).toBe(404);
    await unlockOldest(db, 'photo', NOW);
    const res = await call(deps, { op: 'photo', id: photo.id });
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchPhoto).toHaveBeenCalledWith('FILE_1');
    const rewards = await data(await call(deps, { op: 'rewards.list' }));
    expect(rewards).toMatchObject({ photos: [{ id: photo.id, caption: 'море' }], lockedPhotos: 0, nextPhotoIn: TUNING.photoEvery });
  });

  it('fetchPhoto упал — 500 в конверте', async () => {
    const { db, deps, fetchPhoto } = await setup();
    const photo = await addPhoto(db, 'FILE_1', null);
    await unlockOldest(db, 'photo', NOW);
    fetchPhoto.mockRejectedValueOnce(new Error('telegram down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call(deps, { op: 'photo', id: photo.id });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'internal' });
  });

  it('notify упал — выполнение всё равно возвращает completed: true', async () => {
    const { deps, notify } = await setup();
    notify.mockRejectedValueOnce(new Error('telegram down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food' }));
    const res = await call(deps, { op: 'tasks.complete', id: task.id });
    spy.mockRestore();
    expect(await data(res)).toMatchObject({ completed: true });
  });

  it('tasks.update: dueAt: null сбрасывает срок, без dueAt — сохраняет', async () => {
    const { deps } = await setup();
    const dueAt = '2026-12-28T09:00:00.000Z';
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food', dueAt }));
    const kept = await data(await call(deps, { op: 'tasks.update', id: task.id, title: 'ещё вода' }));
    expect(kept.dueAt).toBe(dueAt);
    const cleared = await data(await call(deps, { op: 'tasks.update', id: task.id, dueAt: null }));
    expect(cleared.dueAt).toBeNull();
  });
});
