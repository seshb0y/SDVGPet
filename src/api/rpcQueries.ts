import { petState } from '../core/mood.js';
import { localTime } from '../core/time.js';
import { TUNING } from '../core/tuning.js';
import { NEEDS, type Needs } from '../core/types.js';
import { countLocked, listUnlocked } from '../db/rewards.js';
import { getRoutineLog, listRoutines } from '../db/routines.js';
import { getSettings } from '../db/state.js';
import { listOpenTasks } from '../db/tasks.js';
import { type CompletionResult, loadCurrentNeeds } from '../services/completion.js';
import { rewardMessages } from '../services/messages.js';
import type { RpcDeps } from './rpc.js';

const MS_PER_MINUTE = 60_000;

const floorNeeds = (needs: Needs): Needs =>
  Object.fromEntries(NEEDS.map((need) => [need, Math.floor(needs[need])])) as Needs;

export async function state(deps: RpcDeps): Promise<unknown> {
  const { needs, settings } = await loadCurrentNeeds(deps.db, deps.now);
  const local = localTime(deps.now, settings.timezone);
  const [tasks, routines, log] = await Promise.all([
    listOpenTasks(deps.db),
    listRoutines(deps.db),
    getRoutineLog(deps.db, local.date),
  ]);
  const routinesToday = routines
    .filter((r) => r.active && (r.days & (1 << local.weekday)) !== 0)
    .map((r) => ({
      id: r.id,
      title: r.title,
      time: r.time,
      need: r.need,
      done: log.some((e) => e.routineId === r.id && e.doneAt),
    }));
  return {
    needs: floorNeeds(needs),
    mood: petState(needs, local.minutes, settings.quiet),
    settings,
    tasks: tasks.slice(0, 3),
    routinesToday,
  };
}

export async function finish(deps: RpcDeps, userId: number, result: CompletionResult | null): Promise<unknown> {
  if (result) {
    try {
      await deps.notify(userId, rewardMessages(result.rewards));
    } catch (error) {
      console.error('[rpc] не удалось отправить награду', error);
    }
  }
  const { needs } = await loadCurrentNeeds(deps.db, deps.now);
  return { completed: result !== null, needs: floorNeeds(needs) };
}

export async function rewards(deps: RpcDeps): Promise<unknown> {
  const [unlocked, locked, { pet }] = await Promise.all([
    listUnlocked(deps.db),
    countLocked(deps.db),
    loadCurrentNeeds(deps.db, deps.now),
  ]);
  const pick = (kind: 'note' | 'photo') => unlocked.filter((r) => r.kind === kind);
  return {
    notes: pick('note').map((r) => ({ id: r.id, text: r.text, unlockedAt: r.unlockedAt })),
    photos: pick('photo').map((r) => ({ id: r.id, caption: r.text, unlockedAt: r.unlockedAt })),
    lockedPhotos: locked.photos,
    nextPhotoIn: TUNING.photoEvery - (pet.completedTotal % TUNING.photoEvery),
  };
}

export async function today(deps: RpcDeps): Promise<{ date: string; since: Date }> {
  const { timezone } = await getSettings(deps.db);
  const local = localTime(deps.now, timezone);
  // ponytail: начало локального дня без учёта перехода на летнее время (для МСК неважно)
  const since = new Date(deps.now.getTime() - local.minutes * MS_PER_MINUTE - (deps.now.getTime() % MS_PER_MINUTE));
  return { date: local.date, since };
}
