import { Api } from 'grammy';
import { handleTick } from '../src/api/tick.js';
import { telegramSender } from '../src/bot/telegram.js';
import { loadConfig } from '../src/config.js';
import { neonDb } from '../src/db/client.js';
import { runTick } from '../src/services/tick.js';

const config = loadConfig(process.env);
const db = neonDb(config.DATABASE_URL);
const send = telegramSender(new Api(config.BOT_TOKEN), config.USER_ID);

async function run() {
  try {
    return await runTick({ db, send, now: new Date(), random: Math.random, miniAppUrl: config.MINI_APP_URL });
  } catch (error) {
    console.error('[tick] ошибка', error);
    throw error;
  }
}

export function GET(req: Request): Promise<Response> {
  return handleTick(req, { secret: config.TICK_SECRET, run });
}

export const POST = GET;
