# Шантик — план 2: сервер (БД, сервисы, tick, бот, API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Серверная оболочка вокруг `src/core`: Postgres-хранилище, сервисы выполнения задач, планировщик-tick, Telegram-бот и RPC-API для Mini App — всё протестировано локально без сети.

**Architecture:** Imperative shell. `src/db/*` — тонкие SQL-репозитории над интерфейсом `Db { query(text, params) }` (в проде Neon HTTP, в тестах PGlite in-memory). `src/services/*` — сценарии «прочитать → core → записать», без grammY; исходящие сообщения уходят через интерфейс `Sender`. `src/bot/*` — grammY-обработчики. `src/api/*` — проверка `initData` и RPC. `api/*.ts` — тонкие Vercel-функции. Это план 2 из 4 (core → сервер → Mini App → деплой).

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Node 24, grammY 1, @neondatabase/serverless 1, zod 4, vitest, @electric-sql/pglite (только тесты).

**Spec:** `docs/superpowers/specs/2026-10-05-shantik-design.md` (разделы 4, 5, 8 — обязательны)

## Global Constraints

- `src/core/` не меняется (кроме случая, когда задача явно говорит иначе).
- Направление зависимостей: `api/` → `src/api`, `src/bot` → `src/services` → `src/db`, `src/core`. `src/db` и `src/services` не импортируют `grammy`. `src/core` ничего не импортирует извне.
- Время и случайность в сервисы/бот передаются параметрами (`now: Date`, `random: () => number`); `new Date()` / `Math.random()` только в `api/*.ts`.
- Тесты не ходят в сеть: БД — PGlite, Telegram — перехват `bot.api.config.use`, `fetch` — подменяемая зависимость.
- Входные данные проверяются на границе через zod (RPC, env, настройки).
- Тихие часы при сохранении: начало ∈ [20:00..00:00] (т.е. 20:00–23:59 или 00:00), конец ∈ [05:00..12:00]; часовой пояс проверяется `Intl.DateTimeFormat`.
- Бот отвечает только `USER_ID` и `ADMIN_ID`; остальным — ровно «Это личный бот 🐾».
- На каждый callback — `answerCallbackQuery`; исходное сообщение редактируется (кнопки убираются).
- Любое нажатие кнопки или выполнение задачи отмечает все открытые сигналы (`need`/`followup`) отвеченными.
- Сигналы потребностей без снуза: «⏰ Позже» только отмечает сигнал отвеченным. Снуз рутины — только варианты, для которых `snoozeFits` = true (15 и 60 минут).
- Утро и вечер — `disable_notification: true`.
- Шкалы хранятся как `real`; наружу (API, тексты) — `Math.floor`.
- Секреты только из env; в git — только `.env.example`.
- Тексты для пользователя на русском. Файлы до ~200 строк, функции до ~40 строк.

## Review Focus

- **Telegram повторно присылает тот же update** (webhook не получил 200 вовремя): задача не дублируется — unique `source_message_id`. Тест в Task 7.
- **Двойное нажатие «✅ Сделала»**: задача засчитывается один раз, шкала растёт один раз. Тест в Task 4.
- **Два tick подряд с тем же временем** (cron повторил запрос): второе не отправляет ничего. Тест в Task 6.
- **Telegram не принял сообщение**: захват снимается, следующий tick повторяет. Тест в Task 6.
- **Поддельная или протухшая `initData`**, чужой `user.id`: RPC отвечает 401 и ничего не меняет. Тест в Task 9.

## File Structure

```
db/schema.sql                 схема + две singleton-строки (settings, pet)
src/config.ts                 loadConfig(env) — zod
src/db/client.ts              интерфейс Db + neonDb(url)
src/db/state.ts               settings, pet
src/db/tasks.ts               задачи и черновики
src/db/routines.ts            рутины и routine_log
src/db/outbox.ts              outbox_log: захват, повторы, ответы
src/db/rewards.ts             записки и фото
src/services/settings.ts      SettingsInput zod-схема + валидация пояса/тихих часов
src/services/completion.ts    completeTask, completeRoutine, quickComplete
src/services/messages.ts      типы OutgoingMessage/Button/Sender + фразы и сборка сообщений
src/services/tick.ts          runTick
src/bot/bot.ts                createBot — фильтр доступа, /start, текст, админ-команды
src/bot/callbacks.ts          обработка callback-кнопок
src/bot/telegram.ts           toInlineKeyboard, telegramSender, deliverRewards
src/api/initData.ts           verifyInitData
src/api/rpc.ts                handleRpc — операции Mini App
src/api/tick.ts               handleTick — проверка секрета + runTick
api/bot.ts, api/tick.ts, api/app.ts   Vercel-функции
scripts/migrate.mjs, scripts/set-webhook.mjs
vercel.json, .env.example
tests/helpers/db.ts           testDb() на PGlite
tests/helpers/telegram.ts     перехват вызовов Bot API
```

---

### Task 1: Зависимости, конфиг, схема БД, клиент и тестовая БД

**Files:**
- Modify: `package.json` (зависимости)
- Create: `db/schema.sql`, `src/config.ts`, `src/db/client.ts`, `tests/helpers/db.ts`, `.env.example`
- Test: `tests/config.test.ts`, `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `interface Config { BOT_TOKEN: string; BOT_INFO: string; DATABASE_URL: string; WEBHOOK_SECRET: string; TICK_SECRET: string; USER_ID: number; ADMIN_ID: number; MINI_APP_URL: string }`
  - `loadConfig(env: Record<string, string | undefined>): Config` — бросает `ZodError` при ошибке
  - `interface Db { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> }`
  - `neonDb(url: string): Db`
  - `testDb(): Promise<Db>` (tests/helpers/db.ts) — свежая PGlite-база с применённой схемой

- [ ] **Step 1: Поставить зависимости**

```bash
npm i grammy@^1 @neondatabase/serverless@^1 zod@^4
npm i -D @electric-sql/pglite
```

- [ ] **Step 2: Схема — `db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  quiet_start text NOT NULL DEFAULT '23:00',
  quiet_end text NOT NULL DEFAULT '09:00'
);

CREATE TABLE IF NOT EXISTS pet (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  food real NOT NULL DEFAULT 100,
  walk real NOT NULL DEFAULT 100,
  play real NOT NULL DEFAULT 100,
  love real NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at timestamptz,
  completed_total int NOT NULL DEFAULT 0,
  last_note_date text
);

INSERT INTO settings DEFAULT VALUES ON CONFLICT DO NOTHING;
INSERT INTO pet DEFAULT VALUES ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  need text CHECK (need IN ('food', 'walk', 'play', 'love')),
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_message_id bigint UNIQUE
);

CREATE TABLE IF NOT EXISTS routines (
  id serial PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  need text NOT NULL CHECK (need IN ('food', 'walk', 'play', 'love')),
  time text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days int NOT NULL CHECK (days BETWEEN 1 AND 127),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS routine_log (
  routine_id int NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
  date text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  snoozed_until timestamptz,
  PRIMARY KEY (routine_id, date)
);

CREATE TABLE IF NOT EXISTS outbox_log (
  id serial PRIMARY KEY,
  dedup_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('need', 'followup', 'morning', 'evening')),
  need text,
  local_date text NOT NULL,
  sent_at timestamptz NOT NULL,
  answered_at timestamptz,
  followed_up boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS rewards (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('note', 'photo')),
  text text,
  file_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  unlocked_at timestamptz
);
```

- [ ] **Step 3: Тестовая БД — `tests/helpers/db.ts`**

```ts
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../../src/db/client.js';

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8');

export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}
```

- [ ] **Step 4: Написать падающие тесты**

`tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const VALID = {
  BOT_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  BOT_INFO: '{"id":1,"is_bot":true,"first_name":"Шантик","username":"shantik_bot"}',
  DATABASE_URL: 'postgres://u:p@host/db',
  WEBHOOK_SECRET: 'webhook_secret_123456',
  TICK_SECRET: 'tick_secret_1234567890',
  USER_ID: '111',
  ADMIN_ID: '222',
  MINI_APP_URL: 'https://shantik.vercel.app',
};

describe('loadConfig', () => {
  it('читает корректное окружение и приводит id к числам', () => {
    const config = loadConfig(VALID);
    expect(config.USER_ID).toBe(111);
    expect(config.ADMIN_ID).toBe(222);
  });

  it('падает без обязательной переменной', () => {
    const { BOT_TOKEN: _omit, ...rest } = VALID;
    expect(() => loadConfig(rest)).toThrow();
  });

  it('падает на webhook-секрете с недопустимыми символами', () => {
    expect(() => loadConfig({ ...VALID, WEBHOOK_SECRET: 'bad secret!' })).toThrow();
  });
});
```

`tests/db/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db.js';

describe('schema', () => {
  it('создаёт singleton-строки settings и pet с умолчаниями', async () => {
    const db = await testDb();
    const [settings] = await db.query<{ timezone: string; quiet_start: string }>('SELECT * FROM settings');
    const [pet] = await db.query<{ food: number; completed_total: number }>('SELECT * FROM pet');
    expect(settings).toMatchObject({ timezone: 'Europe/Moscow', quiet_start: '23:00' });
    expect(pet).toMatchObject({ food: 100, completed_total: 0 });
  });

  it('не даёт создать вторую строку settings', async () => {
    const db = await testDb();
    await expect(db.query('INSERT INTO settings (id) VALUES (2)')).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Запустить — должны упасть**

Run: `npx vitest run tests/config.test.ts tests/db/schema.test.ts`
Expected: FAIL — нет `src/config.js` и `src/db/client.js`.

- [ ] **Step 6: Реализация**

`src/config.ts`:

```ts
import { z } from 'zod';

const ConfigSchema = z.object({
  BOT_TOKEN: z.string().min(20),
  /** JSON-ответ getMe — чтобы grammY не вызывал getMe на каждом холодном старте. */
  BOT_INFO: z.string().min(2),
  DATABASE_URL: z.string().min(1),
  WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/),
  TICK_SECRET: z.string().min(16),
  USER_ID: z.coerce.number().int().positive(),
  ADMIN_ID: z.coerce.number().int().positive(),
  MINI_APP_URL: z.url(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  return ConfigSchema.parse(env);
}
```

`src/db/client.ts`:

```ts
import { neon } from '@neondatabase/serverless';

/** Минимальный интерфейс БД: прод — Neon HTTP, тесты — PGlite. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
  };
}
```

`.env.example`:

```
BOT_TOKEN=
BOT_INFO=
DATABASE_URL=
WEBHOOK_SECRET=
TICK_SECRET=
USER_ID=
ADMIN_ID=
MINI_APP_URL=
```

- [ ] **Step 7: Запустить тесты и типы**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (включая 68 тестов core), 0 ошибок типов.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json db/schema.sql src/config.ts src/db/client.ts tests/helpers/db.ts tests/config.test.ts tests/db/schema.test.ts .env.example
git commit -m "feat(server): config, db schema, db client and pglite test db"
```

---

### Task 2: Репозитории — состояние (settings, pet) и задачи

**Files:**
- Create: `src/db/state.ts`, `src/db/tasks.ts`
- Test: `tests/db/state.test.ts`, `tests/db/tasks.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 1); `Need`, `Needs`, `Settings` (src/core/types.ts)
- Produces:
  - `interface PetRecord { needs: Needs; updatedAt: Date; lastCompletedAt: Date | null; completedTotal: number; lastNoteDate: string | null }`
  - `getSettings(db: Db): Promise<Settings>`, `saveSettings(db: Db, settings: Settings): Promise<void>`
  - `getPet(db: Db): Promise<PetRecord>`, `savePet(db: Db, pet: PetRecord): Promise<void>`
  - `interface Task { id: number; title: string; need: Need | null; dueAt: Date | null; doneAt: Date | null; createdAt: Date }`
  - `createDraft(db, title: string, sourceMessageId: number): Promise<Task | null>` — `null`, если черновик с этим `source_message_id` уже есть (повтор update)
  - `createTask(db, input: { title: string; need: Need; dueAt: Date | null }): Promise<Task>`
  - `getTask(db, id: number): Promise<Task | null>`
  - `setTaskNeed(db, id: number, need: Need): Promise<Task | null>`
  - `updateTask(db, id: number, patch: { title?: string; need?: Need; dueAt?: Date | null }): Promise<Task | null>`
  - `deleteTask(db, id: number): Promise<boolean>`
  - `markTaskDone(db, id: number, now: Date): Promise<Task | null>` — атомарно: только если `done_at IS NULL` и `need IS NOT NULL`
  - `listOpenTasks(db): Promise<Task[]>` — с потребностью, невыполненные; по `due_at` (NULL в конце), затем `created_at`
  - `listTasksSince(db, since: Date): Promise<Task[]>` — с потребностью: открытые + выполненные с `since`
  - `listDoneSince(db, since: Date): Promise<Task[]>` — выполненные с `since`

- [ ] **Step 1: Написать падающие тесты**

`tests/db/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getPet, getSettings, savePet, saveSettings } from '../../src/db/state.js';
import { testDb } from '../helpers/db.js';

describe('state repo', () => {
  it('читает настройки по умолчанию и сохраняет новые', async () => {
    const db = await testDb();
    expect(await getSettings(db)).toEqual({ timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } });
    await saveSettings(db, { timezone: 'Asia/Yekaterinburg', quiet: { start: '22:30', end: '08:00' } });
    expect(await getSettings(db)).toEqual({ timezone: 'Asia/Yekaterinburg', quiet: { start: '22:30', end: '08:00' } });
  });

  it('сохраняет и читает питомца, включая дробные шкалы', async () => {
    const db = await testDb();
    const pet = {
      needs: { food: 42.5, walk: 60, play: 70.25, love: 10 },
      updatedAt: new Date('2026-12-27T10:00:00Z'),
      lastCompletedAt: new Date('2026-12-27T09:00:00Z'),
      completedTotal: 7,
      lastNoteDate: '2026-12-26',
    };
    await savePet(db, pet);
    expect(await getPet(db)).toEqual(pet);
  });
});
```

`tests/db/tasks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createDraft,
  createTask,
  deleteTask,
  getTask,
  listDoneSince,
  listOpenTasks,
  listTasksSince,
  markTaskDone,
  setTaskNeed,
  updateTask,
} from '../../src/db/tasks.js';
import { testDb } from '../helpers/db.js';

const NOW = new Date('2026-12-27T10:00:00Z');

describe('tasks repo', () => {
  it('черновик из чата создаётся один раз на message_id', async () => {
    const db = await testDb();
    const first = await createDraft(db, 'купить корм', 555);
    const repeat = await createDraft(db, 'купить корм', 555);
    expect(first).toMatchObject({ title: 'купить корм', need: null });
    expect(repeat).toBeNull();
  });

  it('черновик без потребности не попадает в списки, после выбора — попадает', async () => {
    const db = await testDb();
    const draft = await createDraft(db, 'купить корм', 1);
    expect(await listOpenTasks(db)).toEqual([]);
    await setTaskNeed(db, draft!.id, 'walk');
    expect((await listOpenTasks(db)).map((t) => t.title)).toEqual(['купить корм']);
  });

  it('выполнение засчитывается один раз', async () => {
    const db = await testDb();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    expect(await markTaskDone(db, task.id, NOW)).toMatchObject({ id: task.id, doneAt: NOW });
    expect(await markTaskDone(db, task.id, NOW)).toBeNull();
  });

  it('черновик без потребности выполнить нельзя', async () => {
    const db = await testDb();
    const draft = await createDraft(db, 'что-то', 2);
    expect(await markTaskDone(db, draft!.id, NOW)).toBeNull();
  });

  it('обновляет поля частично и умеет сбросить срок', async () => {
    const db = await testDb();
    const task = await createTask(db, { title: 'врач', need: 'play', dueAt: NOW });
    expect(await updateTask(db, task.id, { title: 'записаться к врачу' })).toMatchObject({
      title: 'записаться к врачу',
      need: 'play',
      dueAt: NOW,
    });
    expect(await updateTask(db, task.id, { dueAt: null })).toMatchObject({ dueAt: null });
    expect(await updateTask(db, 999, { title: 'нет' })).toBeNull();
  });

  it('удаляет задачу', async () => {
    const db = await testDb();
    const task = await createTask(db, { title: 'x', need: 'love', dueAt: null });
    expect(await deleteTask(db, task.id)).toBe(true);
    expect(await getTask(db, task.id)).toBeNull();
    expect(await deleteTask(db, task.id)).toBe(false);
  });

  it('открытые задачи упорядочены по сроку, без срока — в конце', async () => {
    const db = await testDb();
    await createTask(db, { title: 'без срока', need: 'food', dueAt: null });
    await createTask(db, { title: 'позже', need: 'food', dueAt: new Date('2026-12-27T15:00:00Z') });
    await createTask(db, { title: 'раньше', need: 'food', dueAt: new Date('2026-12-27T11:00:00Z') });
    expect((await listOpenTasks(db)).map((t) => t.title)).toEqual(['раньше', 'позже', 'без срока']);
  });

  it('listTasksSince — открытые и выполненные после границы; listDoneSince — только выполненные', async () => {
    const db = await testDb();
    const old = await createTask(db, { title: 'старая', need: 'food', dueAt: null });
    const fresh = await createTask(db, { title: 'свежая', need: 'food', dueAt: null });
    await createTask(db, { title: 'открытая', need: 'food', dueAt: null });
    await markTaskDone(db, old.id, new Date('2026-12-26T10:00:00Z'));
    await markTaskDone(db, fresh.id, NOW);
    const since = new Date('2026-12-27T00:00:00Z');
    expect((await listTasksSince(db, since)).map((t) => t.title).sort()).toEqual(['открытая', 'свежая']);
    expect((await listDoneSince(db, since)).map((t) => t.title)).toEqual(['свежая']);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/db/state.test.ts tests/db/tasks.test.ts`
Expected: FAIL — модулей `state.js` / `tasks.js` нет.

- [ ] **Step 3: Реализация — `src/db/state.ts`**

```ts
import type { Needs, Settings } from '../core/types.js';
import type { Db } from './client.js';

export interface PetRecord {
  needs: Needs;
  updatedAt: Date;
  lastCompletedAt: Date | null;
  completedTotal: number;
  lastNoteDate: string | null;
}

interface SettingsRow {
  timezone: string;
  quiet_start: string;
  quiet_end: string;
}

interface PetRow {
  food: number;
  walk: number;
  play: number;
  love: number;
  updated_at: Date;
  last_completed_at: Date | null;
  completed_total: number;
  last_note_date: string | null;
}

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.query<SettingsRow>('SELECT timezone, quiet_start, quiet_end FROM settings WHERE id = 1');
  if (!row) throw new Error('Нет строки settings — схема не применена');
  return { timezone: row.timezone, quiet: { start: row.quiet_start, end: row.quiet_end } };
}

export async function saveSettings(db: Db, settings: Settings): Promise<void> {
  await db.query('UPDATE settings SET timezone = $1, quiet_start = $2, quiet_end = $3 WHERE id = 1', [
    settings.timezone,
    settings.quiet.start,
    settings.quiet.end,
  ]);
}

export async function getPet(db: Db): Promise<PetRecord> {
  const [row] = await db.query<PetRow>('SELECT * FROM pet WHERE id = 1');
  if (!row) throw new Error('Нет строки pet — схема не применена');
  return {
    needs: { food: row.food, walk: row.walk, play: row.play, love: row.love },
    updatedAt: new Date(row.updated_at),
    lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at) : null,
    completedTotal: row.completed_total,
    lastNoteDate: row.last_note_date,
  };
}

export async function savePet(db: Db, pet: PetRecord): Promise<void> {
  await db.query(
    `UPDATE pet SET food = $1, walk = $2, play = $3, love = $4, updated_at = $5,
       last_completed_at = $6, completed_total = $7, last_note_date = $8 WHERE id = 1`,
    [
      pet.needs.food,
      pet.needs.walk,
      pet.needs.play,
      pet.needs.love,
      pet.updatedAt,
      pet.lastCompletedAt,
      pet.completedTotal,
      pet.lastNoteDate,
    ],
  );
}
```

- [ ] **Step 4: Реализация — `src/db/tasks.ts`**

```ts
import type { Need } from '../core/types.js';
import type { Db } from './client.js';

export interface Task {
  id: number;
  title: string;
  need: Need | null;
  dueAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
}

interface TaskRow {
  id: number;
  title: string;
  need: Need | null;
  due_at: Date | null;
  done_at: Date | null;
  created_at: Date;
}

const COLUMNS = 'id, title, need, due_at, done_at, created_at';
const ORDER_OPEN = 'ORDER BY due_at ASC NULLS LAST, created_at ASC, id ASC';

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    need: row.need,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    createdAt: new Date(row.created_at),
  };
}

async function one(db: Db, text: string, params: unknown[]): Promise<Task | null> {
  const [row] = await db.query<TaskRow>(text, params);
  return row ? toTask(row) : null;
}

export function createDraft(db: Db, title: string, sourceMessageId: number): Promise<Task | null> {
  return one(
    db,
    `INSERT INTO tasks (title, source_message_id) VALUES ($1, $2)
     ON CONFLICT (source_message_id) DO NOTHING RETURNING ${COLUMNS}`,
    [title, sourceMessageId],
  );
}

export async function createTask(db: Db, input: { title: string; need: Need; dueAt: Date | null }): Promise<Task> {
  const task = await one(db, `INSERT INTO tasks (title, need, due_at) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [
    input.title,
    input.need,
    input.dueAt,
  ]);
  if (!task) throw new Error('INSERT tasks не вернул строку');
  return task;
}

export function getTask(db: Db, id: number): Promise<Task | null> {
  return one(db, `SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
}

export function setTaskNeed(db: Db, id: number, need: Need): Promise<Task | null> {
  return one(db, `UPDATE tasks SET need = $2 WHERE id = $1 RETURNING ${COLUMNS}`, [id, need]);
}

export async function updateTask(
  db: Db,
  id: number,
  patch: { title?: string; need?: Need; dueAt?: Date | null },
): Promise<Task | null> {
  const current = await getTask(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  return one(db, `UPDATE tasks SET title = $2, need = $3, due_at = $4 WHERE id = $1 RETURNING ${COLUMNS}`, [
    id,
    next.title,
    next.need,
    next.dueAt,
  ]);
}

export async function deleteTask(db: Db, id: number): Promise<boolean> {
  const rows = await db.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

export function markTaskDone(db: Db, id: number, now: Date): Promise<Task | null> {
  return one(
    db,
    `UPDATE tasks SET done_at = $2 WHERE id = $1 AND done_at IS NULL AND need IS NOT NULL RETURNING ${COLUMNS}`,
    [id, now],
  );
}

export async function listOpenTasks(db: Db): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks WHERE need IS NOT NULL AND done_at IS NULL ${ORDER_OPEN}`,
  );
  return rows.map(toTask);
}

export async function listTasksSince(db: Db, since: Date): Promise<Task[]> {
  const rows = await db.query<TaskRow>(
    `SELECT ${COLUMNS} FROM tasks WHERE need IS NOT NULL AND (done_at IS NULL OR done_at >= $1)
     ORDER BY done_at ASC NULLS FIRST, due_at ASC NULLS LAST, created_at ASC, id ASC`,
    [since],
  );
  return rows.map(toTask);
}

export async function listDoneSince(db: Db, since: Date): Promise<Task[]> {
  const rows = await db.query<TaskRow>(`SELECT ${COLUMNS} FROM tasks WHERE done_at >= $1 ORDER BY done_at`, [since]);
  return rows.map(toTask);
}
```

- [ ] **Step 5: Запустить тесты и типы**

Run: `npx vitest run tests/db && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/state.ts src/db/tasks.ts tests/db/state.test.ts tests/db/tasks.test.ts
git commit -m "feat(db): settings, pet and tasks repositories"
```

---

### Task 3: Репозитории — рутины, лог сообщений, награды

**Files:**
- Create: `src/db/routines.ts`, `src/db/outbox.ts`, `src/db/rewards.ts`
- Test: `tests/db/routines.test.ts`, `tests/db/outbox.test.ts`, `tests/db/rewards.test.ts`

**Interfaces:**
- Consumes: `Db`; `Routine`, `RoutineLogEntry`, `OutboxEntry`, `CappedKind`, `Need` (core/types)
- Produces:
  - `interface RoutineRecord extends Routine { title: string }`
  - `listRoutines(db): Promise<RoutineRecord[]>` (по `time`, `id`), `getRoutine(db, id): Promise<RoutineRecord | null>`
  - `createRoutine(db, input: { title: string; need: Need; time: string; days: number }): Promise<RoutineRecord>` (active = true)
  - `updateRoutine(db, id, patch: Partial<{ title: string; need: Need; time: string; days: number; active: boolean }>): Promise<RoutineRecord | null>`
  - `deleteRoutine(db, id): Promise<boolean>`
  - `getRoutineLog(db, date: string): Promise<RoutineLogEntry[]>`
  - `claimRoutine(db, routineId, date, now): Promise<boolean>` — первая отправка (INSERT … ON CONFLICT DO NOTHING)
  - `releaseRoutine(db, routineId, date): Promise<void>` — откат первой отправки при ошибке
  - `claimRoutineResend(db, routineId, date, now): Promise<boolean>` — повтор после снуза (`snoozed_until <= now`, не выполнена)
  - `restoreSnooze(db, routineId, date, until: Date): Promise<void>` — откат повтора при ошибке
  - `snoozeRoutine(db, routineId, date, until: Date): Promise<boolean>` — только если не выполнена
  - `markRoutineDone(db, routineId, date, now): Promise<boolean>` — upsert; `true` только при первом выполнении за дату
  - `countRoutinesDoneOn(db, date): Promise<number>`
  - `getOutboxToday(db, localDate: string): Promise<OutboxEntry[]>`
  - `claimOutbox(db, entry: { dedupKey: string; kind: CappedKind; need: Need | null; localDate: string; now: Date }): Promise<number | null>` — id или `null`, если ключ уже занят
  - `releaseOutbox(db, id): Promise<void>`, `markFollowedUp(db, id): Promise<void>`
  - `answerOpenSignals(db, now): Promise<void>` — `answered_at = now` у всех неотвеченных `need`/`followup`
  - `interface Reward { id: number; kind: 'note' | 'photo'; text: string | null; fileId: string | null; unlockedAt: Date | null }`
  - `addNote(db, text): Promise<Reward>`, `addPhoto(db, fileId, caption: string | null): Promise<Reward>`
  - `unlockOldest(db, kind: 'note' | 'photo', now): Promise<Reward | null>`
  - `countLocked(db): Promise<{ notes: number; photos: number }>`
  - `listUnlocked(db): Promise<Reward[]>` (новые первыми), `getUnlockedPhoto(db, id): Promise<Reward | null>`

- [ ] **Step 1: Написать падающие тесты**

`tests/db/routines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  claimRoutine,
  claimRoutineResend,
  countRoutinesDoneOn,
  createRoutine,
  deleteRoutine,
  getRoutineLog,
  listRoutines,
  markRoutineDone,
  releaseRoutine,
  restoreSnooze,
  snoozeRoutine,
  updateRoutine,
} from '../../src/db/routines.js';
import { testDb } from '../helpers/db.js';

const DATE = '2026-12-27';
const T0 = new Date('2026-12-27T17:00:00Z');
const T1 = new Date('2026-12-27T17:20:00Z');

async function withPills() {
  const db = await testDb();
  const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
  return { db, pills };
}

describe('routines repo', () => {
  it('создаёт, обновляет, выключает и удаляет рутину', async () => {
    const { db, pills } = await withPills();
    expect(pills).toMatchObject({ title: 'таблетки', need: 'food', time: '20:00', days: 127, active: true });
    expect(await updateRoutine(db, pills.id, { time: '21:00', active: false })).toMatchObject({ time: '21:00', active: false });
    expect(await listRoutines(db)).toHaveLength(1);
    expect(await deleteRoutine(db, pills.id)).toBe(true);
    expect(await listRoutines(db)).toEqual([]);
  });

  it('первую отправку можно захватить один раз; откат освобождает', async () => {
    const { db, pills } = await withPills();
    expect(await claimRoutine(db, pills.id, DATE, T0)).toBe(true);
    expect(await claimRoutine(db, pills.id, DATE, T0)).toBe(false);
    await releaseRoutine(db, pills.id, DATE);
    expect(await claimRoutine(db, pills.id, DATE, T0)).toBe(true);
  });

  it('повтор после снуза захватывается один раз и только после наступления времени', async () => {
    const { db, pills } = await withPills();
    await claimRoutine(db, pills.id, DATE, T0);
    expect(await snoozeRoutine(db, pills.id, DATE, T1)).toBe(true);
    expect(await claimRoutineResend(db, pills.id, DATE, T0)).toBe(false);
    expect(await claimRoutineResend(db, pills.id, DATE, T1)).toBe(true);
    expect(await claimRoutineResend(db, pills.id, DATE, T1)).toBe(false);
    await restoreSnooze(db, pills.id, DATE, T1);
    expect(await claimRoutineResend(db, pills.id, DATE, T1)).toBe(true);
  });

  it('выполнение засчитывается один раз, даже без отправленного напоминания', async () => {
    const { db, pills } = await withPills();
    expect(await markRoutineDone(db, pills.id, DATE, T0)).toBe(true);
    expect(await markRoutineDone(db, pills.id, DATE, T1)).toBe(false);
    expect(await snoozeRoutine(db, pills.id, DATE, T1)).toBe(false);
    expect(await countRoutinesDoneOn(db, DATE)).toBe(1);
    expect(await getRoutineLog(db, DATE)).toEqual([{ routineId: pills.id, doneAt: T0, snoozedUntil: null }]);
  });
});
```

`tests/db/outbox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  answerOpenSignals,
  claimOutbox,
  getOutboxToday,
  markFollowedUp,
  releaseOutbox,
} from '../../src/db/outbox.js';
import { testDb } from '../helpers/db.js';

const NOW = new Date('2026-12-27T09:00:00Z');
const signal = { dedupKey: 'need:food:2026-12-27:3h:4', kind: 'need' as const, need: 'food' as const, localDate: '2026-12-27', now: NOW };

describe('outbox repo', () => {
  it('ключ захватывается один раз; откат освобождает', async () => {
    const db = await testDb();
    const id = await claimOutbox(db, signal);
    expect(id).toBeTypeOf('number');
    expect(await claimOutbox(db, signal)).toBeNull();
    await releaseOutbox(db, id!);
    expect(await claimOutbox(db, signal)).toBeTypeOf('number');
  });

  it('getOutboxToday возвращает записи только за дату', async () => {
    const db = await testDb();
    await claimOutbox(db, signal);
    await claimOutbox(db, { ...signal, dedupKey: 'morning:2026-12-26', kind: 'morning', need: null, localDate: '2026-12-26' });
    expect(await getOutboxToday(db, '2026-12-27')).toEqual([
      { id: expect.any(Number), kind: 'need', need: 'food', sentAt: NOW, answeredAt: null, followedUp: false },
    ]);
  });

  it('повтор помечается, ответ закрывает только сигналы', async () => {
    const db = await testDb();
    const id = await claimOutbox(db, signal);
    await claimOutbox(db, { ...signal, dedupKey: 'morning:2026-12-27', kind: 'morning', need: null });
    await markFollowedUp(db, id!);
    const later = new Date('2026-12-27T10:00:00Z');
    await answerOpenSignals(db, later);
    const entries = await getOutboxToday(db, '2026-12-27');
    expect(entries.find((e) => e.kind === 'need')).toMatchObject({ followedUp: true, answeredAt: later });
    expect(entries.find((e) => e.kind === 'morning')).toMatchObject({ answeredAt: null });
  });
});
```

`tests/db/rewards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addNote,
  addPhoto,
  countLocked,
  getUnlockedPhoto,
  listUnlocked,
  unlockOldest,
} from '../../src/db/rewards.js';
import { testDb } from '../helpers/db.js';

const NOW = new Date('2026-12-27T10:00:00Z');

describe('rewards repo', () => {
  it('открывает самую старую неоткрытую награду нужного типа', async () => {
    const db = await testDb();
    await addNote(db, 'первая');
    await addNote(db, 'вторая');
    expect(await unlockOldest(db, 'note', NOW)).toMatchObject({ text: 'первая', unlockedAt: NOW });
    expect(await unlockOldest(db, 'note', NOW)).toMatchObject({ text: 'вторая' });
    expect(await unlockOldest(db, 'note', NOW)).toBeNull();
  });

  it('считает неоткрытые и отдаёт только открытые фото', async () => {
    const db = await testDb();
    await addNote(db, 'записка');
    const photo = await addPhoto(db, 'FILE_1', 'мы на море');
    expect(await countLocked(db)).toEqual({ notes: 1, photos: 1 });
    expect(await getUnlockedPhoto(db, photo.id)).toBeNull();
    await unlockOldest(db, 'photo', NOW);
    expect(await getUnlockedPhoto(db, photo.id)).toMatchObject({ fileId: 'FILE_1', text: 'мы на море' });
    expect(await countLocked(db)).toEqual({ notes: 1, photos: 0 });
    expect((await listUnlocked(db)).map((r) => r.kind)).toEqual(['photo']);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/db/routines.test.ts tests/db/outbox.test.ts tests/db/rewards.test.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализация — `src/db/routines.ts`**

```ts
import type { Need, Routine, RoutineLogEntry } from '../core/types.js';
import type { Db } from './client.js';

export interface RoutineRecord extends Routine {
  title: string;
}

type RoutinePatch = Partial<{ title: string; need: Need; time: string; days: number; active: boolean }>;

interface RoutineRow {
  id: number;
  title: string;
  need: Need;
  time: string;
  days: number;
  active: boolean;
}

interface LogRow {
  routine_id: number;
  done_at: Date | null;
  snoozed_until: Date | null;
}

const COLUMNS = 'id, title, need, time, days, active';

const toRoutine = (row: RoutineRow): RoutineRecord => ({ ...row });

async function oneRoutine(db: Db, text: string, params: unknown[]): Promise<RoutineRecord | null> {
  const [row] = await db.query<RoutineRow>(text, params);
  return row ? toRoutine(row) : null;
}

async function affected(db: Db, text: string, params: unknown[]): Promise<boolean> {
  return (await db.query(text, params)).length > 0;
}

export async function listRoutines(db: Db): Promise<RoutineRecord[]> {
  return (await db.query<RoutineRow>(`SELECT ${COLUMNS} FROM routines ORDER BY time, id`)).map(toRoutine);
}

export function getRoutine(db: Db, id: number): Promise<RoutineRecord | null> {
  return oneRoutine(db, `SELECT ${COLUMNS} FROM routines WHERE id = $1`, [id]);
}

export async function createRoutine(
  db: Db,
  input: { title: string; need: Need; time: string; days: number },
): Promise<RoutineRecord> {
  const routine = await oneRoutine(
    db,
    `INSERT INTO routines (title, need, time, days) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [input.title, input.need, input.time, input.days],
  );
  if (!routine) throw new Error('INSERT routines не вернул строку');
  return routine;
}

export async function updateRoutine(db: Db, id: number, patch: RoutinePatch): Promise<RoutineRecord | null> {
  const current = await getRoutine(db, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  return oneRoutine(
    db,
    `UPDATE routines SET title = $2, need = $3, time = $4, days = $5, active = $6 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, next.title, next.need, next.time, next.days, next.active],
  );
}

export function deleteRoutine(db: Db, id: number): Promise<boolean> {
  return affected(db, 'DELETE FROM routines WHERE id = $1 RETURNING id', [id]);
}

export async function getRoutineLog(db: Db, date: string): Promise<RoutineLogEntry[]> {
  const rows = await db.query<LogRow>(
    'SELECT routine_id, done_at, snoozed_until FROM routine_log WHERE date = $1 ORDER BY routine_id',
    [date],
  );
  return rows.map((row) => ({
    routineId: row.routine_id,
    doneAt: row.done_at ? new Date(row.done_at) : null,
    snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : null,
  }));
}

export function claimRoutine(db: Db, routineId: number, date: string, now: Date): Promise<boolean> {
  return affected(
    db,
    `INSERT INTO routine_log (routine_id, date, sent_at) VALUES ($1, $2, $3)
     ON CONFLICT (routine_id, date) DO NOTHING RETURNING routine_id`,
    [routineId, date, now],
  );
}

export async function releaseRoutine(db: Db, routineId: number, date: string): Promise<void> {
  await db.query('DELETE FROM routine_log WHERE routine_id = $1 AND date = $2 AND done_at IS NULL', [routineId, date]);
}

export function claimRoutineResend(db: Db, routineId: number, date: string, now: Date): Promise<boolean> {
  return affected(
    db,
    `UPDATE routine_log SET snoozed_until = NULL, sent_at = $3
     WHERE routine_id = $1 AND date = $2 AND done_at IS NULL AND snoozed_until <= $3 RETURNING routine_id`,
    [routineId, date, now],
  );
}

export async function restoreSnooze(db: Db, routineId: number, date: string, until: Date): Promise<void> {
  await db.query('UPDATE routine_log SET snoozed_until = $3 WHERE routine_id = $1 AND date = $2 AND done_at IS NULL', [
    routineId,
    date,
    until,
  ]);
}

export function snoozeRoutine(db: Db, routineId: number, date: string, until: Date): Promise<boolean> {
  return affected(
    db,
    `UPDATE routine_log SET snoozed_until = $3 WHERE routine_id = $1 AND date = $2 AND done_at IS NULL
     RETURNING routine_id`,
    [routineId, date, until],
  );
}

export function markRoutineDone(db: Db, routineId: number, date: string, now: Date): Promise<boolean> {
  return affected(
    db,
    `INSERT INTO routine_log (routine_id, date, sent_at, done_at) VALUES ($1, $2, $3, $3)
     ON CONFLICT (routine_id, date) DO UPDATE SET done_at = EXCLUDED.done_at
     WHERE routine_log.done_at IS NULL RETURNING routine_id`,
    [routineId, date, now],
  );
}

export async function countRoutinesDoneOn(db: Db, date: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM routine_log WHERE date = $1 AND done_at IS NOT NULL',
    [date],
  );
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Реализация — `src/db/outbox.ts`**

```ts
import type { CappedKind, Need, OutboxEntry } from '../core/types.js';
import type { Db } from './client.js';

interface OutboxRow {
  id: number;
  kind: CappedKind;
  need: Need | null;
  sent_at: Date;
  answered_at: Date | null;
  followed_up: boolean;
}

export interface OutboxClaim {
  dedupKey: string;
  kind: CappedKind;
  need: Need | null;
  localDate: string;
  now: Date;
}

export async function getOutboxToday(db: Db, localDate: string): Promise<OutboxEntry[]> {
  const rows = await db.query<OutboxRow>(
    'SELECT id, kind, need, sent_at, answered_at, followed_up FROM outbox_log WHERE local_date = $1 ORDER BY sent_at, id',
    [localDate],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    need: row.need,
    sentAt: new Date(row.sent_at),
    answeredAt: row.answered_at ? new Date(row.answered_at) : null,
    followedUp: row.followed_up,
  }));
}

export async function claimOutbox(db: Db, claim: OutboxClaim): Promise<number | null> {
  const [row] = await db.query<{ id: number }>(
    `INSERT INTO outbox_log (dedup_key, kind, need, local_date, sent_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dedup_key) DO NOTHING RETURNING id`,
    [claim.dedupKey, claim.kind, claim.need, claim.localDate, claim.now],
  );
  return row?.id ?? null;
}

export async function releaseOutbox(db: Db, id: number): Promise<void> {
  await db.query('DELETE FROM outbox_log WHERE id = $1', [id]);
}

export async function markFollowedUp(db: Db, id: number): Promise<void> {
  await db.query('UPDATE outbox_log SET followed_up = true WHERE id = $1', [id]);
}

export async function answerOpenSignals(db: Db, now: Date): Promise<void> {
  await db.query(
    `UPDATE outbox_log SET answered_at = $1 WHERE answered_at IS NULL AND kind IN ('need', 'followup')`,
    [now],
  );
}
```

- [ ] **Step 5: Реализация — `src/db/rewards.ts`**

```ts
import type { Db } from './client.js';

export type RewardKind = 'note' | 'photo';

export interface Reward {
  id: number;
  kind: RewardKind;
  text: string | null;
  fileId: string | null;
  unlockedAt: Date | null;
}

interface RewardRow {
  id: number;
  kind: RewardKind;
  text: string | null;
  file_id: string | null;
  unlocked_at: Date | null;
}

const COLUMNS = 'id, kind, text, file_id, unlocked_at';

function toReward(row: RewardRow): Reward {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    fileId: row.file_id,
    unlockedAt: row.unlocked_at ? new Date(row.unlocked_at) : null,
  };
}

async function one(db: Db, text: string, params: unknown[]): Promise<Reward | null> {
  const [row] = await db.query<RewardRow>(text, params);
  return row ? toReward(row) : null;
}

async function insert(db: Db, kind: RewardKind, text: string | null, fileId: string | null): Promise<Reward> {
  const reward = await one(db, `INSERT INTO rewards (kind, text, file_id) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`, [
    kind,
    text,
    fileId,
  ]);
  if (!reward) throw new Error('INSERT rewards не вернул строку');
  return reward;
}

export function addNote(db: Db, text: string): Promise<Reward> {
  return insert(db, 'note', text, null);
}

export function addPhoto(db: Db, fileId: string, caption: string | null): Promise<Reward> {
  return insert(db, 'photo', caption, fileId);
}

export function unlockOldest(db: Db, kind: RewardKind, now: Date): Promise<Reward | null> {
  return one(
    db,
    `UPDATE rewards SET unlocked_at = $2
     WHERE id = (SELECT id FROM rewards WHERE kind = $1 AND unlocked_at IS NULL ORDER BY id LIMIT 1)
       AND unlocked_at IS NULL
     RETURNING ${COLUMNS}`,
    [kind, now],
  );
}

export async function countLocked(db: Db): Promise<{ notes: number; photos: number }> {
  const [row] = await db.query<{ notes: number; photos: number }>(
    `SELECT count(*) FILTER (WHERE kind = 'note')::int AS notes,
            count(*) FILTER (WHERE kind = 'photo')::int AS photos
     FROM rewards WHERE unlocked_at IS NULL`,
  );
  return { notes: row?.notes ?? 0, photos: row?.photos ?? 0 };
}

export async function listUnlocked(db: Db): Promise<Reward[]> {
  const rows = await db.query<RewardRow>(
    `SELECT ${COLUMNS} FROM rewards WHERE unlocked_at IS NOT NULL ORDER BY unlocked_at DESC, id DESC`,
  );
  return rows.map(toReward);
}

export function getUnlockedPhoto(db: Db, id: number): Promise<Reward | null> {
  return one(db, `SELECT ${COLUMNS} FROM rewards WHERE id = $1 AND kind = 'photo' AND unlocked_at IS NOT NULL`, [id]);
}
```

- [ ] **Step 6: Запустить тесты и типы**

Run: `npx vitest run tests/db && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/routines.ts src/db/outbox.ts src/db/rewards.ts tests/db/routines.test.ts tests/db/outbox.test.ts tests/db/rewards.test.ts
git commit -m "feat(db): routines, outbox and rewards repositories"
```

---

### Task 4: Сервисы — валидация настроек и выполнение задач/рутин

**Files:**
- Create: `src/services/settings.ts`, `src/services/completion.ts`
- Test: `tests/services/settings.test.ts`, `tests/services/completion.test.ts`

**Interfaces:**
- Consumes: репозитории Task 2–3; core: `decay`, `applyCompletion`, `rewardsEarned`, `localTime`, `parseHHMM`
- Produces:
  - `SettingsInput` (zod-схема) и `parseSettings(input: unknown): Settings` — бросает `ZodError`
  - `interface CompletionResult { needs: Needs; rewards: Reward[] }`
  - `loadCurrentNeeds(db, now): Promise<{ needs: Needs; settings: Settings; pet: PetRecord }>` — шкалы, убывшие до `now` (без записи в БД)
  - `completeTask(db, taskId: number, now: Date): Promise<CompletionResult | null>` — `null`, если задача уже выполнена / не найдена / без потребности
  - `completeRoutine(db, routineId: number, date: string, now: Date): Promise<CompletionResult | null>` — `null` при повторе за дату
  - `quickComplete(db, need: Need, title: string, now: Date): Promise<CompletionResult>` — создать и сразу выполнить задачу (кнопка «Сделала» на сигнале без конкретной задачи)

- [ ] **Step 1: Написать падающие тесты**

`tests/services/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSettings } from '../../src/services/settings.js';

const OK = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };

describe('parseSettings', () => {
  it('принимает корректные настройки', () => {
    expect(parseSettings(OK)).toEqual(OK);
    expect(parseSettings({ ...OK, quiet: { start: '00:00', end: '07:30' } })).toBeTruthy();
    expect(parseSettings({ ...OK, quiet: { start: '20:00', end: '05:00' } })).toBeTruthy();
  });

  it('отклоняет неизвестный часовой пояс', () => {
    expect(() => parseSettings({ ...OK, timezone: 'Mars/Olympus' })).toThrow();
  });

  it('отклоняет начало тихих часов после полуночи и раньше 20:00', () => {
    expect(() => parseSettings({ ...OK, quiet: { start: '01:00', end: '09:00' } })).toThrow();
    expect(() => parseSettings({ ...OK, quiet: { start: '19:59', end: '09:00' } })).toThrow();
  });

  it('отклоняет конец тихих часов вне 05:00–12:00 и кривой формат', () => {
    expect(() => parseSettings({ ...OK, quiet: { start: '23:00', end: '12:01' } })).toThrow();
    expect(() => parseSettings({ ...OK, quiet: { start: '23:00', end: '04:59' } })).toThrow();
    expect(() => parseSettings({ ...OK, quiet: { start: '23:00', end: '9:00' } })).toThrow();
  });
});
```

`tests/services/completion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { claimOutbox, getOutboxToday } from '../../src/db/outbox.js';
import { addNote, addPhoto } from '../../src/db/rewards.js';
import { createRoutine } from '../../src/db/routines.js';
import { getPet, savePet } from '../../src/db/state.js';
import { createTask } from '../../src/db/tasks.js';
import { completeRoutine, completeTask, quickComplete } from '../../src/services/completion.js';
import { testDb } from '../helpers/db.js';

// 12:00 МСК — бодрствование
const NOW = new Date('2026-12-27T09:00:00Z');

async function dbWithPet(needs = { food: 20, walk: 85, play: 85, love: 85 }, completedTotal = 0): Promise<Db> {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: NOW, lastCompletedAt: NOW, completedTotal, lastNoteDate: null });
  return db;
}

describe('completeTask', () => {
  it('добавляет 35 к потребности задачи и увеличивает счётчик', async () => {
    const db = await dbWithPet();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    const result = await completeTask(db, task.id, NOW);
    expect(result?.needs.food).toBe(55);
    expect((await getPet(db)).completedTotal).toBe(1);
  });

  it('двойное нажатие засчитывается один раз', async () => {
    const db = await dbWithPet();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await completeTask(db, task.id, NOW);
    expect(await completeTask(db, task.id, NOW)).toBeNull();
    expect((await getPet(db)).needs.food).toBe(55);
  });

  it('выдаёт записку, когда все шкалы ≥ 80, и не чаще раза в день', async () => {
    const db = await dbWithPet({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    await addNote(db, 'вторая');
    const first = await createTask(db, { title: 'a', need: 'food', dueAt: null });
    const second = await createTask(db, { title: 'b', need: 'food', dueAt: null });
    expect((await completeTask(db, first.id, NOW))?.rewards).toMatchObject([{ kind: 'note', text: 'ты умница' }]);
    expect((await completeTask(db, second.id, NOW))?.rewards).toEqual([]);
    expect((await getPet(db)).lastNoteDate).toBe('2026-12-27');
  });

  it('выдаёт фото на 10-й выполненной задаче', async () => {
    const db = await dbWithPet(undefined, 9);
    await addPhoto(db, 'FILE', 'море');
    const task = await createTask(db, { title: 'a', need: 'walk', dueAt: null });
    expect((await completeTask(db, task.id, NOW))?.rewards).toMatchObject([{ kind: 'photo', fileId: 'FILE' }]);
  });

  it('без неоткрытых наград ничего не выдаёт и не ломается', async () => {
    const db = await dbWithPet({ food: 90, walk: 90, play: 90, love: 90 }, 9);
    const task = await createTask(db, { title: 'a', need: 'walk', dueAt: null });
    expect((await completeTask(db, task.id, NOW))?.rewards).toEqual([]);
    expect((await getPet(db)).lastNoteDate).toBeNull();
  });

  it('отмечает открытые сигналы отвеченными', async () => {
    const db = await dbWithPet();
    await claimOutbox(db, { dedupKey: 'need:food:x', kind: 'need', need: 'food', localDate: '2026-12-27', now: NOW });
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await completeTask(db, task.id, NOW);
    expect((await getOutboxToday(db, '2026-12-27'))[0]?.answeredAt).toEqual(NOW);
  });
});

describe('completeRoutine и quickComplete', () => {
  it('рутина засчитывается один раз за дату', async () => {
    const db = await dbWithPet();
    const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    expect((await completeRoutine(db, pills.id, '2026-12-27', NOW))?.needs.food).toBe(55);
    expect(await completeRoutine(db, pills.id, '2026-12-27', NOW)).toBeNull();
    expect(await completeRoutine(db, 999, '2026-12-27', NOW)).toBeNull();
  });

  it('quickComplete создаёт и выполняет задачу', async () => {
    const db = await dbWithPet();
    expect((await quickComplete(db, 'food', 'выпить воды', NOW)).needs.food).toBe(55);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/services`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализация — `src/services/settings.ts`**

```ts
import { z } from 'zod';
import type { Settings } from '../core/types.js';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOf(value: string): number | null {
  const match = HHMM.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Начало тихих часов 20:00–23:59 или 00:00: бодрствующий день не пересекает полночь. */
const quietStart = z.string().refine((v) => {
  const m = minutesOf(v);
  return m !== null && (m >= 20 * 60 || m === 0);
}, 'Тихие часы должны начинаться с 20:00 до 00:00');

const quietEnd = z.string().refine((v) => {
  const m = minutesOf(v);
  return m !== null && m >= 5 * 60 && m <= 12 * 60;
}, 'Тихие часы должны заканчиваться с 05:00 до 12:00');

export const SettingsInput = z.object({
  timezone: z.string().refine(isKnownTimezone, 'Неизвестный часовой пояс'),
  quiet: z.object({ start: quietStart, end: quietEnd }),
});

export function parseSettings(input: unknown): Settings {
  return SettingsInput.parse(input);
}
```

- [ ] **Step 4: Реализация — `src/services/completion.ts`**

```ts
import { applyCompletion, decay } from '../core/needs.js';
import { rewardsEarned } from '../core/rewards.js';
import { localTime } from '../core/time.js';
import type { Need, Needs, Settings } from '../core/types.js';
import type { Db } from '../db/client.js';
import { answerOpenSignals } from '../db/outbox.js';
import { type Reward, unlockOldest } from '../db/rewards.js';
import { getRoutine, markRoutineDone } from '../db/routines.js';
import { getPet, getSettings, type PetRecord, savePet } from '../db/state.js';
import { createTask, markTaskDone } from '../db/tasks.js';

export interface CompletionResult {
  needs: Needs;
  rewards: Reward[];
}

export async function loadCurrentNeeds(db: Db, now: Date): Promise<{ needs: Needs; settings: Settings; pet: PetRecord }> {
  const [pet, settings] = await Promise.all([getPet(db), getSettings(db)]);
  return { needs: decay(pet.needs, pet.updatedAt, now, settings), settings, pet };
}

// ponytail: read-modify-write строки pet без блокировки — пользователь один; при двух одновременных
// выполнениях один прирост может потеряться. Если станет важно — sql.transaction с SELECT ... FOR UPDATE.
async function applyPetCompletion(db: Db, need: Need, now: Date): Promise<CompletionResult> {
  const { needs: decayed, settings, pet } = await loadCurrentNeeds(db, now);
  const needs = applyCompletion(decayed, need, pet.lastCompletedAt, now);
  const completedTotal = pet.completedTotal + 1;
  const today = localTime(now, settings.timezone).date;
  const earned = rewardsEarned({ needs, completedTotal, lastNoteDate: pet.lastNoteDate, today });
  const note = earned.note ? await unlockOldest(db, 'note', now) : null;
  const photo = earned.photo ? await unlockOldest(db, 'photo', now) : null;

  await savePet(db, {
    needs,
    updatedAt: now,
    lastCompletedAt: now,
    completedTotal,
    lastNoteDate: note ? today : pet.lastNoteDate,
  });
  await answerOpenSignals(db, now);
  return { needs, rewards: [note, photo].filter((reward): reward is Reward => reward !== null) };
}

export async function completeTask(db: Db, taskId: number, now: Date): Promise<CompletionResult | null> {
  const task = await markTaskDone(db, taskId, now);
  if (!task?.need) return null;
  return applyPetCompletion(db, task.need, now);
}

export async function completeRoutine(
  db: Db,
  routineId: number,
  date: string,
  now: Date,
): Promise<CompletionResult | null> {
  const routine = await getRoutine(db, routineId);
  if (!routine) return null;
  if (!(await markRoutineDone(db, routineId, date, now))) return null;
  return applyPetCompletion(db, routine.need, now);
}

export async function quickComplete(db: Db, need: Need, title: string, now: Date): Promise<CompletionResult> {
  const task = await createTask(db, { title, need, dueAt: null });
  const result = await completeTask(db, task.id, now);
  if (!result) throw new Error('Только что созданная задача не выполнилась');
  return result;
}
```

- [ ] **Step 5: Запустить тесты и типы**

Run: `npx vitest run tests/services && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/settings.ts src/services/completion.ts tests/services/settings.test.ts tests/services/completion.test.ts
git commit -m "feat(services): settings validation and task/routine completion"
```

---

### Task 5: Сообщения Шантика — типы, фразы, сборка

**Files:**
- Create: `src/services/messages.ts`
- Test: `tests/services/messages.test.ts`

**Interfaces:**
- Consumes: `Need`, `Settings` (core/types); `snoozeFits` (core/schedule/routines); `Reward` (db/rewards)
- Produces:
  - `type Button = { text: string; data: string } | { text: string; webApp: string }`
  - `interface OutgoingMessage { text: string; buttons?: Button[][]; silent?: boolean; photo?: string }` — `photo` = Telegram `file_id`
  - `type Sender = (message: OutgoingMessage) => Promise<void>`
  - `NEED_LABEL: Record<Need, string>`, `QUICK_ACTIONS: Record<Need, readonly string[]>`
  - `routineMessage(routine: { id: number; title: string; time: string }, date: string, now: Date, settings: Settings, random: () => number): OutgoingMessage`
  - `needMessage(need: Need, suggestion: { id: number; title: string } | null, random: () => number, isFollowup: boolean): OutgoingMessage`
  - `morningMessage(today: readonly { title: string; time: string }[], miniAppUrl: string, random: () => number): OutgoingMessage`
  - `eveningMessage(doneCount: number, random: () => number): OutgoingMessage`
  - `rewardMessages(rewards: readonly Reward[]): OutgoingMessage[]`
  - `pluralDeeds(count: number): string` — «1 дело», «2 дела», «5 дел»

Формат `callback_data` (его разбирает бот в Task 7):
- `rdone:<routineId>:<date>`, `rsnooze:<routineId>:<date>:<minutes>`
- `done:<taskId>`, `quick:<need>:<actionIndex>`, `later`
- `need:<taskId>:<need>` (выбор потребности для черновика — собирает Task 7)

- [ ] **Step 1: Написать падающие тесты — `tests/services/messages.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  QUICK_ACTIONS,
  eveningMessage,
  morningMessage,
  needMessage,
  pluralDeeds,
  rewardMessages,
  routineMessage,
} from '../../src/services/messages.js';

const first = () => 0;
const SETTINGS = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };
const PILLS = { id: 3, title: 'таблетки', time: '20:00' };

describe('routineMessage', () => {
  it('в 20:00 предлагает «Сделала» и оба снуза', () => {
    const msg = routineMessage(PILLS, '2026-12-27', new Date('2026-12-27T17:00:00Z'), SETTINGS, first);
    expect(msg.text).toContain('таблетки');
    expect(msg.buttons).toEqual([
      [{ text: '✅ Сделала', data: 'rdone:3:2026-12-27' }],
      [
        { text: '⏰ +15 мин', data: 'rsnooze:3:2026-12-27:15' },
        { text: '⏰ +1 ч', data: 'rsnooze:3:2026-12-27:60' },
      ],
    ]);
  });

  it('в 22:30 не предлагает снуз в тихие часы', () => {
    const late = { ...PILLS, time: '22:30' };
    const msg = routineMessage(late, '2026-12-27', new Date('2026-12-27T19:30:00Z'), SETTINGS, first);
    expect(msg.buttons?.[1]).toEqual([{ text: '⏰ +15 мин', data: 'rsnooze:3:2026-12-27:15' }]);
  });

  it('в 22:50 снуза нет вовсе', () => {
    const late = { ...PILLS, time: '22:50' };
    const msg = routineMessage(late, '2026-12-27', new Date('2026-12-27T19:50:00Z'), SETTINGS, first);
    expect(msg.buttons).toHaveLength(1);
  });
});

describe('needMessage', () => {
  it('предлагает её открытую задачу', () => {
    const msg = needMessage('food', { id: 7, title: 'пообедать' }, first, false);
    expect(msg.text).toContain('пообедать');
    expect(msg.buttons).toEqual([[{ text: '✅ Сделала', data: 'done:7' }, { text: '⏰ Позже', data: 'later' }]]);
  });

  it('без задачи предлагает простое действие', () => {
    const msg = needMessage('walk', null, first, false);
    expect(msg.text).toContain(QUICK_ACTIONS.walk[0]);
    expect(msg.buttons?.[0]?.[0]).toEqual({ text: '✅ Сделала', data: 'quick:walk:0' });
  });

  it('повтор звучит иначе, чем первый сигнал', () => {
    expect(needMessage('food', null, first, true).text).not.toEqual(needMessage('food', null, first, false).text);
  });
});

describe('morning, evening, rewards', () => {
  it('утро — без звука, с рутинами дня и кнопкой Mini App', () => {
    const msg = morningMessage([{ title: 'таблетки', time: '20:00' }], 'https://app.example', first);
    expect(msg.silent).toBe(true);
    expect(msg.text).toContain('таблетки в 20:00');
    expect(msg.buttons).toEqual([[{ text: '🐶 Открыть Шантика', webApp: 'https://app.example' }]]);
  });

  it('вечер без дел — тёплый, без упрёков; с делами — со счётом', () => {
    expect(eveningMessage(0, first)).toMatchObject({ silent: true });
    expect(eveningMessage(0, first).text).toContain('это тоже нормально');
    expect(eveningMessage(4, first).text).toContain('4 дела');
  });

  it('награды: записка текстом, фото по file_id', () => {
    const msgs = rewardMessages([
      { id: 1, kind: 'note', text: 'ты умница', fileId: null, unlockedAt: null },
      { id: 2, kind: 'photo', text: 'море', fileId: 'FILE', unlockedAt: null },
    ]);
    expect(msgs[0]?.text).toContain('ты умница');
    expect(msgs[1]).toMatchObject({ photo: 'FILE' });
    expect(msgs[1]?.text).toContain('море');
  });

  it('склоняет «дело»', () => {
    expect([1, 2, 5, 11, 21, 22].map(pluralDeeds)).toEqual(['1 дело', '2 дела', '5 дел', '11 дел', '21 дело', '22 дела']);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/services/messages.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализация — `src/services/messages.ts`**

```ts
import { snoozeFits } from '../core/schedule/routines.js';
import type { Need, Settings } from '../core/types.js';
import type { Reward } from '../db/rewards.js';

export type Button = { text: string; data: string } | { text: string; webApp: string };

export interface OutgoingMessage {
  text: string;
  buttons?: Button[][];
  silent?: boolean;
  /** Telegram file_id — отправить фото с подписью text */
  photo?: string;
}

export type Sender = (message: OutgoingMessage) => Promise<void>;

export const NEED_LABEL: Record<Need, string> = {
  food: '🍖 Миска',
  walk: '🦮 Прогулка',
  play: '🎾 Игра',
  love: '🤍 Ласка',
};

export const QUICK_ACTIONS: Record<Need, readonly string[]> = {
  food: ['выпить стакан воды', 'перекусить чем-нибудь', 'принять таблетки, если пора'],
  walk: ['выйти на улицу хотя бы на 5 минут', 'потянуться пару минут', 'дойти до магазина'],
  play: ['сделать одно маленькое дело', 'помыть одну тарелку', 'ответить на одно сообщение'],
  love: ['полежать 10 минут', 'включить любимую песню', 'выпить чаю и ничего не делать'],
};

const ASK: Record<Need, readonly string[]> = {
  food: ['миска почти пустая 🥺', 'у меня урчит в животике 🍖', 'гав! кажется, пора подкрепиться', 'я смотрю на миску… а она на меня 🥺', 'кушать хочется, давай вместе?'],
  walk: ['гав! хочу гулять 🦮', 'я принёс поводок 🦮👀', 'на улице столько всего интересного!', 'лапки просят пройтись 🐾', 'пойдём подышим?'],
  play: ['принёс мячик 🎾 сначала дело, потом играем?', 'гав! давай одно маленькое дело', 'я верю, ты справишься 🎾', 'сделаем что-нибудь вместе?', 'одна задачка — и я счастлив 🎾'],
  love: ['хочу на ручки 🤍', 'ты сегодня отдыхала? 🤍', 'давай немного побудем вместе', 'я соскучился 🥺🤍', 'тебе тоже нужна забота 🤍'],
};
const FOLLOWUP = ['гав? я всё ещё жду 🥺', 'напоминаю тихонько 🐾', 'я тут, никуда не ушёл 🐶', 'ну пожалуйста? 🥺', 'одна маленькая штучка — и всё 🐾'];
const SUGGEST = ['может, {action}?', 'давай {action}?', 'как насчёт: {action}?', 'предлагаю {action} 🐾', 'попробуем {action}?'];
const ROUTINE = ['{time} — {title} 🐾 Я слежу 👀', 'Гав! Время: {title} ({time})', '{title}, {time} 🐶 не забудь!', 'Напоминаю: {title} 🐾', 'Пора: {title} ⏰'];
const MORNING = ['Доброе утро! ☀️', 'Гав-гав, просыпаемся! 🐶', 'Утро! Я уже виляю хвостом 🐾', 'С добрым утром 🌤', 'Привет! Новый день 🐶'];
const EVENING_DONE = ['Сегодня ты сделала {deeds} — я сытый и счастливый 🐶', 'Итог дня: {deeds}! Горжусь тобой 🐾', '{deeds} за день 🎉 ты лучшая', 'Сегодня {deeds} — отличный день 🐶', 'Ты сделала {deeds}. Спасибо, что заботишься о нас 🤍'];
const EVENING_EMPTY = ['Сегодня был тихий день, это тоже нормально. Я рядом 🤍', 'Тихий день — тоже день, это тоже нормально 🤍 Завтра попробуем вместе', 'Ничего страшного, это тоже нормально. Я тебя люблю 🐶', 'Отдыхать — это тоже нормально 🤍 спокойной ночи', 'Сегодня без дел — это тоже нормально. Я рядом 🐾'];
const REWARD_INTRO = 'Шантик что-то принёс в зубах… 💌';

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick: пустой список');
  return item;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export function pluralDeeds(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} дело`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} дела`;
  return `${count} дел`;
}

export function routineMessage(
  routine: { id: number; title: string; time: string },
  date: string,
  now: Date,
  settings: Settings,
  random: () => number,
): OutgoingMessage {
  const ref = `${routine.id}:${date}`;
  const snoozes = [
    { minutes: 15, text: '⏰ +15 мин' },
    { minutes: 60, text: '⏰ +1 ч' },
  ]
    .filter(({ minutes }) => snoozeFits(now, minutes, settings))
    .map(({ minutes, text }) => ({ text, data: `rsnooze:${ref}:${minutes}` }));
  const buttons: Button[][] = [[{ text: '✅ Сделала', data: `rdone:${ref}` }]];
  if (snoozes.length > 0) buttons.push(snoozes);
  return { text: fill(pick(ROUTINE, random), { time: routine.time, title: routine.title }), buttons };
}

export function needMessage(
  need: Need,
  suggestion: { id: number; title: string } | null,
  random: () => number,
  isFollowup: boolean,
): OutgoingMessage {
  const opener = pick(isFollowup ? FOLLOWUP : ASK[need], random);
  const actionIndex = Math.floor(random() * QUICK_ACTIONS[need].length);
  const action = suggestion ? `«${suggestion.title}»` : (QUICK_ACTIONS[need][actionIndex] ?? '');
  const doneData = suggestion ? `done:${suggestion.id}` : `quick:${need}:${actionIndex}`;
  return {
    text: `${opener}\n${fill(pick(SUGGEST, random), { action })}`,
    buttons: [[{ text: '✅ Сделала', data: doneData }, { text: '⏰ Позже', data: 'later' }]],
  };
}

export function morningMessage(
  today: readonly { title: string; time: string }[],
  miniAppUrl: string,
  random: () => number,
): OutgoingMessage {
  const plan = today.length
    ? `Сегодня у нас: ${today.map((r) => `${r.title} в ${r.time}`).join(', ')}. Что ещё сделаем?`
    : 'Что сегодня сделаем?';
  return {
    text: `${pick(MORNING, random)}\n${plan}`,
    silent: true,
    buttons: [[{ text: '🐶 Открыть Шантика', webApp: miniAppUrl }]],
  };
}

export function eveningMessage(doneCount: number, random: () => number): OutgoingMessage {
  const text =
    doneCount > 0
      ? fill(pick(EVENING_DONE, random), { deeds: pluralDeeds(doneCount) })
      : pick(EVENING_EMPTY, random);
  return { text, silent: true };
}

export function rewardMessages(rewards: readonly Reward[]): OutgoingMessage[] {
  return rewards.map((reward) =>
    reward.kind === 'photo' && reward.fileId
      ? { text: `${REWARD_INTRO}\n\n${reward.text ?? ''}`.trim(), photo: reward.fileId }
      : { text: `${REWARD_INTRO}\n\n${reward.text ?? ''}`.trim() },
  );
}
```

- [ ] **Step 4: Запустить тесты и типы**

Run: `npx vitest run tests/services/messages.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/messages.ts tests/services/messages.test.ts
git commit -m "feat(services): Shantik phrases and message builders"
```

---

### Task 6: Tick — планировщик с захватом и HTTP-обработчик

**Files:**
- Create: `src/services/tick.ts`, `src/api/tick.ts`
- Test: `tests/services/tick.test.ts`, `tests/api/tick.test.ts`

**Interfaces:**
- Consumes: `planTick`, `Outgoing` (core/schedule/plan); `localTime`; `loadCurrentNeeds` (Task 4); репозитории Task 2–3; `routineMessage`, `needMessage`, `morningMessage`, `eveningMessage`, `Sender` (Task 5)
- Produces:
  - `interface TickDeps { db: Db; send: Sender; now: Date; random: () => number; miniAppUrl: string }`
  - `interface TickReport { sent: number; failed: number }`
  - `runTick(deps: TickDeps): Promise<TickReport>`
  - `handleTick(req: Request, deps: { secret: string; run: () => Promise<TickReport> }): Promise<Response>` — 401 без верного заголовка `x-tick-secret`, иначе 200 + JSON отчёта

Правила доставки: сначала захват (Task 3), потом отправка; при ошибке отправки — откат захвата и `console.error` с видом сообщения; после успешного повтора сигнала — `markFollowedUp(parentId)`. Вечерний счёт = задачи, выполненные в текущую локальную дату (по `localTime(doneAt)`, кандидаты из `listDoneSince(now − 36 ч)`), + рутины, выполненные за дату. Утро перечисляет активные рутины, назначенные на сегодня.

- [ ] **Step 1: Написать падающие тесты**

`tests/services/tick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { claimOutbox, getOutboxToday } from '../../src/db/outbox.js';
import { createRoutine, getRoutineLog } from '../../src/db/routines.js';
import { savePet } from '../../src/db/state.js';
import { createTask } from '../../src/db/tasks.js';
import type { OutgoingMessage } from '../../src/services/messages.js';
import { runTick } from '../../src/services/tick.js';
import { testDb } from '../helpers/db.js';

const FULL = { food: 100, walk: 100, play: 100, love: 100 };

async function setup(now: Date, needs = FULL): Promise<Db> {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: now, lastCompletedAt: now, completedTotal: 0, lastNoteDate: null });
  return db;
}

function recorder(failTimes = 0) {
  const sent: OutgoingMessage[] = [];
  let failures = failTimes;
  const send = async (message: OutgoingMessage) => {
    if (failures > 0) {
      failures--;
      throw new Error('telegram down');
    }
    sent.push(message);
  };
  return { sent, send };
}

const deps = (db: Db, send: (m: OutgoingMessage) => Promise<void>, now: Date) => ({
  db,
  send,
  now,
  random: () => 0,
  miniAppUrl: 'https://app.example',
});

describe('runTick', () => {
  it('отправляет рутину в её время и не дублирует при повторном tick', async () => {
    const now = new Date('2026-12-27T17:05:00Z'); // 20:05 МСК
    const db = await setup(now);
    await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const rec = recorder();
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 1, failed: 0 });
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 0, failed: 0 });
    expect(rec.sent).toHaveLength(1);
    expect(rec.sent[0]?.text).toContain('таблетки');
  });

  it('при ошибке Telegram снимает захват, следующий tick повторяет', async () => {
    const now = new Date('2026-12-27T17:05:00Z');
    const db = await setup(now);
    await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const rec = recorder(1);
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 0, failed: 1 });
    expect(await getRoutineLog(db, '2026-12-27')).toEqual([]);
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 1, failed: 0 });
  });

  it('сигнал потребности предлагает её открытую задачу', async () => {
    const now = new Date('2026-12-27T09:00:00Z'); // 12:00 МСК
    const db = await setup(now, { food: 20, walk: 90, play: 90, love: 90 });
    await createTask(db, { title: 'пообедать', need: 'food', dueAt: null });
    const rec = recorder();
    await runTick(deps(db, rec.send, now));
    expect(rec.sent[0]?.text).toContain('пообедать');
    expect(await getOutboxToday(db, '2026-12-27')).toMatchObject([{ kind: 'need', need: 'food' }]);
  });

  it('повтор сигнала помечает родителя followed_up', async () => {
    const now = new Date('2026-12-27T10:30:00Z'); // 13:30 МСК
    const db = await setup(now, { food: 20, walk: 90, play: 90, love: 90 });
    const parentId = await claimOutbox(db, {
      dedupKey: 'need:food:2026-12-27:3h:3',
      kind: 'need',
      need: 'food',
      localDate: '2026-12-27',
      now: new Date('2026-12-27T08:50:00Z'), // 100 минут назад
    });
    const rec = recorder();
    await runTick(deps(db, rec.send, now));
    const parent = (await getOutboxToday(db, '2026-12-27')).find((e) => e.id === parentId);
    expect(parent?.followedUp).toBe(true);
    expect(rec.sent).toHaveLength(1);
  });

  it('утро — без звука, перечисляет рутины дня', async () => {
    const now = new Date('2026-12-27T06:40:00Z'); // 09:40 МСК
    const db = await setup(now);
    await createRoutine(db, { title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const rec = recorder();
    await runTick(deps(db, rec.send, now));
    expect(rec.sent[0]).toMatchObject({ silent: true });
    expect(rec.sent[0]?.text).toContain('таблетки в 20:00');
  });

  it('в тихие часы ничего не шлёт', async () => {
    const now = new Date('2026-12-26T23:00:00Z'); // 02:00 МСК
    const db = await setup(now, { food: 10, walk: 10, play: 10, love: 10 });
    const rec = recorder();
    expect(await runTick(deps(db, rec.send, now))).toEqual({ sent: 0, failed: 0 });
  });
});
```

`tests/api/tick.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { handleTick } from '../../src/api/tick.js';

const SECRET = 'tick_secret_1234567890';

describe('handleTick', () => {
  it('без секрета — 401 и tick не запускается', async () => {
    const run = vi.fn(async () => ({ sent: 0, failed: 0 }));
    const res = await handleTick(new Request('https://x/api/tick', { method: 'POST' }), { secret: SECRET, run });
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('с неверным секретом — 401', async () => {
    const run = vi.fn(async () => ({ sent: 0, failed: 0 }));
    const req = new Request('https://x/api/tick', { method: 'POST', headers: { 'x-tick-secret': 'wrong' } });
    expect((await handleTick(req, { secret: SECRET, run })).status).toBe(401);
  });

  it('с верным секретом — 200 и отчёт', async () => {
    const run = vi.fn(async () => ({ sent: 2, failed: 0 }));
    const req = new Request('https://x/api/tick', { method: 'POST', headers: { 'x-tick-secret': SECRET } });
    const res = await handleTick(req, { secret: SECRET, run });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, failed: 0 });
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/services/tick.test.ts tests/api/tick.test.ts`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализация — `src/services/tick.ts`**

```ts
import { planTick, type Outgoing } from '../core/schedule/plan.js';
import { localTime } from '../core/time.js';
import type { Settings } from '../core/types.js';
import type { Db } from '../db/client.js';
import { claimOutbox, getOutboxToday, markFollowedUp, releaseOutbox } from '../db/outbox.js';
import {
  claimRoutine,
  claimRoutineResend,
  countRoutinesDoneOn,
  getRoutineLog,
  listRoutines,
  type RoutineRecord,
  releaseRoutine,
  restoreSnooze,
} from '../db/routines.js';
import { listDoneSince, listOpenTasks } from '../db/tasks.js';
import { loadCurrentNeeds } from './completion.js';
import {
  eveningMessage,
  morningMessage,
  needMessage,
  type OutgoingMessage,
  routineMessage,
  type Sender,
} from './messages.js';

export interface TickDeps {
  db: Db;
  send: Sender;
  now: Date;
  random: () => number;
  miniAppUrl: string;
}

export interface TickReport {
  sent: number;
  failed: number;
}

interface TickContext extends TickDeps {
  settings: Settings;
  date: string;
  weekday: number;
  routines: readonly RoutineRecord[];
}

type Delivery = 'sent' | 'failed' | 'skipped';
const MS_PER_HOUR = 3_600_000;

async function trySend(ctx: TickContext, message: OutgoingMessage, kind: string): Promise<boolean> {
  try {
    await ctx.send(message);
    return true;
  } catch (error) {
    console.error(`[tick] не удалось отправить ${kind}`, error);
    return false;
  }
}

async function deliverRoutine(ctx: TickContext, item: Extract<Outgoing, { kind: 'routine' }>): Promise<Delivery> {
  const { db, now, date } = ctx;
  const routine = ctx.routines.find((r) => r.id === item.routineId);
  if (!routine) return 'skipped';
  const claimed = item.resend
    ? await claimRoutineResend(db, routine.id, date, now)
    : await claimRoutine(db, routine.id, date, now);
  if (!claimed) return 'skipped';
  if (await trySend(ctx, routineMessage(routine, date, now, ctx.settings, ctx.random), 'routine')) return 'sent';
  if (item.resend) await restoreSnooze(db, routine.id, date, now);
  else await releaseRoutine(db, routine.id, date);
  return 'failed';
}

async function doneToday(ctx: TickContext): Promise<number> {
  const recent = await listDoneSince(ctx.db, new Date(ctx.now.getTime() - 36 * MS_PER_HOUR));
  const tasks = recent.filter((t) => t.doneAt && localTime(t.doneAt, ctx.settings.timezone).date === ctx.date);
  return tasks.length + (await countRoutinesDoneOn(ctx.db, ctx.date));
}

async function cappedMessage(ctx: TickContext, item: Exclude<Outgoing, { kind: 'routine' }>): Promise<OutgoingMessage> {
  if (item.kind === 'morning') {
    const today = ctx.routines.filter((r) => r.active && (r.days & (1 << ctx.weekday)) !== 0);
    return morningMessage(today, ctx.miniAppUrl, ctx.random);
  }
  if (item.kind === 'evening') return eveningMessage(await doneToday(ctx), ctx.random);
  const suggestion = (await listOpenTasks(ctx.db)).find((t) => t.need === item.need) ?? null;
  return needMessage(item.need, suggestion, ctx.random, item.kind === 'followup');
}

async function deliverCapped(ctx: TickContext, item: Exclude<Outgoing, { kind: 'routine' }>): Promise<Delivery> {
  const need = item.kind === 'need' || item.kind === 'followup' ? item.need : null;
  const id = await claimOutbox(ctx.db, { dedupKey: item.dedupKey, kind: item.kind, need, localDate: ctx.date, now: ctx.now });
  if (id === null) return 'skipped';
  if (!(await trySend(ctx, await cappedMessage(ctx, item), item.kind))) {
    await releaseOutbox(ctx.db, id);
    return 'failed';
  }
  if (item.kind === 'followup') await markFollowedUp(ctx.db, item.parentId);
  return 'sent';
}

export async function runTick(deps: TickDeps): Promise<TickReport> {
  const { db, now } = deps;
  const { needs, settings } = await loadCurrentNeeds(db, now);
  const local = localTime(now, settings.timezone);
  const [routines, routineLog, outboxToday] = await Promise.all([
    listRoutines(db),
    getRoutineLog(db, local.date),
    getOutboxToday(db, local.date),
  ]);
  const plan = planTick({ now, settings, needs, routines, routineLog, outboxToday });
  const ctx: TickContext = { ...deps, settings, date: local.date, weekday: local.weekday, routines };

  const report: TickReport = { sent: 0, failed: 0 };
  for (const item of plan) {
    const result = item.kind === 'routine' ? await deliverRoutine(ctx, item) : await deliverCapped(ctx, item);
    if (result === 'sent') report.sent++;
    if (result === 'failed') report.failed++;
  }
  return report;
}
```

- [ ] **Step 4: Реализация — `src/api/tick.ts`**

```ts
import { timingSafeEqual } from 'node:crypto';
import type { TickReport } from '../services/tick.js';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleTick(
  req: Request,
  deps: { secret: string; run: () => Promise<TickReport> },
): Promise<Response> {
  if (!sameSecret(req.headers.get('x-tick-secret') ?? '', deps.secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return Response.json(await deps.run());
}
```

- [ ] **Step 5: Запустить тесты и типы**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. В выводе теста про ошибку Telegram будет ожидаемая строка `[tick] не удалось отправить routine` — это проверяемое поведение (ошибка залогирована, а не проглочена), не шум.

- [ ] **Step 6: Commit**

```bash
git add src/services/tick.ts src/api/tick.ts tests/services/tick.test.ts tests/api/tick.test.ts
git commit -m "feat(tick): claim-then-send scheduler and secret-protected handler"
```

---

### Task 7: Бот — доступ, /start, задачи из чата, админ-команды

**Files:**
- Create: `src/bot/telegram.ts`, `src/bot/bot.ts`, `tests/helpers/telegram.ts`
- Test: `tests/bot/bot.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1); `createDraft` (Task 2); `addNote`, `addPhoto`, `countLocked` (Task 3); `Button`, `OutgoingMessage`, `Sender`, `NEED_LABEL` (Task 5); `NEEDS`
- Produces:
  - `toInlineKeyboard(rows: Button[][]): InlineKeyboard`
  - `sendTo(api: Api, chatId: number, message: OutgoingMessage): Promise<void>` — фото через `sendPhoto` (caption), иначе `sendMessage`; `silent` → `disable_notification`
  - `telegramSender(api: Api, chatId: number): Sender`
  - `interface BotDeps { config: Pick<Config, 'BOT_TOKEN' | 'BOT_INFO' | 'USER_ID' | 'ADMIN_ID' | 'MINI_APP_URL'>; db: Db; clock: () => Date; random: () => number }`
  - `createBot(deps: BotDeps): Bot` — регистрирует всё, включая `registerCallbacks` из Task 8. В этой задаче `src/bot/callbacks.ts` создаётся как заглушка `export function registerCallbacks(_bot: Bot, _deps: BotDeps): void {}`; Task 8 её реализует.
  - `NOT_ALLOWED = 'Это личный бот 🐾'`

Решение: в `tasks.source_message_id` хранится `update_id` (уникален в пределах бота и повторяется при повторной доставке), а не `message_id` (он уникален только внутри чата, а пишут двое — пользователь и админ).

- [ ] **Step 1: Помощник тестов — `tests/helpers/telegram.ts`**

```ts
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
```

- [ ] **Step 2: Написать падающие тесты — `tests/bot/bot.test.ts`**

```ts
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

  it('повторная доставка того же update не создаёт дубль и не отвечает дважды', async () => {
    const { db, bot, calls } = await setup();
    const update = textUpdate(USER, 'купить корм');
    await bot.handleUpdate(update);
    await bot.handleUpdate(update);
    expect(await db.query('SELECT * FROM tasks')).toHaveLength(1);
    expect(methods(calls).filter((m) => m === 'sendMessage')).toHaveLength(1);
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
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run tests/bot/bot.test.ts`
Expected: FAIL — модуля `bot.js` нет.

- [ ] **Step 4: Реализация — `src/bot/telegram.ts`**

```ts
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
```

- [ ] **Step 5: Заглушка — `src/bot/callbacks.ts`**

```ts
import type { Bot } from 'grammy';
import type { BotDeps } from './bot.js';

export function registerCallbacks(_bot: Bot, _deps: BotDeps): void {}
```

- [ ] **Step 6: Реализация — `src/bot/bot.ts`**

```ts
import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Config } from '../config.js';
import { NEEDS } from '../core/types.js';
import type { Db } from '../db/client.js';
import { addNote, addPhoto, countLocked } from '../db/rewards.js';
import { createDraft } from '../db/tasks.js';
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

function registerAdmin(bot: Bot, deps: BotDeps): void {
  const admin = bot.filter((ctx) => ctx.from?.id === deps.config.ADMIN_ID);
  admin.command('note', async (ctx) => {
    const text = ctx.match.trim();
    if (!text) return void (await ctx.reply('Напиши так: /note текст записки'));
    await addNote(deps.db, text);
    const left = await countLocked(deps.db);
    await ctx.reply(`Записка сохранена 💌 Неоткрытых записок: ${left.notes}`);
  });
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
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith('/')) return;
    const title = text.slice(0, MAX_TITLE);
    const draft = await createDraft(deps.db, title, ctx.update.update_id);
    if (!draft) return; // повторная доставка того же update
    const buttons = NEEDS.map((need) => ({ text: NEED_LABEL[need], data: `need:${draft.id}:${need}` }));
    await ctx.reply(`Записал: «${title}» ✍️ Куда засчитаем?`, {
      reply_markup: toInlineKeyboard([buttons.slice(0, 2), buttons.slice(2)]),
    });
  });
}

export function createBot(deps: BotDeps): Bot {
  const { config } = deps;
  const bot = new Bot(config.BOT_TOKEN, { botInfo: JSON.parse(config.BOT_INFO) as UserFromGetMe });
  const allowed = new Set([config.USER_ID, config.ADMIN_ID]);

  bot.use(async (ctx, next) => {
    if (ctx.from && allowed.has(ctx.from.id)) return next();
    if (ctx.message) await ctx.reply(NOT_ALLOWED);
    else if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(INTRO, {
      reply_markup: toInlineKeyboard([[{ text: '🐶 Открыть Шантика', webApp: config.MINI_APP_URL }]]),
    });
    await ctx.api.setChatMenuButton({
      chat_id: ctx.chat.id,
      menu_button: { type: 'web_app', text: 'Шантик', web_app: { url: config.MINI_APP_URL } },
    });
  });

  registerAdmin(bot, deps);
  registerCallbacks(bot, deps);
  registerTasks(bot, deps);
  bot.catch((err) => console.error('[bot] ошибка обработки update', err.error));
  return bot;
}
```

- [ ] **Step 7: Запустить тесты и типы**

Run: `npx vitest run tests/bot && npx tsc --noEmit`
Expected: PASS. (`createBot` ← `callbacks.ts` ← `bot.ts` — циклический импорт только типа `BotDeps`; `import type` его разрешает.)

- [ ] **Step 8: Commit**

```bash
git add src/bot tests/helpers/telegram.ts tests/bot/bot.test.ts
git commit -m "feat(bot): access filter, /start, tasks from chat and admin commands"
```

---

### Task 8: Бот — callback-кнопки

**Files:**
- Modify: `src/bot/callbacks.ts` (заменить заглушку)
- Test: `tests/bot/callbacks.test.ts`

**Interfaces:**
- Consumes: `BotDeps` (Task 7); `setTaskNeed` (Task 2); `snoozeRoutine` (Task 3); `answerOpenSignals` (Task 3); `completeTask`, `completeRoutine`, `quickComplete` (Task 4); `NEED_LABEL`, `QUICK_ACTIONS`, `rewardMessages` (Task 5); `sendTo` (Task 7)
- Produces:
  - `type CallbackAction` и `parseCallback(data: string): CallbackAction | null` — формат из Task 5
  - `registerCallbacks(bot: Bot, deps: BotDeps): void`

Правила: каждое нажатие сначала вызывает `answerOpenSignals(now)`; затем действие; затем `answerCallbackQuery({ text: toast })`; затем `editMessageText(исходный текст + "\n\n" + статус)` без клавиатуры; затем отправка наград. Ошибка — `console.error` + `answerCallbackQuery` с текстом «Ой, что-то пошло не так 🐾». Снуз — только 15 или 60 минут.

- [ ] **Step 1: Написать падающие тесты — `tests/bot/callbacks.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot/bot.js';
import { parseCallback } from '../../src/bot/callbacks.js';
import { claimOutbox, getOutboxToday } from '../../src/db/outbox.js';
import { addNote } from '../../src/db/rewards.js';
import { claimRoutine, createRoutine } from '../../src/db/routines.js';
import { getPet, savePet } from '../../src/db/state.js';
import { createDraft, createTask, getTask } from '../../src/db/tasks.js';
import { testDb } from '../helpers/db.js';
import { BOT_CONFIG, USER, callbackUpdate, captureApi, methods } from '../helpers/telegram.js';

const NOW = new Date('2026-12-27T09:00:00Z');

async function setup(needs = { food: 20, walk: 85, play: 85, love: 85 }) {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: NOW, lastCompletedAt: NOW, completedTotal: 0, lastNoteDate: null });
  const bot = createBot({ config: BOT_CONFIG, db, clock: () => NOW, random: () => 0 });
  const calls = captureApi(bot);
  return { db, bot, calls };
}

describe('parseCallback', () => {
  it('разбирает все форматы и отвергает мусор', () => {
    expect(parseCallback('need:5:walk')).toEqual({ kind: 'need', taskId: 5, need: 'walk' });
    expect(parseCallback('done:7')).toEqual({ kind: 'done', taskId: 7 });
    expect(parseCallback('quick:food:1')).toEqual({ kind: 'quick', need: 'food', index: 1 });
    expect(parseCallback('later')).toEqual({ kind: 'later' });
    expect(parseCallback('rdone:3:2026-12-27')).toEqual({ kind: 'rdone', routineId: 3, date: '2026-12-27' });
    expect(parseCallback('rsnooze:3:2026-12-27:60')).toEqual({ kind: 'rsnooze', routineId: 3, date: '2026-12-27', minutes: 60 });
    expect(parseCallback('rsnooze:3:2026-12-27:5')).toBeNull();
    expect(parseCallback('need:5:cake')).toBeNull();
    expect(parseCallback('whatever')).toBeNull();
  });
});

describe('кнопки', () => {
  it('выбор потребности превращает черновик в задачу и убирает кнопки', async () => {
    const { db, bot, calls } = await setup();
    const draft = await createDraft(db, 'купить корм', 42);
    await bot.handleUpdate(callbackUpdate(USER, `need:${draft!.id}:walk`, 'Записал: «купить корм»'));
    expect((await getTask(db, draft!.id))?.need).toBe('walk');
    expect(methods(calls)).toEqual(['answerCallbackQuery', 'editMessageText']);
    expect(calls[1]?.payload.reply_markup).toBeUndefined();
  });

  it('«Сделала» засчитывает задачу один раз', async () => {
    const { db, bot, calls } = await setup();
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await bot.handleUpdate(callbackUpdate(USER, `done:${task.id}`));
    await bot.handleUpdate(callbackUpdate(USER, `done:${task.id}`));
    expect((await getPet(db)).needs.food).toBe(55);
    expect(String(calls.filter((c) => c.method === 'answerCallbackQuery')[1]?.payload.text)).toContain('Уже');
  });

  it('награда за выполнение приходит отдельным сообщением', async () => {
    const { db, bot, calls } = await setup({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    const task = await createTask(db, { title: 'вода', need: 'food', dueAt: null });
    await bot.handleUpdate(callbackUpdate(USER, `done:${task.id}`));
    expect(calls.some((c) => c.method === 'sendMessage' && String(c.payload.text).includes('ты умница'))).toBe(true);
  });

  it('любая кнопка отмечает открытые сигналы отвеченными («Позже» — только это)', async () => {
    const { db, bot } = await setup();
    await claimOutbox(db, { dedupKey: 'need:food:x', kind: 'need', need: 'food', localDate: '2026-12-27', now: NOW });
    await bot.handleUpdate(callbackUpdate(USER, 'later'));
    expect((await getOutboxToday(db, '2026-12-27'))[0]?.answeredAt).toEqual(NOW);
  });

  it('«Сделала» на сигнале без задачи создаёт и выполняет быстрое действие', async () => {
    const { db, bot } = await setup();
    await bot.handleUpdate(callbackUpdate(USER, 'quick:food:0'));
    expect((await getPet(db)).needs.food).toBe(55);
    const [task] = await db.query<{ title: string }>('SELECT title FROM tasks');
    expect(task?.title).toBe('выпить стакан воды');
  });

  it('снуз рутины переносит напоминание', async () => {
    const { db, bot } = await setup();
    const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '12:00', days: 127 });
    await claimRoutine(db, pills.id, '2026-12-27', NOW);
    await bot.handleUpdate(callbackUpdate(USER, `rsnooze:${pills.id}:2026-12-27:15`));
    const [log] = await db.query<{ snoozed_until: Date }>('SELECT snoozed_until FROM routine_log');
    expect(new Date(log!.snoozed_until)).toEqual(new Date('2026-12-27T09:15:00Z'));
  });

  it('«Сделала» на рутине засчитывает её', async () => {
    const { db, bot } = await setup();
    const pills = await createRoutine(db, { title: 'таблетки', need: 'food', time: '12:00', days: 127 });
    await claimRoutine(db, pills.id, '2026-12-27', NOW);
    await bot.handleUpdate(callbackUpdate(USER, `rdone:${pills.id}:2026-12-27`));
    expect((await getPet(db)).needs.food).toBe(55);
  });

  it('устаревшая кнопка — тост без падения', async () => {
    const { bot, calls } = await setup();
    await bot.handleUpdate(callbackUpdate(USER, 'whatever'));
    expect(calls[0]).toMatchObject({ method: 'answerCallbackQuery' });
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/bot/callbacks.test.ts`
Expected: FAIL — `parseCallback` не экспортируется (заглушка).

- [ ] **Step 3: Реализация — `src/bot/callbacks.ts`**

```ts
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

export function parseCallback(data: string): CallbackAction | null {
  const [kind, a, b, c] = data.split(':');
  const id = Number(a);
  if (kind === 'later' && a === undefined) return { kind: 'later' };
  if (kind === 'need' && Number.isInteger(id) && isNeed(b)) return { kind: 'need', taskId: id, need: b };
  if (kind === 'done' && Number.isInteger(id)) return { kind: 'done', taskId: id };
  if (kind === 'quick' && isNeed(a) && Number.isInteger(Number(b))) return { kind: 'quick', need: a, index: Number(b) };
  if (kind === 'rdone' && Number.isInteger(id) && b && DATE.test(b)) return { kind: 'rdone', routineId: id, date: b };
  if (kind === 'rsnooze' && Number.isInteger(id) && b && DATE.test(b) && (c === '15' || c === '60')) {
    return { kind: 'rsnooze', routineId: id, date: b, minutes: c === '15' ? 15 : 60 };
  }
  return null;
}

const completed = (result: CompletionResult | null): Outcome => (result ? { ...DONE, completion: result } : ALREADY);

async function perform(action: CallbackAction, deps: BotDeps, now: Date): Promise<Outcome> {
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
      return completed(await quickComplete(db, action.need, title, now));
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
      await answerOpenSignals(deps.db, now);
      const action = parseCallback(ctx.callbackQuery.data);
      if (!action) return void (await ctx.answerCallbackQuery({ text: 'Кнопка устарела 🐾' }));
      const outcome = await perform(action, deps, now);
      await ctx.answerCallbackQuery({ text: outcome.toast });
      const original = ctx.callbackQuery.message?.text ?? '';
      await ctx.editMessageText(`${original}\n\n${outcome.status}`.trim());
      const chatId = ctx.chat?.id;
      for (const message of rewardMessages(outcome.completion?.rewards ?? [])) {
        if (chatId !== undefined) await sendTo(ctx.api, chatId, message);
      }
    } catch (error) {
      console.error('[bot] ошибка callback', error);
      await ctx.answerCallbackQuery({ text: 'Ой, что-то пошло не так 🐾' }).catch(() => undefined);
    }
  });
}
```

- [ ] **Step 4: Запустить тесты и типы**

Run: `npx vitest run tests/bot && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bot/callbacks.ts tests/bot/callbacks.test.ts
git commit -m "feat(bot): callback buttons for needs, completion, snooze and later"
```

---

### Task 9: API Mini App — проверка initData и RPC

**Files:**
- Create: `src/api/initData.ts`, `src/api/rpcSchema.ts`, `src/api/rpc.ts`, `tests/helpers/initData.ts`
- Test: `tests/api/initData.test.ts`, `tests/api/rpc.test.ts`

**Interfaces:**
- Consumes: репозитории Task 2–3; `loadCurrentNeeds`, `completeTask`, `completeRoutine` (Task 4); `SettingsInput`, `parseSettings` (Task 4); `rewardMessages`, `OutgoingMessage` (Task 5); core `petState`, `localTime`, `NEEDS`
- Produces:
  - `verifyInitData(initData: string, botToken: string, now: Date, maxAgeSeconds?: number): { userId: number } | null` — HMAC: ключ `HMAC_SHA256(key="WebAppData", msg=botToken)`; строка проверки — все поля кроме `hash` (поле `signature` остаётся), отсортированные по ключу, `key=value` через `\n`; `auth_date` не старше 24 ч
  - `RpcRequest` (zod discriminatedUnion по `op`) в `rpcSchema.ts`
  - `interface RpcDeps { db: Db; botToken: string; allowedUserIds: readonly number[]; now: Date; notify: (chatId: number, messages: OutgoingMessage[]) => Promise<void>; fetchPhoto: (fileId: string) => Promise<Response> }`
  - `handleRpc(req: Request, deps: RpcDeps): Promise<Response>` — `POST`, заголовок `Authorization: tma <initData>`, тело `{ op, ... }`. Ответ `{ ok: true, data }`; 401 `{ ok: false, error: 'unauthorized' }`; 400 `'bad_request'`; 404 `'not_found'`; 500 `'internal'`. `op: 'photo'` отдаёт бинарный ответ `fetchPhoto`.

Операции и ответы (`data`):
- `state` → `{ needs, mood, settings, tasks: Task[] (первые 3 открытые), routinesToday: { id, title, time, need, done }[] }`; `needs` округлены вниз; `mood` = `petState`
- `tasks.list` → `Task[]` (открытые + выполненные с начала локального дня)
- `tasks.create { title, need, dueAt? }` → `Task`; `tasks.update { id, title?, need?, dueAt? }` → `Task`; `tasks.delete { id }` → `{ deleted: true }`
- `tasks.complete { id }` / `routines.complete { id }` → `{ completed: boolean, needs }`; награды уходят в чат через `notify(userId, rewardMessages(...))`
- `routines.list` → `RoutineRecord[]`; `routines.create { title, need, time, days }`; `routines.update { id, title?, need?, time?, days?, active? }`; `routines.delete { id }`
- `settings.get` → `Settings`; `settings.update { settings }` → `Settings`
- `rewards.list` → `{ notes: { id, text, unlockedAt }[], photos: { id, caption, unlockedAt }[], lockedPhotos, nextPhotoIn }`
- `photo { id }` → изображение (только открытое фото)

- [ ] **Step 1: Помощник подписи — `tests/helpers/initData.ts`**

Независимая от реализации подпись по документации Telegram (тест не должен копировать проверяемый код):

```ts
import { createHmac } from 'node:crypto';

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(checkString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function initDataFor(userId: number, botToken: string, authDate: Date): string {
  return signInitData(
    {
      auth_date: String(Math.floor(authDate.getTime() / 1000)),
      query_id: 'AAH',
      signature: 'ed25519-signature-stays-in-check-string',
      user: JSON.stringify({ id: userId, first_name: 'Тест' }),
    },
    botToken,
  );
}
```

- [ ] **Step 2: Написать падающие тесты**

`tests/api/initData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../../src/api/initData.js';
import { initDataFor, signInitData } from '../helpers/initData.js';

const TOKEN = '123456:TEST_TOKEN_ABCDEFGHIJKLMNOP';
const NOW = new Date('2026-12-27T09:00:00Z');

describe('verifyInitData', () => {
  it('принимает корректную подпись (с полем signature) и возвращает user.id', () => {
    expect(verifyInitData(initDataFor(111, TOKEN, NOW), TOKEN, NOW)).toEqual({ userId: 111 });
  });

  it('отвергает подпись другим токеном', () => {
    expect(verifyInitData(initDataFor(111, 'other:TOKEN', NOW), TOKEN, NOW)).toBeNull();
  });

  it('отвергает изменённые данные', () => {
    const tampered = initDataFor(111, TOKEN, NOW).replace('111', '222');
    expect(verifyInitData(tampered, TOKEN, NOW)).toBeNull();
  });

  it('отвергает данные старше 24 часов', () => {
    const old = new Date(NOW.getTime() - 25 * 3_600_000);
    expect(verifyInitData(initDataFor(111, TOKEN, old), TOKEN, NOW)).toBeNull();
  });

  it('отвергает строку без hash и без user', () => {
    expect(verifyInitData('auth_date=1', TOKEN, NOW)).toBeNull();
    const noUser = signInitData({ auth_date: String(Math.floor(NOW.getTime() / 1000)) }, TOKEN);
    expect(verifyInitData(noUser, TOKEN, NOW)).toBeNull();
  });
});
```

`tests/api/rpc.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { handleRpc, type RpcDeps } from '../../src/api/rpc.js';
import type { Db } from '../../src/db/client.js';
import { addNote, addPhoto, unlockOldest } from '../../src/db/rewards.js';
import { getSettings, savePet } from '../../src/db/state.js';
import { testDb } from '../helpers/db.js';
import { initDataFor } from '../helpers/initData.js';

const TOKEN = '123456:TEST_TOKEN_ABCDEFGHIJKLMNOP';
const NOW = new Date('2026-12-27T09:00:00Z'); // 12:00 МСК
const USER = 111;

async function setup(needs = { food: 20.7, walk: 85, play: 85, love: 85 }) {
  const db = await testDb();
  await savePet(db, { needs, updatedAt: NOW, lastCompletedAt: NOW, completedTotal: 0, lastNoteDate: null });
  const notify = vi.fn(async () => undefined);
  const fetchPhoto = vi.fn(async () => new Response('IMG', { headers: { 'content-type': 'image/jpeg' } }));
  const deps: RpcDeps = { db, botToken: TOKEN, allowedUserIds: [USER, 222], now: NOW, notify, fetchPhoto };
  return { db, deps, notify, fetchPhoto };
}

function call(deps: RpcDeps, body: unknown, auth = `tma ${initDataFor(USER, TOKEN, NOW)}`) {
  const req = new Request('https://x/api/app', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleRpc(req, deps);
}

async function data<T = any>(res: Response): Promise<T> {
  const json = (await res.json()) as { ok: boolean; data: T };
  expect(json.ok).toBe(true);
  return json.data;
}

async function count(db: Db, table: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return row?.n ?? 0;
}

describe('авторизация', () => {
  it('без заголовка, с поддельной подписью и с чужим user.id — 401, ничего не меняется', async () => {
    const { db, deps } = await setup();
    const create = { op: 'tasks.create', title: 'x', need: 'food' };
    expect((await call(deps, create, '')).status).toBe(401);
    expect((await call(deps, create, `tma ${initDataFor(USER, 'other:TOKEN', NOW)}`)).status).toBe(401);
    expect((await call(deps, create, `tma ${initDataFor(999, TOKEN, NOW)}`)).status).toBe(401);
    expect(await count(db, 'tasks')).toBe(0);
  });

  it('некорректное тело — 400', async () => {
    const { deps } = await setup();
    expect((await call(deps, { op: 'tasks.create', title: '', need: 'food' })).status).toBe(400);
    expect((await call(deps, { op: 'nope' })).status).toBe(400);
  });
});

describe('операции', () => {
  it('state — шкалы округлены вниз, настроение и рутины дня', async () => {
    const { deps } = await setup();
    await call(deps, { op: 'routines.create', title: 'таблетки', need: 'food', time: '20:00', days: 127 });
    const state = await data(await call(deps, { op: 'state' }));
    expect(state.needs).toEqual({ food: 20, walk: 85, play: 85, love: 85 });
    expect(state.mood).toEqual({ kind: 'asking', need: 'food' });
    expect(state.routinesToday).toMatchObject([{ title: 'таблетки', time: '20:00', done: false }]);
  });

  it('задачи: создать, изменить, выполнить один раз, удалить', async () => {
    const { deps } = await setup();
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food' }));
    const updated = await data(await call(deps, { op: 'tasks.update', id: task.id, title: 'выпить воды' }));
    expect(updated.title).toBe('выпить воды');
    expect(await data(await call(deps, { op: 'tasks.complete', id: task.id }))).toMatchObject({ completed: true });
    expect(await data(await call(deps, { op: 'tasks.complete', id: task.id }))).toMatchObject({ completed: false });
    const list = await data(await call(deps, { op: 'tasks.list' }));
    expect(list).toHaveLength(1);
    expect(await data(await call(deps, { op: 'tasks.delete', id: task.id }))).toEqual({ deleted: true });
    expect((await call(deps, { op: 'tasks.update', id: task.id, title: 'нет' })).status).toBe(404);
  });

  it('награда за выполнение уходит в чат пользователя', async () => {
    const { db, deps, notify } = await setup({ food: 50, walk: 90, play: 90, love: 90 });
    await addNote(db, 'ты умница');
    const task = await data(await call(deps, { op: 'tasks.create', title: 'вода', need: 'food' }));
    await call(deps, { op: 'tasks.complete', id: task.id });
    expect(notify).toHaveBeenCalledWith(USER, [expect.objectContaining({ text: expect.stringContaining('ты умница') })]);
  });

  it('рутины: создать, выполнить за сегодня один раз', async () => {
    const { deps } = await setup();
    const routine = await data(await call(deps, { op: 'routines.create', title: 'таблетки', need: 'food', time: '20:00', days: 127 }));
    expect(await data(await call(deps, { op: 'routines.complete', id: routine.id }))).toMatchObject({ completed: true });
    expect(await data(await call(deps, { op: 'routines.complete', id: routine.id }))).toMatchObject({ completed: false });
    expect(await data(await call(deps, { op: 'routines.list' }))).toHaveLength(1);
  });

  it('настройки: неверные тихие часы — 400, верные сохраняются', async () => {
    const { db, deps } = await setup();
    const bad = { timezone: 'Europe/Moscow', quiet: { start: '02:00', end: '09:00' } };
    expect((await call(deps, { op: 'settings.update', settings: bad })).status).toBe(400);
    const good = { timezone: 'Europe/Moscow', quiet: { start: '22:00', end: '08:00' } };
    await call(deps, { op: 'settings.update', settings: good });
    expect(await getSettings(db)).toEqual(good);
  });

  it('фото: закрытое — 404, открытое — проксируется через fetchPhoto', async () => {
    const { db, deps, fetchPhoto } = await setup();
    const photo = await addPhoto(db, 'FILE_1', 'море');
    expect((await call(deps, { op: 'photo', id: photo.id })).status).toBe(404);
    await unlockOldest(db, 'photo', NOW);
    const res = await call(deps, { op: 'photo', id: photo.id });
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchPhoto).toHaveBeenCalledWith('FILE_1');
    const rewards = await data(await call(deps, { op: 'rewards.list' }));
    expect(rewards).toMatchObject({ photos: [{ id: photo.id, caption: 'море' }], lockedPhotos: 0, nextPhotoIn: 10 });
  });
});
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run tests/api`
Expected: FAIL — модулей `initData.js` / `rpc.js` нет (тест `tick` из Task 6 зелёный).

- [ ] **Step 4: Реализация — `src/api/initData.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const DAY_SECONDS = 86_400;

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function userIdOf(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const id = (JSON.parse(raw) as { id?: unknown }).id;
    return typeof id === 'number' && Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function verifyInitData(
  initData: string,
  botToken: string,
  now: Date,
  maxAgeSeconds = DAY_SECONDS,
): { userId: number } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (!sameHex(expected, hash)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now.getTime() / 1000 - authDate > maxAgeSeconds) return null;
  const userId = userIdOf(params.get('user'));
  return userId === null ? null : { userId };
}
```

- [ ] **Step 5: Реализация — `src/api/rpcSchema.ts`**

```ts
import { z } from 'zod';
import { NEEDS } from '../core/types.js';
import { SettingsInput } from '../services/settings.js';

const Need = z.enum(NEEDS);
const Title = z.string().trim().min(1).max(200);
const Id = z.number().int().positive();
const DueAt = z.iso.datetime({ offset: true }).nullable();
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Days = z.number().int().min(1).max(127);
const op = <T extends string>(name: T) => z.literal(name);

export const RpcRequest = z.discriminatedUnion('op', [
  z.object({ op: op('state') }),
  z.object({ op: op('tasks.list') }),
  z.object({ op: op('tasks.create'), title: Title, need: Need, dueAt: DueAt.optional() }),
  z.object({ op: op('tasks.update'), id: Id, title: Title.optional(), need: Need.optional(), dueAt: DueAt.optional() }),
  z.object({ op: op('tasks.delete'), id: Id }),
  z.object({ op: op('tasks.complete'), id: Id }),
  z.object({ op: op('routines.list') }),
  z.object({ op: op('routines.create'), title: Title, need: Need, time: Time, days: Days }),
  z.object({
    op: op('routines.update'),
    id: Id,
    title: Title.optional(),
    need: Need.optional(),
    time: Time.optional(),
    days: Days.optional(),
    active: z.boolean().optional(),
  }),
  z.object({ op: op('routines.delete'), id: Id }),
  z.object({ op: op('routines.complete'), id: Id }),
  z.object({ op: op('settings.get') }),
  z.object({ op: op('settings.update'), settings: SettingsInput }),
  z.object({ op: op('rewards.list') }),
  z.object({ op: op('photo'), id: Id }),
]);

export type RpcRequest = z.infer<typeof RpcRequest>;
```

- [ ] **Step 6: Реализация — `src/api/rpc.ts`**

```ts
import { ZodError } from 'zod';
import { petState } from '../core/mood.js';
import { localTime } from '../core/time.js';
import { NEEDS, type Needs } from '../core/types.js';
import type { Db } from '../db/client.js';
import { countLocked, getUnlockedPhoto, listUnlocked } from '../db/rewards.js';
import { createRoutine, deleteRoutine, getRoutineLog, listRoutines, updateRoutine } from '../db/routines.js';
import { getSettings, saveSettings } from '../db/state.js';
import { createTask, deleteTask, listOpenTasks, listTasksSince, updateTask } from '../db/tasks.js';
import { completeRoutine, completeTask, loadCurrentNeeds, type CompletionResult } from '../services/completion.js';
import { rewardMessages, type OutgoingMessage } from '../services/messages.js';
import { parseSettings } from '../services/settings.js';
import { verifyInitData } from './initData.js';
import { RpcRequest } from './rpcSchema.js';

export interface RpcDeps {
  db: Db;
  botToken: string;
  allowedUserIds: readonly number[];
  now: Date;
  notify: (chatId: number, messages: OutgoingMessage[]) => Promise<void>;
  fetchPhoto: (fileId: string) => Promise<Response>;
}

class NotFound extends Error {}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });
const floorNeeds = (needs: Needs): Needs =>
  Object.fromEntries(NEEDS.map((need) => [need, Math.floor(needs[need])])) as Needs;
const found = <T>(value: T | null): T => {
  if (value === null) throw new NotFound();
  return value;
};

async function state(deps: RpcDeps): Promise<unknown> {
  const { needs, settings } = await loadCurrentNeeds(deps.db, deps.now);
  const local = localTime(deps.now, settings.timezone);
  const [tasks, routines, log] = await Promise.all([
    listOpenTasks(deps.db),
    listRoutines(deps.db),
    getRoutineLog(deps.db, local.date),
  ]);
  const routinesToday = routines
    .filter((r) => r.active && (r.days & (1 << local.weekday)) !== 0)
    .map((r) => ({ id: r.id, title: r.title, time: r.time, need: r.need, done: log.some((e) => e.routineId === r.id && e.doneAt) }));
  return { needs: floorNeeds(needs), mood: petState(needs, local.minutes, settings.quiet), settings, tasks: tasks.slice(0, 3), routinesToday };
}

async function finish(deps: RpcDeps, userId: number, result: CompletionResult | null): Promise<unknown> {
  if (result) await deps.notify(userId, rewardMessages(result.rewards));
  const { needs } = await loadCurrentNeeds(deps.db, deps.now);
  return { completed: result !== null, needs: floorNeeds(needs) };
}

async function rewards(deps: RpcDeps): Promise<unknown> {
  const [unlocked, locked, { pet }] = await Promise.all([
    listUnlocked(deps.db),
    countLocked(deps.db),
    loadCurrentNeeds(deps.db, deps.now),
  ]);
  const pick = (kind: 'note' | 'photo') => unlocked.filter((r) => r.kind === kind);
  return {
    notes: pick('note').map((r) => ({ id: r.id, text: r.text, unlockedAt: r.unlockedAt })),
    photos: pick('photo').map((r) => ({ id: r.id, caption: r.text, unlockedAt: r.unlockedAt })),
    lockedPhotos: locked.photos,
    nextPhotoIn: 10 - (pet.completedTotal % 10),
  };
}

async function today(deps: RpcDeps): Promise<{ date: string; since: Date }> {
  const { timezone } = await getSettings(deps.db);
  const local = localTime(deps.now, timezone);
  // ponytail: начало локального дня без учёта перехода на летнее время (для МСК неважно)
  const since = new Date(deps.now.getTime() - local.minutes * 60_000 - (deps.now.getTime() % 60_000));
  return { date: local.date, since };
}

async function dispatch(request: RpcRequest, deps: RpcDeps, userId: number): Promise<unknown> {
  const { db, now } = deps;
  const dueAt = (value: string | null | undefined) => (value === undefined ? undefined : value === null ? null : new Date(value));
  switch (request.op) {
    case 'state': return state(deps);
    case 'tasks.list': return listTasksSince(db, (await today(deps)).since);
    case 'tasks.create': return createTask(db, { title: request.title, need: request.need, dueAt: dueAt(request.dueAt) ?? null });
    case 'tasks.update': {
      const { id, op: _op, dueAt: rawDue, ...patch } = request;
      return found(await updateTask(db, id, rawDue === undefined ? patch : { ...patch, dueAt: dueAt(rawDue) ?? null }));
    }
    case 'tasks.delete': return found((await deleteTask(db, request.id)) ? { deleted: true } : null);
    case 'tasks.complete': return finish(deps, userId, await completeTask(db, request.id, now));
    case 'routines.list': return listRoutines(db);
    case 'routines.create': return createRoutine(db, request);
    case 'routines.update': {
      const { id, op: _op, ...patch } = request;
      return found(await updateRoutine(db, id, patch));
    }
    case 'routines.delete': return found((await deleteRoutine(db, request.id)) ? { deleted: true } : null);
    case 'routines.complete': return finish(deps, userId, await completeRoutine(db, request.id, (await today(deps)).date, now));
    case 'settings.get': return getSettings(db);
    case 'settings.update': {
      const settings = parseSettings(request.settings);
      await saveSettings(db, settings);
      return settings;
    }
    case 'rewards.list': return rewards(deps);
    case 'photo': return found(await getUnlockedPhoto(db, request.id));
  }
}

export async function handleRpc(req: Request, deps: RpcDeps): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const verified = auth.startsWith('tma ') ? verifyInitData(auth.slice(4), deps.botToken, deps.now) : null;
  if (!verified || !deps.allowedUserIds.includes(verified.userId)) return fail(401, 'unauthorized');

  try {
    const request = RpcRequest.parse(await req.json());
    const result = await dispatch(request, deps, verified.userId);
    if (request.op === 'photo') {
      const fileId = (result as { fileId: string | null }).fileId;
      return fileId ? deps.fetchPhoto(fileId) : fail(404, 'not_found');
    }
    return Response.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return fail(400, 'bad_request');
    if (error instanceof NotFound) return fail(404, 'not_found');
    console.error('[rpc] ошибка', error);
    return fail(500, 'internal');
  }
}
```

> Если `rpc.ts` с форматированием превысит ~200 строк — вынести `state`, `rewards`, `today`, `finish` в `src/api/rpcQueries.ts` (тот же код, отдельный файл). Поведение и экспорты `rpc.ts` не меняются.

- [ ] **Step 7: Запустить тесты и типы**

Run: `npx vitest run tests/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api tests/api tests/helpers/initData.ts
git commit -m "feat(api): initData verification and Mini App RPC"
```

---

### Task 10: Vercel-функции, скрипты деплоя, документация

**Files:**
- Create: `api/bot.ts`, `api/tick.ts`, `api/app.ts`, `vercel.json`, `scripts/migrate.mjs`, `scripts/set-webhook.mjs`
- Modify: `tsconfig.json` (`include` + `"api"`), `package.json` (scripts), `CLAUDE.md` (раздел «Стек»: добавить команды)
- Test: `npx tsc --noEmit` (функции — тонкие обёртки над протестированными `handleTick` / `handleRpc` / `createBot`)

**Interfaces:**
- Consumes: `loadConfig`, `neonDb`, `createBot`, `telegramSender`, `sendTo`, `runTick`, `handleTick`, `handleRpc`
- Produces: Vercel-эндпоинты `POST /api/bot`, `GET|POST /api/tick`, `POST /api/app`; `npm run db:migrate`, `npm run bot:webhook`

- [ ] **Step 1: `api/bot.ts`**

```ts
import { webhookCallback } from 'grammy';
import { createBot } from '../src/bot/bot.js';
import { loadConfig } from '../src/config.js';
import { neonDb } from '../src/db/client.js';

const config = loadConfig(process.env);
const bot = createBot({ config, db: neonDb(config.DATABASE_URL), clock: () => new Date(), random: Math.random });
const handle = webhookCallback(bot, 'std/http', { secretToken: config.WEBHOOK_SECRET, onTimeout: 'return' });

export function POST(req: Request): Promise<Response> {
  return handle(req);
}
```

- [ ] **Step 2: `api/tick.ts`**

```ts
import { Api } from 'grammy';
import { handleTick } from '../src/api/tick.js';
import { telegramSender } from '../src/bot/telegram.js';
import { loadConfig } from '../src/config.js';
import { neonDb } from '../src/db/client.js';
import { runTick } from '../src/services/tick.js';

const config = loadConfig(process.env);
const db = neonDb(config.DATABASE_URL);
const send = telegramSender(new Api(config.BOT_TOKEN), config.USER_ID);

function run() {
  return runTick({ db, send, now: new Date(), random: Math.random, miniAppUrl: config.MINI_APP_URL });
}

export function GET(req: Request): Promise<Response> {
  return handleTick(req, { secret: config.TICK_SECRET, run });
}

export const POST = GET;
```

- [ ] **Step 3: `api/app.ts`**

```ts
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
```

- [ ] **Step 4: `vercel.json`**

```json
{
  "regions": ["fra1"]
}
```

- [ ] **Step 5: `scripts/migrate.mjs`**

```js
// Применяет db/schema.sql к DATABASE_URL. Запуск: npm run db:migrate
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL не задан (см. .env.example)');

const sql = neon(url);
const statements = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
console.log(`Схема применена: ${statements.length} выражений`);
```

- [ ] **Step 6: `scripts/set-webhook.mjs`**

```js
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
```

- [ ] **Step 7: `package.json` scripts и `tsconfig.json`**

В `package.json` → `scripts` добавить:

```json
"db:migrate": "node --env-file=.env scripts/migrate.mjs",
"bot:webhook": "node --env-file=.env scripts/set-webhook.mjs"
```

В `tsconfig.json` → `include`: `["src", "tests", "api", "vitest.config.ts"]`.

Добавить `BASE_URL=` в `.env.example`.

- [ ] **Step 8: `CLAUDE.md` — в раздел «Стек» добавить строки**

```
- Команды: `npm test`, `npm run typecheck`, `npm run db:migrate`, `npm run bot:webhook`
- Слои сервера: `api/*.ts` (Vercel) → `src/api`, `src/bot` → `src/services` → `src/db`, `src/core`
```

- [ ] **Step 9: Проверка**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 ошибок типов, все тесты зелёные.

Run: `grep -rnE "new Date\(\)|Math\.random" src || echo clean`
Expected: `clean` (время и случайность только в `api/*.ts`).

- [ ] **Step 10: Commit**

```bash
git add api vercel.json scripts package.json tsconfig.json .env.example CLAUDE.md
git commit -m "feat(deploy): Vercel functions, migrate and webhook scripts"
```

