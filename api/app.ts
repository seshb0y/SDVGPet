import { Api } from 'grammy';
import { handleRpc } from '../src/api/rpc.js';
import { sendTo } from '../src/bot/telegram.js';
import { loadConfig } from '../src/config.js';
import { neonDb } from '../src/db/client.js';

const config = loadConfig(process.env);
const db = neonDb(config.DATABASE_URL);
const api = new Api(config.BOT_TOKEN);

async function fetchPhoto(fileId: string): Promise<Response> {
  const file = await api.getFile(fileId);
  const upstream = await fetch(`https://api.telegram.org/file/bot${config.BOT_TOKEN}/${file.file_path}`);
  if (!upstream.ok) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  return new Response(upstream.body, {
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': 'private, max-age=86400',
    },
  });
}

export function POST(req: Request): Promise<Response> {
  return handleRpc(req, {
    db,
    botToken: config.BOT_TOKEN,
    allowedUserIds: [config.USER_ID, config.ADMIN_ID],
    now: new Date(),
    notify: async (chatId, messages) => {
      for (const message of messages) await sendTo(api, chatId, message);
    },
    fetchPhoto,
  });
}
