import { type Api, InlineKeyboard } from 'grammy';
import type { Button, OutgoingMessage, Sender } from '../services/messages.js';

export function toInlineKeyboard(rows: Button[][]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  rows.forEach((row, index) => {
    if (index > 0) keyboard.row();
    for (const button of row) {
      if ('webApp' in button) keyboard.webApp(button.text, button.webApp);
      else keyboard.text(button.text, button.data);
    }
  });
  return keyboard;
}

export async function sendTo(api: Api, chatId: number, message: OutgoingMessage): Promise<void> {
  const options = {
    reply_markup: message.buttons ? toInlineKeyboard(message.buttons) : undefined,
    disable_notification: message.silent,
  };
  if (message.photo) await api.sendPhoto(chatId, message.photo, { caption: message.text, ...options });
  else await api.sendMessage(chatId, message.text, options);
}

export function telegramSender(api: Api, chatId: number): Sender {
  return (message) => sendTo(api, chatId, message);
}
