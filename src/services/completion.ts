import { applyCompletion, decay } from '../core/needs.js';
import { rewardsEarned } from '../core/rewards.js';
import { localTime } from '../core/time.js';
import type { Need, Needs, Settings } from '../core/types.js';
import type { Db } from '../db/client.js';
import { answerOpenSignals } from '../db/outbox.js';
import { type Reward, unlockOldest } from '../db/rewards.js';
import { getRoutine, markRoutineDone } from '../db/routines.js';
import { getPet, getSettings, type PetRecord, savePet } from '../db/state.js';
import { createQuickTask, markTaskDone } from '../db/tasks.js';

export interface CompletionResult {
  needs: Needs;
  rewards: Reward[];
}

export async function loadCurrentNeeds(db: Db, now: Date): Promise<{ needs: Needs; settings: Settings; pet: PetRecord }> {
  const [pet, settings] = await Promise.all([getPet(db), getSettings(db)]);
  return { needs: decay(pet.needs, pet.updatedAt, now, settings), settings, pet };
}

// ponytail: read-modify-write строки pet без блокировки — пользователь один; при двух одновременных
// выполнениях один прирост может потеряться. Если станет важно — sql.transaction с SELECT ... FOR UPDATE.
async function applyPetCompletion(db: Db, need: Need, now: Date): Promise<CompletionResult> {
  const { needs: decayed, settings, pet } = await loadCurrentNeeds(db, now);
  const needs = applyCompletion(decayed, need, pet.lastCompletedAt, now);
  const completedTotal = pet.completedTotal + 1;
  const today = localTime(now, settings.timezone).date;
  const earned = rewardsEarned({ needs, completedTotal, lastNoteDate: pet.lastNoteDate, today });
  const note = earned.note ? await unlockOldest(db, 'note', now) : null;
  const photo = earned.photo ? await unlockOldest(db, 'photo', now) : null;

  await savePet(db, {
    needs,
    updatedAt: now,
    lastCompletedAt: now,
    completedTotal,
    lastNoteDate: note ? today : pet.lastNoteDate,
  });
  await answerOpenSignals(db, now);
  return { needs, rewards: [note, photo].filter((reward): reward is Reward => reward !== null) };
}

export async function completeTask(db: Db, taskId: number, now: Date): Promise<CompletionResult | null> {
  const task = await markTaskDone(db, taskId, now);
  if (!task?.need) return null;
  return applyPetCompletion(db, task.need, now);
}

export async function completeRoutine(
  db: Db,
  routineId: number,
  date: string,
  now: Date,
): Promise<CompletionResult | null> {
  const routine = await getRoutine(db, routineId);
  if (!routine) return null;
  if (!(await markRoutineDone(db, routineId, date, now))) return null;
  return applyPetCompletion(db, routine.need, now);
}

export async function quickComplete(
  db: Db,
  need: Need,
  title: string,
  signalMessageId: number,
  now: Date,
): Promise<CompletionResult | null> {
  const task = await createQuickTask(db, { title, need }, signalMessageId);
  return task ? completeTask(db, task.id, now) : null; // null: это сообщение уже засчитано
}
