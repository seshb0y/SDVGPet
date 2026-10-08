import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Config } from '../config.js';
import { NEEDS } from '../core/types.js';
import type { Db } from '../db/client.js';
import { addNote, addPhoto, countLocked } from '../db/rewards.js';
import { createDraft, deleteTask } from '../db/tasks.js';
import { NEED_LABEL } from '../services/messages.js';
import { registerCallbacks } from './callbacks.js';
import { toInlineKeyboard } from './telegram.js';

export interface BotDeps {
  config: Pick<Config, 'BOT_TOKEN' | 'BOT_INFO' | 'USER_ID' | 'ADMIN_ID' | 'MINI_APP_URL'>;
  db: Db;
  clock: () => Date;
  random: () => number;
}

export const NOT_ALLOWED = 'Это личный бот 🐾';
const INTRO =
  'Гав! Я Шантик 🐾 Буду помогать с делами — а ты будешь заботиться обо мне.\n' +
  'Пиши мне любые дела прямо сюда, а всё остальное — тут 👇';
const MAX_TITLE = 200;
const ADMIN_HELP =
  'Что можно спрятать для неё:\n' +
  '💌 /note текст — записка\n' +
  '📷 фото (можно с подписью) — в альбом, просто пришли картинку\n' +
  '📊 /left — сколько записок и фото ещё не открыто';

function registerAdmin(bot: Bot, deps: BotDeps): void {
  const admin = bot.filter((ctx) => ctx.from?.id === deps.config.ADMIN_ID);
  admin.command('note', async (ctx) => {
    const text = ctx.match.trim();
    if (!text) return void (await ctx.reply('Напиши так: /note текст записки'));
    await addNote(deps.db, text);
    const left = await countLocked(deps.db);
    await ctx.reply(`Записка сохранена 💌 Неоткрытых записок: ${left.notes}`);
  });
  admin.command('help', (ctx) => ctx.reply(ADMIN_HELP));
  admin.command('left', async (ctx) => {
    const left = await countLocked(deps.db);
    await ctx.reply(`Осталось неоткрытых — записок: ${left.notes}, фото: ${left.photos}`);
  });
  admin.on('message:photo', async (ctx) => {
    const largest = ctx.message.photo.at(-1);
    if (!largest) return;
    await addPhoto(deps.db, largest.file_id, ctx.message.caption ?? null);
    const left = await countLocked(deps.db);
    await ctx.reply(`Фото в альбоме 📷 Неоткрытых фото: ${left.photos}`);
  });
}

function registerTasks(bot: Bot, deps: BotDeps): void {
  bot.filter((ctx) => ctx.from?.id === deps.config.USER_ID).on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;
    const title = Array.from(text).slice(0, MAX_TITLE).join('');
    const draft = await createDraft(deps.db, title, ctx.message.message_id);
    if (!draft) return; // повторная доставка того же update
    const buttons = NEEDS.map((need) => ({ text: NEED_LABEL[need], data: `need:${draft.id}:${need}` }));
    try {
      await ctx.reply(`Записал: «${title}» ✍️ Куда засчитаем?`, {
        reply_markup: toInlineKeyboard([buttons.slice(0, 2), buttons.slice(2)]),
      });
    } catch (error) {
      await deleteTask(deps.db, draft.id);
      throw error;
    }
  });
}

export function createBot(deps: BotDeps): Bot {
  const { config } = deps;
  const bot = new Bot(config.BOT_TOKEN, { botInfo: JSON.parse(config.BOT_INFO) as UserFromGetMe });
  const allowed = new Set([config.USER_ID, config.ADMIN_ID]);

  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    if (ctx.from && allowed.has(ctx.from.id)) return next();
    if (ctx.message) await ctx.reply(NOT_ALLOWED);
    else if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(INTRO, {
      reply_markup: toInlineKeyboard([[{ text: '🐶 Открыть Шантика', webApp: config.MINI_APP_URL }]]),
    });
    // админу (если это не сам пользователь) кнопка меню показывает команды: записки, фото, остаток
    const adminOnly = ctx.from?.id === config.ADMIN_ID && config.ADMIN_ID !== config.USER_ID;
    await ctx.api.setChatMenuButton({
      chat_id: ctx.chat.id,
      menu_button: adminOnly
        ? { type: 'commands' }
        : { type: 'web_app', text: 'Шантик', web_app: { url: config.MINI_APP_URL } },
    });
  });

  registerAdmin(bot, deps);
  registerCallbacks(bot, deps);
  registerTasks(bot, deps);
  bot.catch((err) => console.error('[bot] ошибка обработки update', err.error));
  return bot;
}
