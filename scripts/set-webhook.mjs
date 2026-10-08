// Регистрирует webhook, команды админа и печатает BOT_INFO.
// Запуск: npm run bot:webhook (нужны BOT_TOKEN, WEBHOOK_SECRET, BASE_URL, ADMIN_ID)
const { BOT_TOKEN, WEBHOOK_SECRET, BASE_URL, ADMIN_ID } = process.env;
if (!BOT_TOKEN || !WEBHOOK_SECRET || !BASE_URL || !ADMIN_ID) {
  throw new Error('Нужны BOT_TOKEN, WEBHOOK_SECRET, BASE_URL и ADMIN_ID');
}

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

// Список команд видит только админ: пользователю они не нужны
await call('setMyCommands', {
  scope: { type: 'chat', chat_id: Number(ADMIN_ID) },
  commands: [
    { command: 'note', description: 'Спрятать записку: /note текст' },
    { command: 'left', description: 'Сколько записок и фото не открыто' },
    { command: 'help', description: 'Как спрятать записку или фото' },
  ],
});
console.log('Команды админа установлены');
console.log(`BOT_INFO=${JSON.stringify(await call('getMe'))}`);
