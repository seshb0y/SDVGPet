import type { Bot } from 'grammy';
import { NEEDS, type Need } from '../core/types.js';
import { answerOpenSignals } from '../db/outbox.js';
import { snoozeRoutine } from '../db/routines.js';
import { setTaskNeed } from '../db/tasks.js';
import { completeRoutine, completeTask, quickComplete, type CompletionResult } from '../services/completion.js';
import { NEED_LABEL, QUICK_ACTIONS, rewardMessages } from '../services/messages.js';
import type { BotDeps } from './bot.js';
import { sendTo } from './telegram.js';

export type CallbackAction =
  | { kind: 'need'; taskId: number; need: Need }
  | { kind: 'done'; taskId: number }
  | { kind: 'quick'; need: Need; index: number }
  | { kind: 'later' }
  | { kind: 'rdone'; routineId: number; date: string }
  | { kind: 'rsnooze'; routineId: number; date: string; minutes: 15 | 60 };

interface Outcome {
  toast: string;
  status: string;
  completion: CompletionResult | null;
}

const isNeed = (value: string | undefined): value is Need => NEEDS.includes(value as Need);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DONE: Outcome = { toast: 'Засчитано! 🐾', status: '✅ засчитано', completion: null };
const ALREADY: Outcome = { toast: 'Уже засчитано 🐾', status: '✅ засчитано', completion: null };

export function parseCallback(data: string): CallbackAction | null {
  const [kind, a, b, c] = data.split(':');
  const id = Number(a);
  if (kind === 'later' && a === undefined) return { kind: 'later' };
  if (kind === 'need' && Number.isInteger(id) && isNeed(b)) return { kind: 'need', taskId: id, need: b };
  if (kind === 'done' && Number.isInteger(id)) return { kind: 'done', taskId: id };
  if (kind === 'quick' && isNeed(a) && Number.isInteger(Number(b))) return { kind: 'quick', need: a, index: Number(b) };
  if (kind === 'rdone' && Number.isInteger(id) && b && DATE.test(b)) return { kind: 'rdone', routineId: id, date: b };
  if (kind === 'rsnooze' && Number.isInteger(id) && b && DATE.test(b) && (c === '15' || c === '60')) {
    return { kind: 'rsnooze', routineId: id, date: b, minutes: c === '15' ? 15 : 60 };
  }
  return null;
}

const completed = (result: CompletionResult | null): Outcome => (result ? { ...DONE, completion: result } : ALREADY);

async function perform(action: CallbackAction, deps: BotDeps, now: Date): Promise<Outcome> {
  const { db } = deps;
  switch (action.kind) {
    case 'need': {
      const task = await setTaskNeed(db, action.taskId, action.need);
      const status = `→ ${NEED_LABEL[action.need]}`;
      return { toast: task ? 'Записал ✅' : 'Задача не найдена', status, completion: null };
    }
    case 'done':
      return completed(await completeTask(db, action.taskId, now));
    case 'quick': {
      const title = QUICK_ACTIONS[action.need][action.index] ?? NEED_LABEL[action.need];
      return completed(await quickComplete(db, action.need, title, now));
    }
    case 'later':
      return { toast: 'Хорошо, позже 🐾', status: '⏰ позже', completion: null };
    case 'rdone':
      return completed(await completeRoutine(db, action.routineId, action.date, now));
    case 'rsnooze': {
      const until = new Date(now.getTime() + action.minutes * 60_000);
      const ok = await snoozeRoutine(db, action.routineId, action.date, until);
      const status = `⏰ напомню через ${action.minutes === 60 ? 'час' : '15 минут'}`;
      return ok ? { toast: 'Напомню ⏰', status, completion: null } : ALREADY;
    }
  }
}

export function registerCallbacks(bot: Bot, deps: BotDeps): void {
  bot.on('callback_query:data', async (ctx) => {
    const now = deps.clock();
    try {
      await answerOpenSignals(deps.db, now);
      const action = parseCallback(ctx.callbackQuery.data);
      if (!action) return void (await ctx.answerCallbackQuery({ text: 'Кнопка устарела 🐾' }));
      const outcome = await perform(action, deps, now);
      await ctx.answerCallbackQuery({ text: outcome.toast });
      const original = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(`${original}\n\n${outcome.status}`.trim());
      const chatId = ctx.chat?.id;
      for (const message of rewardMessages(outcome.completion?.rewards ?? [])) {
        if (chatId !== undefined) await sendTo(ctx.api, chatId, message);
      }
    } catch (error) {
      console.error('[bot] ошибка callback', error);
      await ctx.answerCallbackQuery({ text: 'Ой, что-то пошло не так 🐾' }).catch(() => undefined);
    }
  });
}
