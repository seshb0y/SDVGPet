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

const NUM = /^\d{1,9}$/;
const parseId = (v: string | undefined): number | null => (v !== undefined && NUM.test(v) && Number(v) > 0 ? Number(v) : null);

function isRealDate(value: string | undefined): value is string {
  if (value === undefined || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseCallback(data: string): CallbackAction | null {
  const parts = data.split(':');
  const [kind, a, b, c] = parts;
  const id = parseId(a);
  if (kind === 'later' && parts.length === 1) return { kind: 'later' };
  if (kind === 'need' && parts.length === 3 && id !== null && isNeed(b)) return { kind: 'need', taskId: id, need: b };
  if (kind === 'done' && parts.length === 2 && id !== null) return { kind: 'done', taskId: id };
  if (kind === 'quick' && parts.length === 3 && isNeed(a) && b !== undefined && NUM.test(b) && Number(b) < QUICK_ACTIONS[a].length) {
    return { kind: 'quick', need: a, index: Number(b) };
  }
  if (kind === 'rdone' && parts.length === 3 && id !== null && isRealDate(b)) return { kind: 'rdone', routineId: id, date: b };
  if (kind === 'rsnooze' && parts.length === 4 && id !== null && isRealDate(b) && (c === '15' || c === '60')) {
    return { kind: 'rsnooze', routineId: id, date: b, minutes: c === '15' ? 15 : 60 };
  }
  return null;
}

const completed = (result: CompletionResult | null): Outcome => (result ? { ...DONE, completion: result } : ALREADY);

async function perform(action: CallbackAction, deps: BotDeps, now: Date, messageId: number): Promise<Outcome> {
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
      return completed(await quickComplete(db, action.need, title, messageId, now));
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
      await answerOpenSignals(deps.db, now); // любое нажатие — активность, даже на устаревшей кнопке
      const action = parseCallback(ctx.callbackQuery.data);
      if (!action) return void (await ctx.answerCallbackQuery({ text: 'Кнопка устарела 🐾' }));
      const outcome = await perform(action, deps, now, ctx.callbackQuery.message?.message_id ?? 0);
      const chatId = ctx.chat?.id;
      // награды раньше ответа и правки: сбой edit не должен их потерять
      for (const message of rewardMessages(outcome.completion?.rewards ?? [])) {
        if (chatId !== undefined) await sendTo(ctx.api, chatId, message);
      }
      await ctx.answerCallbackQuery({ text: outcome.toast });
      const original = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(`${original}\n\n${outcome.status}`.trim());
    } catch (error) {
      console.error('[bot] ошибка callback', error);
      await ctx.answerCallbackQuery({ text: 'Ой, что-то пошло не так 🐾' }).catch(() => undefined);
    }
  });
}
