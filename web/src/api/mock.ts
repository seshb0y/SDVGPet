import { NEEDS } from '../../../src/core/types';
import { ApiError } from './client';
import type { Api, AppState, Needs, PetState, Rewards, Routine, Settings, Task } from './types';

const GAIN = 35;
const now = () => new Date().toISOString();
const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 150));

function moodOf(needs: Needs): PetState {
  const lowest = NEEDS.reduce((a, b) => (needs[b] < needs[a] ? b : a));
  if (needs[lowest] < 30) return { kind: 'asking', need: lowest };
  return needs[lowest] >= 60 ? { kind: 'happy' } : { kind: 'ok' };
}

/** То же правило, что на сервере: начало 20:00–00:00, конец 05:00–12:00. */
function quietValid({ start, end }: Settings['quiet']): boolean {
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const s = minutes(start);
  const e = minutes(end);
  return (s >= 20 * 60 || s === 0) && e >= 5 * 60 && e <= 12 * 60;
}

const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e8a25c"/><text x="60" y="72" font-size="40" text-anchor="middle">🐶</text></svg>';

export function mockApi(): Api {
  let needs: Needs = { food: 22, walk: 64, play: 48, love: 80 };
  let settings: Settings = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };
  let nextId = 100;
  let tasks: Task[] = [
    { id: 1, title: 'Выпить воды', need: 'food', dueAt: null, doneAt: null, createdAt: now() },
    { id: 2, title: 'Ответить Маше', need: 'play', dueAt: null, doneAt: null, createdAt: now() },
    { id: 3, title: 'Позавтракать', need: 'food', dueAt: null, doneAt: now(), createdAt: now() },
  ];
  let routines: Routine[] = [{ id: 10, title: 'Таблетки', need: 'food', time: '20:00', days: 127, active: true }];
  const doneRoutines = new Set<number>();
  const rewards: Rewards = {
    notes: [{ id: 1, text: 'Ты справляешься лучше, чем думаешь 🤍', unlockedAt: now() }],
    photos: [
      { id: 1, caption: 'Шантик на прогулке', unlockedAt: now() },
      { id: 999, caption: 'Это фото не загрузится', unlockedAt: now() },
    ],
    lockedPhotos: 2,
    nextPhotoIn: 7,
  };

  const gain = (need: Task['need']) => {
    if (need) needs = { ...needs, [need]: Math.min(100, needs[need] + GAIN) };
    return delay({ completed: true, needs });
  };
  const findTask = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new ApiError(404, 'not_found');
    return task;
  };
  const findRoutine = (id: number) => {
    const routine = routines.find((r) => r.id === id);
    if (!routine) throw new ApiError(404, 'not_found');
    return routine;
  };
  const state = (): AppState => ({
    needs,
    mood: moodOf(needs),
    settings,
    tasks: tasks.filter((t) => !t.doneAt).slice(0, 3),
    routinesToday: routines
      .filter((r) => r.active)
      .map((r) => ({ id: r.id, title: r.title, time: r.time, need: r.need, done: doneRoutines.has(r.id) })),
  });

  return {
    state: async () => delay(state()),
    listTasks: async () => delay(tasks),
    createTask: async (input) => {
      const task: Task = { id: nextId++, title: input.title, need: input.need, dueAt: input.dueAt ?? null, doneAt: null, createdAt: now() };
      tasks = [...tasks, task];
      return delay(task);
    },
    updateTask: async (id, patch) => {
      const task = { ...findTask(id), ...patch };
      tasks = tasks.map((t) => (t.id === id ? task : t));
      return delay(task);
    },
    deleteTask: async (id) => {
      findTask(id);
      tasks = tasks.filter((t) => t.id !== id);
      await delay(null);
    },
    completeTask: async (id) => {
      const task = findTask(id);
      if (task.doneAt) return delay({ completed: false, needs });
      tasks = tasks.map((t) => (t.id === id ? { ...t, doneAt: now() } : t));
      return gain(task.need);
    },
    listRoutines: async () => delay(routines),
    createRoutine: async (input) => {
      const routine: Routine = { id: nextId++, active: true, ...input };
      routines = [...routines, routine];
      return delay(routine);
    },
    updateRoutine: async (id, patch) => {
      const routine = { ...findRoutine(id), ...patch };
      routines = routines.map((r) => (r.id === id ? routine : r));
      return delay(routine);
    },
    deleteRoutine: async (id) => {
      findRoutine(id);
      routines = routines.filter((r) => r.id !== id);
      await delay(null);
    },
    completeRoutine: async (id) => {
      const routine = findRoutine(id);
      if (doneRoutines.has(id)) return delay({ completed: false, needs });
      doneRoutines.add(id);
      return gain(routine.need);
    },
    updateSettings: async (next) => {
      if (!quietValid(next.quiet)) throw new ApiError(400, 'bad_request');
      settings = next;
      return delay(settings);
    },
    rewards: async () => delay(rewards),
    photo: async (id) => {
      if (id === 999) throw new ApiError(500, 'internal');
      return delay(new Blob([PHOTO_SVG], { type: 'image/svg+xml' }));
    },
  };
}
