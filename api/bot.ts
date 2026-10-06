import { webhookCallback } from 'grammy';
import { createBot } from '../src/bot/bot.js';
import { loadConfig } from '../src/config.js';
import { neonDb } from '../src/db/client.js';

const config = loadConfig(process.env);
const bot = createBot({ config, db: neonDb(config.DATABASE_URL), clock: () => new Date(), random: Math.random });
const handle = webhookCallback(bot, 'std/http', { secretToken: config.WEBHOOK_SECRET, onTimeout: 'return' });

// Webhook всегда отвечает 200: иначе Telegram будет бесконечно повторять update.
export async function POST(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (error) {
    console.error('[bot] ошибка обработки update', error);
    return new Response('ok', { status: 200 });
  }
}
