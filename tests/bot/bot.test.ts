import { describe, expect, it } from 'vitest';
import { createBot, NOT_ALLOWED } from '../../src/bot/bot.js';
import { countLocked } from '../../src/db/rewards.js';
import { testDb } from '../helpers/db.js';
import {
  ADMIN,
  BOT_CONFIG,
  STRANGER,
  USER,
  captureApi,
  methods,
  photoUpdate,
  textUpdate,
} from '../helpers/telegram.js';

const NOW = new Date('2026-12-27T09:00:00Z');

async function setup() {
  const db = await testDb();
  const bot = createBot({ config: BOT_CONFIG, db, clock: () => NOW, random: () => 0 });
  const calls = captureApi(bot);
  return { db, bot, calls };
}

describe('доступ', () => {
  it('чужому отвечает одной фразой и ничего не создаёт', async () => {
    const { db, bot, calls } = await setup();
    await bot.handleUpdate(textUpdate(STRANGER, 'купить корм'));
    expect(calls).toEqual([{ method: 'sendMessage', payload: expect.objectContaining({ text: NOT_ALLOWED }) }]);
    expect(await db.query('SELECT * FROM tasks')).toEqual([]);
  });
});

describe('/start', () => {
  it('знакомит и даёт inline-кнопку Mini App и кнопку меню', async () => {
    const { bot, calls } = await setup();
    await bot.handleUpdate(textUpdate(USER, '/start'));
    const send = calls.find((c) => c.method === 'sendMessage');
    expect(JSON.stringify(send?.payload.reply_markup)).toContain('https://app.example');
    expect(methods(calls)).toContain('setChatMenuButton');
  });
});

describe('задачи из чата', () => {
  it('текст создаёт черновик и спрашивает потребность четырьмя кнопками', async () => {
    const { db, bot, calls } = await setup();
    await bot.handleUpdate(textUpdate(USER, 'купить корм'));
    const [draft] = await db.query<{ id: number; title: string; need: string | null }>('SELECT id, title, need FROM tasks');
    expect(draft).toMatchObject({ title: 'купить корм', need: null });
    const markup = JSON.stringify(calls[0]?.payload.reply_markup);
    for (const need of ['food', 'walk', 'play', 'love']) expect(markup).toContain(`need:${draft!.id}:${need}`);
  });

  it('текст админа не создаёт задачу и не спрашивает потребность', async () => {
    const { db, bot, calls } = await setup();
    await bot.handleUpdate(textUpdate(ADMIN, 'купить корм'));
    expect(await db.query('SELECT * FROM tasks')).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('если ответ с кнопками не отправился, черновик удаляется', async () => {
    const { db, bot } = await setup();
    bot.api.config.use(async (prev, method, payload) => {
      if (method === 'sendMessage') throw new Error('network down');
      return prev(method, payload);
    });
    await expect(bot.handleUpdate(textUpdate(USER, 'купить корм'))).rejects.toThrow('network down');
    expect(await db.query('SELECT * FROM tasks')).toEqual([]);
  });

  it('повторная доставка того же update не создаёт дубль и не отвечает дважды', async () => {
    const { db, bot, calls } = await setup();
    const update = textUpdate(USER, 'купить корм');
    await bot.handleUpdate(update);
    await bot.handleUpdate(update);
    expect(await db.query('SELECT * FROM tasks')).toHaveLength(1);
    expect(methods(calls).filter((m) => m === 'sendMessage')).toHaveLength(1);
  });
});

describe('не личные чаты', () => {
  it('текст из группы игнорируется без ответа', async () => {
    const { db, bot, calls } = await setup();
    const update = textUpdate(USER, 'купить корм');
    await bot.handleUpdate({ ...update, message: { ...update.message!, chat: { id: -100, type: 'group', title: 'g' } } });
    expect(await db.query('SELECT * FROM tasks')).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('админ', () => {
  it('/note сохраняет записку, /left показывает остаток', async () => {
    const { db, bot, calls } = await setup();
    await bot.handleUpdate(textUpdate(ADMIN, '/note ты справляешься лучше, чем думаешь'));
    expect(await countLocked(db)).toEqual({ notes: 1, photos: 0 });
    await bot.handleUpdate(textUpdate(ADMIN, '/left'));
    expect(String(calls.at(-1)?.payload.text)).toContain('записок: 1');
  });

  it('фото с подписью от админа уходит в альбом (самый большой размер)', async () => {
    const { db, bot } = await setup();
    await bot.handleUpdate(photoUpdate(ADMIN, 'BIG_FILE', 'мы на море'));
    const [row] = await db.query<{ file_id: string; text: string }>('SELECT file_id, text FROM rewards');
    expect(row).toEqual({ file_id: 'BIG_FILE', text: 'мы на море' });
  });

  it('пользователь не может добавлять записки', async () => {
    const { db, bot } = await setup();
    await bot.handleUpdate(textUpdate(USER, '/note хак'));
    await bot.handleUpdate(photoUpdate(USER, 'FILE'));
    expect(await countLocked(db)).toEqual({ notes: 0, photos: 0 });
  });

  it('/note без текста подсказывает формат', async () => {
    const { db, bot, calls } = await setup();
    await bot.handleUpdate(textUpdate(ADMIN, '/note'));
    expect(await countLocked(db)).toEqual({ notes: 0, photos: 0 });
    expect(String(calls.at(-1)?.payload.text)).toContain('/note');
  });
});
