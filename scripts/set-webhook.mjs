// Регистрирует webhook и печатает BOT_INFO. Запуск: npm run bot:webhook (нужны BOT_TOKEN, WEBHOOK_SECRET, BASE_URL)
const { BOT_TOKEN, WEBHOOK_SECRET, BASE_URL } = process.env;
if (!BOT_TOKEN || !WEBHOOK_SECRET || !BASE_URL) throw new Error('Нужны BOT_TOKEN, WEBHOOK_SECRET и BASE_URL');

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

await call('setWebhook', {
  url: `${BASE_URL.replace(/\/$/, '')}/api/bot`,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});
console.log('Webhook установлен');
console.log(`BOT_INFO=${JSON.stringify(await call('getMe'))}`);
