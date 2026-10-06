import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';

export const USER = 111;
export const ADMIN = 222;
export const STRANGER = 333;

export const BOT_CONFIG = {
  BOT_TOKEN: '123456:TEST_TOKEN_ABCDEFGHIJKLMNOP',
  BOT_INFO: JSON.stringify({
    id: 999,
    is_bot: true,
    first_name: 'Шантик',
    username: 'shantik_test_bot',
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  }),
  USER_ID: USER,
  ADMIN_ID: ADMIN,
  MINI_APP_URL: 'https://app.example',
};

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

/** Перехватывает все вызовы Bot API: сеть не используется. */
export function captureApi(bot: Bot): ApiCall[] {
  const calls: ApiCall[] = [];
  let messageId = 1000;
  bot.api.config.use(async (_prev, method, payload) => {
    const body = payload as Record<string, unknown>;
    calls.push({ method, payload: body });
    const result = method.startsWith('send')
      ? { message_id: ++messageId, date: 0, chat: { id: body.chat_id, type: 'private' } }
      : true;
    return { ok: true, result } as never;
  });
  return calls;
}

let nextUpdateId = 1;
const chatOf = (id: number) => ({ id, type: 'private' as const, first_name: 'Тест' });
const userOf = (id: number) => ({ id, is_bot: false, first_name: 'Тест' });

export function textUpdate(fromId: number, text: string, updateId = nextUpdateId++): Update {
  const entities = text.startsWith('/')
    ? [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0]!.length }]
    : undefined;
  return {
    update_id: updateId,
    message: { message_id: updateId, date: 0, chat: chatOf(fromId), from: userOf(fromId), text, entities },
  } as Update;
}

export function photoUpdate(fromId: number, fileId: string, caption?: string): Update {
  const updateId = nextUpdateId++;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: chatOf(fromId),
      from: userOf(fromId),
      caption,
      photo: [
        { file_id: `${fileId}_small`, file_unique_id: 's', width: 90, height: 90 },
        { file_id: fileId, file_unique_id: 'l', width: 1280, height: 1280 },
      ],
    },
  } as Update;
}

export function callbackUpdate(fromId: number, data: string, messageText = 'сообщение'): Update {
  const updateId = nextUpdateId++;
  return {
    update_id: updateId,
    callback_query: {
      id: `cq${updateId}`,
      from: userOf(fromId),
      chat_instance: 'ci',
      data,
      message: { message_id: 500, date: 0, chat: chatOf(fromId), text: messageText },
    },
  } as Update;
}

export const methods = (calls: ApiCall[]) => calls.map((c) => c.method);
