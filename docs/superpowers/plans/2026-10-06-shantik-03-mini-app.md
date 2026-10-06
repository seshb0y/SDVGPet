# Шантик — Mini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram Mini App в `web/`: SVG-Шантик в текущем состоянии, шкалы, задачи и рутины, сокровища, настройки — поверх готового RPC `/api/app`.

**Architecture:** Отдельное Vite + React приложение в `web/` (корень Vite), собирается в `web/dist` и раздаётся Vercel как статика рядом с `api/`. Вся логика без DOM (выражение Шантика, фразы, дни недели, время, ближайшие дела, тексты ошибок, HTTP-клиент) — чистые модули с тестами vitest; компоненты тонкие и проверяются в браузере 390×844. В dev-режиме вне Telegram (`initData` пустая) приложение работает на in-memory заглушке API.

**Tech Stack:** React 19, Vite, TypeScript 5.9, vitest 5; Telegram WebApp SDK (`telegram-web-app.js`). Без UI-китов, роутера и стейт-менеджеров.

**Spec:** `docs/superpowers/specs/2026-10-05-shantik-design.md` (раздел 3 — Mini App; раздел 2 — состояния и награды)

## Global Constraints

- Сервер (`src/`, `api/`, `db/`) в этом плане не меняется. Mini App ходит только в `POST /api/app` с заголовком `Authorization: tma <initData>` и телом `{ op, ... }`; ответ `{ ok: true, data }` / `{ ok: false, error }`.
- Три вкладки внизу: «🐶 Шантик», «✅ Задачи», «🎁 Сокровища». Шестерёнка на вкладке Шантика открывает настройки (тихие часы, часовой пояс).
- При старте `Telegram.WebApp.ready()` и `expand()`. Высота — `var(--tg-viewport-stable-height)`, не `100vh`. Отступы — `var(--tg-safe-area-inset-*)` и `var(--tg-content-safe-area-inset-*)`.
- Выполнение задачи или рутины — `HapticFeedback.notificationOccurred('success')` и состояние `celebrating` на 2,5 с.
- Часовой пояс при первом открытии — из `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Удаление: свайп влево по строке И кнопка «Удалить» в окне редактирования.
- Шкалы с сервера уже округлены вниз; шкала < 30 подсвечивается как низкая.
- Шантик: плоская kawaii-иллюстрация, один SVG из деталей; приметы — кремово-белый, рыжие уши и спина, тёмные глаза-бусинки, чёрный нос, пышная грива, язык наружу в радости; предмет-подсказка в `asking`: миска / поводок / мячик / сердечко; анимации — CSS.
- Палитра (из утверждённого каркаса): фон `#fdf6ec`, карточки `#ffffff`, акцент `#e8892c`, рыжий `#e8a25c`, низкая шкала `#e8697a`, текст `#333333`, вторичный `#999999`, линии `#eadfcd`.
- Все тексты на русском; никаких стыдящих формулировок, счётчиков пропусков, «сгоревших» стриков.
- Новые зависимости только: `react`, `react-dom` (dependencies); `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` (devDependencies).
- Токен бота никогда не попадает в клиент; фото грузятся через `op: 'photo'` как Blob.
- Чистые модули `web/src/lib/*`, `web/src/pet/expression.ts`, `web/src/pet/phrases.ts`, `web/src/api/client.ts` не используют DOM, `Date.now()` и `Math.random()` — время и «случайность» передаются аргументами.
- Файлы до ~200 строк. Тесты Mini App лежат рядом с кодом: `web/src/**/*.test.ts`.

## Review Focus

- **Mini App открыли не из бота или `initData` протухла** (401): вместо пустого экрана — понятный текст «Открой Шантика из чата с ботом 🐾». Тест `errorText` в Task 2.
- **Двойной тап по кружку выполнения**: второй тап не уходит, пока первый не завершился (строка в состоянии pending). Проверка в браузере в Task 8; сервер всё равно засчитает один раз.
- **Очень длинное название задачи** (до 200 символов) не ломает строку и не вылезает за экран. Проверка в браузере в Task 8.
- **Сервер отверг тихие часы** (400): в настройках показывается правило «начало 20:00–00:00, конец 05:00–12:00», окно не закрывается. Тест `errorText` с контекстом `settings` в Task 2.
- **Фото не загрузилось** (Telegram недоступен): плитка показывает заглушку, а не битую картинку. Код в Task 6, проверка в браузере в Task 8 (заглушка API отдаёт ошибку для фото с id 999).

---

## File Structure

```
web/
  index.html                  подключает telegram-web-app.js и main.tsx
  vite.config.ts              root = web/, outDir = web/dist
  tsconfig.json               DOM + Bundler-резолв, проверка всего web/
  src/
    main.tsx                  старт: Telegram ready/expand, рендер App
    telegram.ts               доступ к WebApp: initData, haptic, dev safe area
    styles.css                токены палитры, раскладка, листы, строки
    App.tsx                   вкладки, загрузка состояния, выполнение, празднование
    useTimezoneSync.ts        часовой пояс устройства при первом открытии
    api/
      types.ts                формы данных RPC + интерфейс Api
      client.ts               httpApi(initData, fetch) → Api; ApiError
      errors.ts               errorText(error, context) — русские тексты ошибок
      mock.ts                 mockApi() — in-memory Api для dev вне Telegram
      index.ts                createApi(): http или mock
    pet/
      expression.ts           expressionFor(mood, celebrating) → детали Шантика
      phrases.ts              speechFor(mood, celebrating, seed)
      Shantik.tsx             SVG из деталей
      shantik.css             анимации
    lib/
      needs.ts                NEED_EMOJI, NEED_LABEL
      days.ts                 DAY_SHORT, toggleDay, daysLabel
      time.ts                 dueAtToday, timeOf
      nearest.ts              nearest(state) — 2–3 ближайших дела
      plural.ts               pluralRu
    ui/
      Sheet.tsx               нижний лист (модалка)
      Segmented.tsx           переключатель «Сегодня / Рутины» и т.п.
      NeedPicker.tsx          4 кнопки потребностей
      ItemRow.tsx             строка с кружком выполнения
      SwipeRow.tsx            свайп влево → кнопка «Удалить»
    tabs/
      PetTab.tsx              Шантик, реплика, шкалы, ближайшее, шестерёнка
      NeedBars.tsx            4 шкалы
      SettingsSheet.tsx       тихие часы и часовой пояс
      TasksTab.tsx            «Сегодня / Рутины», FAB «+»
      TaskEditor.tsx          лист разовой задачи
      RoutineEditor.tsx       лист рутины
      TreasuresTab.tsx        «Записки / Альбом»
      PhotoTile.tsx           фото через api.photo → objectURL
```

Изменяются: `package.json` (зависимости, скрипты), `vitest.config.ts` (include), `.gitignore` (`web/dist/`), `vercel.json` (сборка), `CLAUDE.md` (команды).

---

### Task 1: Каркас Vite + React, мост к Telegram, базовые стили

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/src/main.tsx`, `web/src/App.tsx` (временный, заменяется в Task 7), `web/src/telegram.ts`, `web/src/styles.css`
- Modify: `package.json`, `vitest.config.ts`, `.gitignore`

**Interfaces:**
- Produces:
  - `initTelegram(): void` — `ready()` + `expand()`, если SDK есть; в dev без `initData` — выставляет CSS-переменные safe area как у iPhone
  - `getInitData(): string` — строка `initData` или `''`
  - `isDevPreview(): boolean` — `import.meta.env.DEV && getInitData() === ''`
  - `hapticSuccess(): void`
  - npm-скрипты `dev:web`, `build:web`, `typecheck` (сервер + web)
  - CSS-классы из `styles.css` (используются всеми последующими задачами): `.app`, `.screen`, `.screen-title`, `.tabbar`, `.tab`, `.tab--on`, `.card`, `.muted`, `.section-label`, `.fab`, `.btn`, `.btn--primary`, `.btn--danger`, `.input`, `.field`, `.error`, `.empty`

- [ ] **Step 1: Зависимости**

```bash
npm i react react-dom
npm i -D vite @vitejs/plugin-react @types/react @types/react-dom
```

- [ ] **Step 2: Скрипты, тесты, игнор — `package.json`, `vitest.config.ts`, `.gitignore`**

В `package.json` → `scripts` заменить `typecheck` и добавить два скрипта:

```json
"typecheck": "tsc --noEmit && tsc --noEmit -p web",
"dev:web": "vite --config web/vite.config.ts",
"build:web": "vite build --config web/vite.config.ts"
```

В `vitest.config.ts` в `test.include` добавить `'web/src/**/*.test.ts'`, остальные опции сохранить. Итог:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'web/src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

В `.gitignore` добавить строку `web/dist/`.

- [ ] **Step 3: `web/vite.config.ts` и `web/tsconfig.json`**

```ts
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: `web/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>Шантик</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `web/src/telegram.ts`**

```ts
interface WebApp {
  initData: string;
  ready(): void;
  expand(): void;
  HapticFeedback?: { notificationOccurred(type: 'success' | 'error' | 'warning'): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

/** Как у iPhone 15/16 — чтобы в браузере видеть раскладку с вырезом и полоской. */
const DEV_SAFE_AREA: Record<string, string> = {
  '--tg-safe-area-inset-top': '47px',
  '--tg-safe-area-inset-bottom': '34px',
  '--tg-content-safe-area-inset-top': '0px',
  '--tg-content-safe-area-inset-bottom': '0px',
};

const webApp = (): WebApp | undefined => window.Telegram?.WebApp;

export function getInitData(): string {
  return webApp()?.initData ?? '';
}

export function isDevPreview(): boolean {
  return import.meta.env.DEV && getInitData() === '';
}

export function initTelegram(): void {
  webApp()?.ready();
  webApp()?.expand();
  if (!isDevPreview()) return;
  for (const [name, value] of Object.entries(DEV_SAFE_AREA)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export function hapticSuccess(): void {
  webApp()?.HapticFeedback?.notificationOccurred('success');
}
```

- [ ] **Step 6: `web/src/styles.css`**

```css
:root {
  --bg: #fdf6ec;
  --card: #ffffff;
  --accent: #e8892c;
  --fur: #e8a25c;
  --low: #e8697a;
  --text: #333333;
  --muted: #999999;
  --line: #eadfcd;
  --track: #eee3d2;
  --top: calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px));
  --bottom: calc(var(--tg-safe-area-inset-bottom, 0px) + var(--tg-content-safe-area-inset-bottom, 0px));
  color-scheme: light;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 15px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent;
}

button { font: inherit; color: inherit; cursor: pointer; }

.app {
  height: var(--tg-viewport-stable-height, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.screen {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--top) + 8px) 16px 96px;
}

.screen-title {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-weight: 600;
  font-size: 17px;
  margin: 4px 0 8px;
}

.tabbar {
  display: flex;
  background: var(--card);
  border-top: 1px solid var(--line);
  padding-bottom: var(--bottom);
}

.tab {
  flex: 1;
  border: 0;
  background: none;
  padding: 10px 0;
  font-size: 13px;
  color: var(--muted);
}

.tab--on { color: var(--accent); font-weight: 600; }

.card {
  background: var(--card);
  border-radius: 12px;
  padding: 10px 12px;
  margin: 6px 0;
}

.muted { color: var(--muted); font-size: 13px; }

.section-label {
  margin: 14px 0 4px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.fab {
  position: fixed;
  right: 20px;
  bottom: calc(var(--bottom) + 64px);
  width: 52px;
  height: 52px;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 28px;
  box-shadow: 0 4px 12px rgb(232 137 44 / 0.35);
}

.btn {
  border: 0;
  border-radius: 12px;
  padding: 12px 16px;
  background: var(--track);
  font-weight: 600;
}

.btn--primary { background: var(--accent); color: #fff; }
.btn--danger { background: none; color: var(--low); }
.btn:disabled { opacity: 0.5; }

.field { display: block; margin: 10px 0; }
.field > span { display: block; margin-bottom: 4px; color: var(--muted); font-size: 13px; }

.input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--card);
  font: inherit;
}

.error { color: var(--low); font-size: 13px; margin: 8px 0; }
.empty { text-align: center; color: var(--muted); margin: 24px 8px; }
```

- [ ] **Step 7: `web/src/main.tsx` и временный `web/src/App.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { initTelegram } from './telegram';

initTelegram();

const root = document.getElementById('root');
if (!root) throw new Error('Нет #root в index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```tsx
export function App() {
  return (
    <div className="app">
      <main className="screen">
        <div className="screen-title">Шантик</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Проверка**

Run: `npm run typecheck && npm run build:web && npx vitest run`
Expected: обе проверки типов без ошибок; создан `web/dist/index.html`; серверные тесты зелёные; `git status --short` не показывает `web/dist/`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore web
git commit -m "feat(web): Vite + React scaffold and Telegram bridge"
```

---

### Task 2: API Mini App — типы, HTTP-клиент, тексты ошибок, dev-заглушка

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`, `web/src/api/errors.ts`, `web/src/api/mock.ts`, `web/src/api/index.ts`, `web/src/lib/needs.ts`
- Test: `web/src/api/client.test.ts`, `web/src/api/errors.test.ts`

**Interfaces:**
- Consumes: `getInitData`, `isDevPreview` (Task 1); типы `Need`, `Needs`, `Settings` из `src/core/types.ts`, `PetState` из `src/core/mood.ts` (только `import type`); значение `NEEDS` из `src/core/types.ts`
- Produces:
  - Типы `Task`, `Routine`, `RoutineToday`, `AppState`, `CompleteResult`, `Rewards`, `TaskInput`, `RoutineInput`, `RoutinePatch`, интерфейс `Api` (см. код); реэкспорт `Need`, `Needs`, `PetState`, `Settings`
  - `class ApiError extends Error { status: number; code: string }`
  - `httpApi(initData: string, fetchImpl?: FetchLike): Api`
  - `errorText(error: unknown, context?: 'settings'): string`
  - `mockApi(): Api`
  - `createApi(): Promise<Api>`
  - `NEED_EMOJI: Record<Need, string>`, `NEED_LABEL: Record<Need, string>`

- [ ] **Step 1: `web/src/api/types.ts`**

```ts
import type { PetState } from '../../../src/core/mood';
import type { Need, Needs, Settings } from '../../../src/core/types';

export type { Need, Needs, PetState, Settings };

export interface Task {
  id: number;
  title: string;
  need: Need | null;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
}

export interface Routine {
  id: number;
  title: string;
  need: Need;
  time: string;
  /** Битовая маска: бит 0 = понедельник … бит 6 = воскресенье. */
  days: number;
  active: boolean;
}

export interface RoutineToday {
  id: number;
  title: string;
  time: string;
  need: Need;
  done: boolean;
}

export interface AppState {
  needs: Needs;
  mood: PetState;
  settings: Settings;
  tasks: Task[];
  routinesToday: RoutineToday[];
}

export interface CompleteResult {
  completed: boolean;
  needs: Needs;
}

export interface Rewards {
  notes: { id: number; text: string | null; unlockedAt: string }[];
  photos: { id: number; caption: string | null; unlockedAt: string }[];
  lockedPhotos: number;
  nextPhotoIn: number;
}

export interface TaskInput {
  title: string;
  need: Need;
  dueAt?: string | null;
}

export interface RoutineInput {
  title: string;
  need: Need;
  time: string;
  days: number;
}

export type RoutinePatch = Partial<RoutineInput & { active: boolean }>;

export interface Api {
  state(): Promise<AppState>;
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: number, patch: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  completeTask(id: number): Promise<CompleteResult>;
  listRoutines(): Promise<Routine[]>;
  createRoutine(input: RoutineInput): Promise<Routine>;
  updateRoutine(id: number, patch: RoutinePatch): Promise<Routine>;
  deleteRoutine(id: number): Promise<void>;
  completeRoutine(id: number): Promise<CompleteResult>;
  updateSettings(settings: Settings): Promise<Settings>;
  rewards(): Promise<Rewards>;
  photo(id: number): Promise<Blob>;
}
```

- [ ] **Step 2: Написать падающие тесты**

`web/src/api/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError, httpApi } from './client';

function fakeFetch(status: number, body: unknown, binary = false) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return binary
      ? new Response(new Blob(['IMG'], { type: 'image/jpeg' }), { status })
      : Response.json(body, { status });
  };
  return { calls, fetchImpl };
}

describe('httpApi', () => {
  it('шлёт POST /api/app с tma-заголовком и op в теле, разворачивает data', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { ok: true, data: { completed: true, needs: {} } });
    const api = httpApi('query_id=1&hash=abc', fetchImpl);
    const result = await api.completeTask(7);
    expect(result.completed).toBe(true);
    expect(calls[0]?.url).toBe('/api/app');
    expect(calls[0]?.init.method).toBe('POST');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('tma query_id=1&hash=abc');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ op: 'tasks.complete', id: 7 });
  });

  it('патч рутины уходит плоско вместе с id', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { ok: true, data: {} });
    await httpApi('x', fetchImpl).updateRoutine(3, { active: false });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ op: 'routines.update', id: 3, active: false });
  });

  it('ошибка сервера превращается в ApiError со статусом и кодом', async () => {
    const { fetchImpl } = fakeFetch(401, { ok: false, error: 'unauthorized' });
    const error = await httpApi('x', fetchImpl).state().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('ответ без JSON тоже даёт ApiError', async () => {
    const fetchImpl = async () => new Response('Bad Gateway', { status: 502 });
    await expect(httpApi('x', fetchImpl).state()).rejects.toMatchObject({ status: 502, code: 'network' });
  });

  it('фото приходит как Blob', async () => {
    const { calls, fetchImpl } = fakeFetch(200, null, true);
    const blob = await httpApi('x', fetchImpl).photo(5);
    expect(blob.type).toBe('image/jpeg');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ op: 'photo', id: 5 });
  });
});
```

`web/src/api/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { errorText } from './errors';

describe('errorText', () => {
  it('401 — просит открыть из чата с ботом', () => {
    expect(errorText(new ApiError(401, 'unauthorized'))).toBe('Открой Шантика из чата с ботом 🐾');
  });

  it('400 в настройках — объясняет правило тихих часов', () => {
    expect(errorText(new ApiError(400, 'bad_request'), 'settings')).toBe(
      'Тихие часы: начало с 20:00 до 00:00, конец с 05:00 до 12:00.',
    );
  });

  it('404 — запись уже удалена', () => {
    expect(errorText(new ApiError(404, 'not_found'))).toBe('Этого уже нет — обнови список.');
  });

  it('остальное — мягкий общий текст', () => {
    expect(errorText(new ApiError(500, 'internal'))).toBe('Шантик не дотянулся до сервера. Попробуй ещё раз 🐾');
    expect(errorText(new TypeError('Failed to fetch'))).toBe('Шантик не дотянулся до сервера. Попробуй ещё раз 🐾');
  });
});
```

- [ ] **Step 3: Запустить — должны упасть**

Run: `npx vitest run web/src/api`
Expected: FAIL — нет модулей `./client`, `./errors`.

- [ ] **Step 4: `web/src/api/client.ts`**

```ts
import type { Api } from './types';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

const browserFetch: FetchLike = (url, init) => fetch(url, init);

export function httpApi(initData: string, fetchImpl: FetchLike = browserFetch): Api {
  async function post(body: object): Promise<Response> {
    const res = await fetchImpl('/api/app', {
      method: 'POST',
      headers: { authorization: `tma ${initData}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, json?.error ?? 'network');
  }

  async function call<T>(body: object): Promise<T> {
    const json = (await (await post(body)).json()) as { data: T };
    return json.data;
  }

  return {
    state: () => call({ op: 'state' }),
    listTasks: () => call({ op: 'tasks.list' }),
    createTask: (input) => call({ op: 'tasks.create', ...input }),
    updateTask: (id, patch) => call({ op: 'tasks.update', id, ...patch }),
    deleteTask: async (id) => {
      await call({ op: 'tasks.delete', id });
    },
    completeTask: (id) => call({ op: 'tasks.complete', id }),
    listRoutines: () => call({ op: 'routines.list' }),
    createRoutine: (input) => call({ op: 'routines.create', ...input }),
    updateRoutine: (id, patch) => call({ op: 'routines.update', id, ...patch }),
    deleteRoutine: async (id) => {
      await call({ op: 'routines.delete', id });
    },
    completeRoutine: (id) => call({ op: 'routines.complete', id }),
    updateSettings: (settings) => call({ op: 'settings.update', settings }),
    rewards: () => call({ op: 'rewards.list' }),
    photo: async (id) => (await post({ op: 'photo', id })).blob(),
  };
}
```

- [ ] **Step 5: `web/src/api/errors.ts`**

```ts
import { ApiError } from './client';

const GENERIC = 'Шантик не дотянулся до сервера. Попробуй ещё раз 🐾';

export function errorText(error: unknown, context?: 'settings'): string {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.status === 401) return 'Открой Шантика из чата с ботом 🐾';
  if (error.status === 400 && context === 'settings') {
    return 'Тихие часы: начало с 20:00 до 00:00, конец с 05:00 до 12:00.';
  }
  if (error.status === 404) return 'Этого уже нет — обнови список.';
  return GENERIC;
}
```

- [ ] **Step 6: Запустить тесты**

Run: `npx vitest run web/src/api`
Expected: PASS (9 тестов).

- [ ] **Step 7: `web/src/lib/needs.ts`**

```ts
import type { Need } from '../api/types';

export const NEED_EMOJI: Record<Need, string> = { food: '🍖', walk: '🦮', play: '🎾', love: '🤍' };
export const NEED_LABEL: Record<Need, string> = { food: 'Миска', walk: 'Прогулка', play: 'Игра', love: 'Ласка' };
```

- [ ] **Step 8: `web/src/api/mock.ts` — заглушка для dev вне Telegram**

Только для `npm run dev:web` в обычном браузере. Ведёт себя как сервер в упрощённом виде (без убывания и сна). Тихие часы проверяет по тому же правилу, что сервер (400 при нарушении). Фото с id 999 всегда отдаёт ошибку — для проверки заглушки битого фото.

```ts
import { NEEDS } from '../../../src/core/types';
import { ApiError } from './client';
import type { Api, AppState, Needs, PetState, Rewards, Routine, Settings, Task } from './types';

const GAIN = 35;
const now = () => new Date().toISOString();
const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 150));

function moodOf(needs: Needs): PetState {
  const lowest = NEEDS.reduce((a, b) => (needs[b] < needs[a] ? b : a));
  if (needs[lowest] < 30) return { kind: 'asking', need: lowest };
  return needs[lowest] >= 60 ? { kind: 'happy' } : { kind: 'ok' };
}

/** То же правило, что на сервере: начало 20:00–00:00, конец 05:00–12:00. */
function quietValid({ start, end }: Settings['quiet']): boolean {
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const s = minutes(start);
  const e = minutes(end);
  return (s >= 20 * 60 || s === 0) && e >= 5 * 60 && e <= 12 * 60;
}

const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e8a25c"/><text x="60" y="72" font-size="40" text-anchor="middle">🐶</text></svg>';

export function mockApi(): Api {
  let needs: Needs = { food: 22, walk: 64, play: 48, love: 80 };
  let settings: Settings = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };
  let nextId = 100;
  let tasks: Task[] = [
    { id: 1, title: 'Выпить воды', need: 'food', dueAt: null, doneAt: null, createdAt: now() },
    { id: 2, title: 'Ответить Маше', need: 'play', dueAt: null, doneAt: null, createdAt: now() },
    { id: 3, title: 'Позавтракать', need: 'food', dueAt: null, doneAt: now(), createdAt: now() },
  ];
  let routines: Routine[] = [{ id: 10, title: 'Таблетки', need: 'food', time: '20:00', days: 127, active: true }];
  const doneRoutines = new Set<number>();
  const rewards: Rewards = {
    notes: [{ id: 1, text: 'Ты справляешься лучше, чем думаешь 🤍', unlockedAt: now() }],
    photos: [
      { id: 1, caption: 'Шантик на прогулке', unlockedAt: now() },
      { id: 999, caption: 'Это фото не загрузится', unlockedAt: now() },
    ],
    lockedPhotos: 2,
    nextPhotoIn: 7,
  };

  const gain = (need: Task['need']) => {
    if (need) needs = { ...needs, [need]: Math.min(100, needs[need] + GAIN) };
    return delay({ completed: true, needs });
  };
  const findTask = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new ApiError(404, 'not_found');
    return task;
  };
  const findRoutine = (id: number) => {
    const routine = routines.find((r) => r.id === id);
    if (!routine) throw new ApiError(404, 'not_found');
    return routine;
  };
  const state = (): AppState => ({
    needs,
    mood: moodOf(needs),
    settings,
    tasks: tasks.filter((t) => !t.doneAt).slice(0, 3),
    routinesToday: routines
      .filter((r) => r.active)
      .map((r) => ({ id: r.id, title: r.title, time: r.time, need: r.need, done: doneRoutines.has(r.id) })),
  });

  return {
    state: async () => delay(state()),
    listTasks: async () => delay(tasks),
    createTask: async (input) => {
      const task: Task = { id: nextId++, title: input.title, need: input.need, dueAt: input.dueAt ?? null, doneAt: null, createdAt: now() };
      tasks = [...tasks, task];
      return delay(task);
    },
    updateTask: async (id, patch) => {
      const task = { ...findTask(id), ...patch };
      tasks = tasks.map((t) => (t.id === id ? task : t));
      return delay(task);
    },
    deleteTask: async (id) => {
      findTask(id);
      tasks = tasks.filter((t) => t.id !== id);
      await delay(null);
    },
    completeTask: async (id) => {
      const task = findTask(id);
      if (task.doneAt) return delay({ completed: false, needs });
      tasks = tasks.map((t) => (t.id === id ? { ...t, doneAt: now() } : t));
      return gain(task.need);
    },
    listRoutines: async () => delay(routines),
    createRoutine: async (input) => {
      const routine: Routine = { id: nextId++, active: true, ...input };
      routines = [...routines, routine];
      return delay(routine);
    },
    updateRoutine: async (id, patch) => {
      const routine = { ...findRoutine(id), ...patch };
      routines = routines.map((r) => (r.id === id ? routine : r));
      return delay(routine);
    },
    deleteRoutine: async (id) => {
      findRoutine(id);
      routines = routines.filter((r) => r.id !== id);
      await delay(null);
    },
    completeRoutine: async (id) => {
      const routine = findRoutine(id);
      if (doneRoutines.has(id)) return delay({ completed: false, needs });
      doneRoutines.add(id);
      return gain(routine.need);
    },
    updateSettings: async (next) => {
      if (!quietValid(next.quiet)) throw new ApiError(400, 'bad_request');
      settings = next;
      return delay(settings);
    },
    rewards: async () => delay(rewards),
    photo: async (id) => {
      if (id === 999) throw new ApiError(500, 'internal');
      return delay(new Blob([PHOTO_SVG], { type: 'image/svg+xml' }));
    },
  };
}
```

- [ ] **Step 9: `web/src/api/index.ts`**

```ts
import { getInitData, isDevPreview } from '../telegram';
import { httpApi } from './client';
import type { Api } from './types';

export async function createApi(): Promise<Api> {
  if (isDevPreview()) return (await import('./mock')).mockApi();
  return httpApi(getInitData());
}
```

- [ ] **Step 10: Проверка и коммит**

Run: `npx vitest run web/src && npm run typecheck`
Expected: PASS, ошибок типов нет.

```bash
git add web/src/api web/src/lib/needs.ts
git commit -m "feat(web): RPC client, error texts and dev mock API"
```

---

### Task 3: Шантик — выражение, фразы, SVG, анимации

**Files:**
- Create: `web/src/pet/expression.ts`, `web/src/pet/phrases.ts`, `web/src/pet/Shantik.tsx`, `web/src/pet/shantik.css`
- Test: `web/src/pet/expression.test.ts`, `web/src/pet/phrases.test.ts`

**Interfaces:**
- Consumes: `PetState`, `Need` (Task 2, `web/src/api/types.ts`)
- Produces:
  - `interface Expression { eyes: 'open' | 'sad' | 'closed' | 'joy'; mouth: 'smile' | 'sad' | 'tongue'; prop: Need | null; extra: 'zzz' | 'sparkles' | null; motion: 'idle' | 'bounce' | 'tilt' | 'breathe' | 'jump' }`
  - `expressionFor(mood: PetState, celebrating: boolean): Expression`
  - `SPEECH` (пулы фраз), `speechFor(mood: PetState, celebrating: boolean, seed: number): string`
  - `<Shantik mood={PetState} celebrating={boolean} />` — SVG 200×200, `role="img"`, `aria-label` с описанием состояния

- [ ] **Step 1: Написать падающие тесты**

`web/src/pet/expression.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expressionFor } from './expression';

describe('expressionFor', () => {
  it('спит — глаза закрыты, Zzz, дышит', () => {
    expect(expressionFor({ kind: 'sleeping' }, false)).toEqual({
      eyes: 'closed', mouth: 'smile', prop: null, extra: 'zzz', motion: 'breathe',
    });
  });

  it('просит — грустные глаза и предмет своей потребности', () => {
    expect(expressionFor({ kind: 'asking', need: 'walk' }, false)).toEqual({
      eyes: 'sad', mouth: 'sad', prop: 'walk', extra: null, motion: 'tilt',
    });
  });

  it('счастлив — язык наружу', () => {
    expect(expressionFor({ kind: 'happy' }, false)).toMatchObject({ eyes: 'open', mouth: 'tongue', motion: 'bounce' });
  });

  it('обычное — улыбка', () => {
    expect(expressionFor({ kind: 'ok' }, false)).toMatchObject({ eyes: 'open', mouth: 'smile', prop: null, motion: 'idle' });
  });

  it('праздник важнее любого состояния, даже сна', () => {
    for (const mood of [{ kind: 'sleeping' }, { kind: 'asking', need: 'food' }, { kind: 'ok' }] as const) {
      expect(expressionFor(mood, true)).toEqual({ eyes: 'joy', mouth: 'tongue', prop: null, extra: 'sparkles', motion: 'jump' });
    }
  });
});
```

`web/src/pet/phrases.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SPEECH, speechFor } from './phrases';

describe('speechFor', () => {
  it('просьба берётся из пула своей потребности', () => {
    for (let seed = 0; seed < 10; seed++) {
      expect(SPEECH.asking.love).toContain(speechFor({ kind: 'asking', need: 'love' }, false, seed));
    }
  });

  it('праздник — из пула праздника, даже ночью', () => {
    expect(SPEECH.celebrating).toContain(speechFor({ kind: 'sleeping' }, true, 4));
  });

  it('одинаковый seed — одинаковая фраза, разные seed перебирают весь пул', () => {
    const mood = { kind: 'happy' } as const;
    expect(speechFor(mood, false, 2)).toBe(speechFor(mood, false, 2));
    const seen = new Set(SPEECH.happy.map((_, seed) => speechFor(mood, false, seed)));
    expect(seen.size).toBe(SPEECH.happy.length);
  });

  it('в каждом пуле минимум 3 фразы, без упрёков', () => {
    const pools = [SPEECH.sleeping, SPEECH.celebrating, SPEECH.happy, SPEECH.ok, ...Object.values(SPEECH.asking)];
    for (const pool of pools) {
      expect(pool.length).toBeGreaterThanOrEqual(3);
      for (const phrase of pool) expect(phrase).not.toMatch(/опять|снова не|забыла|ленив/i);
    }
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run web/src/pet`
Expected: FAIL — нет модулей `./expression`, `./phrases`.

- [ ] **Step 3: `web/src/pet/expression.ts`**

```ts
import type { Need, PetState } from '../api/types';

export interface Expression {
  eyes: 'open' | 'sad' | 'closed' | 'joy';
  mouth: 'smile' | 'sad' | 'tongue';
  prop: Need | null;
  extra: 'zzz' | 'sparkles' | null;
  motion: 'idle' | 'bounce' | 'tilt' | 'breathe' | 'jump';
}

export function expressionFor(mood: PetState, celebrating: boolean): Expression {
  if (celebrating) return { eyes: 'joy', mouth: 'tongue', prop: null, extra: 'sparkles', motion: 'jump' };
  switch (mood.kind) {
    case 'sleeping':
      return { eyes: 'closed', mouth: 'smile', prop: null, extra: 'zzz', motion: 'breathe' };
    case 'asking':
      return { eyes: 'sad', mouth: 'sad', prop: mood.need, extra: null, motion: 'tilt' };
    case 'happy':
      return { eyes: 'open', mouth: 'tongue', prop: null, extra: null, motion: 'bounce' };
    case 'ok':
      return { eyes: 'open', mouth: 'smile', prop: null, extra: null, motion: 'idle' };
  }
}
```

- [ ] **Step 4: `web/src/pet/phrases.ts`**

```ts
import type { Need, PetState } from '../api/types';

export const SPEECH = {
  sleeping: ['Хр-р… 💤', 'Сплю. Завтра поиграем 🌙', 'Тс-с, я сопю 💤'],
  celebrating: ['Ура! Ты умница! 🎉', 'Гав-гав! Так держать! 🐾', 'Вот это да! 💛', 'Я горжусь тобой! ✨'],
  happy: ['Мне так хорошо с тобой! 💛', 'Гав! Лучший день! 🐾', 'Я счастливый шпиц ✨'],
  ok: ['Я тут, рядом 🐾', 'Как ты? 🤍', 'Одно маленькое дело — и мне будет ещё лучше 🐾'],
  asking: {
    food: ['Миска почти пустая 🥺', 'Может, перекусим? 🍖', 'Попьёшь водички со мной? 💧'],
    walk: ['Пойдём прогуляемся? 🦮', 'Хочу на улицу! 🐾', 'Хоть пять минут подвигаемся? 🦮'],
    play: ['Поиграем? Одно маленькое дело 🎾', 'Давай сделаем что-нибудь вместе 🎾', 'Мячик ждёт! 🎾'],
    love: ['Погладь меня… и себя тоже 🤍', 'Сделай что-нибудь приятное для себя 🤍', 'Отдохни немножко со мной 🤍'],
  } satisfies Record<Need, string[]>,
};

const pick = (pool: readonly string[], seed: number): string => pool[Math.abs(seed) % pool.length] ?? '';

export function speechFor(mood: PetState, celebrating: boolean, seed: number): string {
  if (celebrating) return pick(SPEECH.celebrating, seed);
  switch (mood.kind) {
    case 'sleeping':
      return pick(SPEECH.sleeping, seed);
    case 'asking':
      return pick(SPEECH.asking[mood.need], seed);
    case 'happy':
      return pick(SPEECH.happy, seed);
    case 'ok':
      return pick(SPEECH.ok, seed);
  }
}
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run web/src/pet`
Expected: PASS (9 тестов).

- [ ] **Step 6: `web/src/pet/Shantik.tsx`**

Координаты — по утверждённому эскизу варианта B (viewBox 200×200). Порядок слоёв: хвост → тело → грива → лапки → уши → голова → рыжая «шапка» → щёчки → нос → глаза → рот → предмет → эффекты.

```tsx
import type { Need, PetState } from '../api/types';
import { expressionFor, type Expression } from './expression';
import './shantik.css';

const FUR = '#e8a25c';
const FUR_INNER = '#f6c99a';
const CREAM = '#fbf3e4';
const INK = '#2b2b2b';
const PINK = '#e8697a';
const LINE = { stroke: INK, fill: 'none', strokeLinecap: 'round' } as const;

function Body() {
  return (
    <g>
      <path className="shantik__tail" d="M148 150 Q192 128 176 92 Q168 112 150 122 Z" fill={FUR} />
      <ellipse cx="100" cy="158" rx="64" ry="34" fill={CREAM} />
      <path d="M40 120 Q30 150 60 160 Q50 140 58 128Z M160 120 Q170 150 140 160 Q150 140 142 128Z" fill="#fff" />
      <ellipse cx="78" cy="186" rx="13" ry="8" fill="#fff" />
      <ellipse cx="122" cy="186" rx="13" ry="8" fill="#fff" />
    </g>
  );
}

function Head() {
  return (
    <g>
      <path d="M45 70 L58 22 L88 52 Z" fill={FUR} />
      <path d="M57 58 L62 36 L78 52 Z" fill={FUR_INNER} />
      <path d="M155 70 L142 22 L112 52 Z" fill={FUR} />
      <path d="M143 58 L138 36 L122 52 Z" fill={FUR_INNER} />
      <circle cx="100" cy="100" r="62" fill={CREAM} />
      <path d="M42 95 Q30 70 55 55 Q75 40 100 42 Q125 40 145 55 Q170 70 158 95 Q140 70 100 66 Q60 70 42 95Z" fill={FUR} />
      <ellipse cx="62" cy="118" rx="9" ry="5" fill="#f7b6b6" opacity=".7" />
      <ellipse cx="138" cy="118" rx="9" ry="5" fill="#f7b6b6" opacity=".7" />
      <ellipse cx="100" cy="114" rx="7" ry="5" fill={INK} />
    </g>
  );
}

function Eyes({ kind }: { kind: Expression['eyes'] }) {
  if (kind === 'closed' || kind === 'joy') {
    const dy = kind === 'closed' ? 6 : -12;
    return (
      <g {...LINE} strokeWidth={3}>
        <path d={`M66 100 Q76 ${100 + dy} 86 100`} />
        <path d={`M114 100 Q124 ${100 + dy} 134 100`} />
      </g>
    );
  }
  return (
    <g>
      <circle cx="76" cy="98" r="10" fill={INK} />
      <circle cx="124" cy="98" r="10" fill={INK} />
      <circle cx="79" cy="94" r="3.5" fill="#fff" />
      <circle cx="127" cy="94" r="3.5" fill="#fff" />
      {kind === 'sad' && (
        <g {...LINE} strokeWidth={3}>
          <path d="M64 86 L84 80" />
          <path d="M136 86 L116 80" />
        </g>
      )}
    </g>
  );
}

function Mouth({ kind }: { kind: Expression['mouth'] }) {
  if (kind === 'sad') return <path d="M90 128 Q100 121 110 128" {...LINE} strokeWidth={2.5} />;
  return (
    <g>
      <path d="M88 122 Q94 128 100 122 Q106 128 112 122" {...LINE} strokeWidth={2.5} />
      {kind === 'tongue' && <path d="M95 125 Q100 142 105 125Z" fill={PINK} />}
    </g>
  );
}

function Prop({ need }: { need: Need }) {
  switch (need) {
    case 'food':
      return (
        <g className="shantik__prop">
          <ellipse cx="170" cy="176" rx="20" ry="5" fill="#8a5a2b" />
          <path d="M150 176 h40 l-6 16 h-28 Z" fill="#6aa9d8" />
        </g>
      );
    case 'walk':
      return (
        <g className="shantik__prop">
          <path d="M154 190 Q158 150 178 158 Q192 166 182 182" stroke="#d1495b" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="154" cy="190" r="5" fill="#d1495b" />
        </g>
      );
    case 'play':
      return (
        <g className="shantik__prop">
          <circle cx="170" cy="178" r="13" fill="#c8e05a" />
          <path d="M158 172 Q170 178 182 172 M158 184 Q170 178 182 184" stroke="#fff" strokeWidth="2" fill="none" />
        </g>
      );
    case 'love':
      return <path className="shantik__prop" d="M170 192 C152 178 156 162 170 170 C184 162 188 178 170 192 Z" fill={PINK} />;
  }
}

function Extra({ kind }: { kind: Expression['extra'] }) {
  if (kind === 'zzz') {
    return (
      <g className="shantik__zzz" fill="#9aa7c7" fontWeight="700">
        <text x="150" y="40" fontSize="18">z</text>
        <text x="164" y="26" fontSize="14">z</text>
        <text x="176" y="14" fontSize="10">z</text>
      </g>
    );
  }
  if (kind === 'sparkles') {
    return (
      <g className="shantik__sparkles" fill="#f2b53b">
        <text x="22" y="40" fontSize="20">✦</text>
        <text x="166" y="34" fontSize="16">✦</text>
        <text x="176" y="120" fontSize="14">✦</text>
      </g>
    );
  }
  return null;
}

const LABEL: Record<Expression['motion'], string> = {
  idle: 'Шантик спокоен',
  bounce: 'Шантик счастлив',
  tilt: 'Шантик просит внимания',
  breathe: 'Шантик спит',
  jump: 'Шантик радуется',
};

export function Shantik({ mood, celebrating }: { mood: PetState; celebrating: boolean }) {
  const face = expressionFor(mood, celebrating);
  return (
    <svg className={`shantik shantik--${face.motion}`} viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={LABEL[face.motion]}>
      <g className="shantik__body">
        <Body />
        <Head />
        <Eyes kind={face.eyes} />
        <Mouth kind={face.mouth} />
      </g>
      {face.prop && <Prop need={face.prop} />}
      <Extra kind={face.extra} />
    </svg>
  );
}
```

- [ ] **Step 7: `web/src/pet/shantik.css`**

```css
.shantik { display: block; margin: 0 auto; overflow: visible; }
.shantik__body { transform-origin: 100px 190px; transform-box: view-box; }
.shantik__tail { transform-origin: 150px 140px; transform-box: view-box; animation: wag 1.2s ease-in-out infinite; }

.shantik--idle .shantik__body { animation: bob 3s ease-in-out infinite; }
.shantik--bounce .shantik__body { animation: bob 1.4s ease-in-out infinite; }
.shantik--bounce .shantik__tail { animation-duration: 0.4s; }
.shantik--tilt .shantik__body { animation: tilt 2.4s ease-in-out infinite; }
.shantik--breathe .shantik__body { animation: breathe 4s ease-in-out infinite; }
.shantik--breathe .shantik__tail { animation: none; }
.shantik--jump .shantik__body { animation: jump 0.6s ease-out 3; }
.shantik--jump .shantik__tail { animation-duration: 0.25s; }

.shantik__prop { animation: bob 2s ease-in-out infinite; }
.shantik__zzz { animation: float 3s ease-in-out infinite; }
.shantik__sparkles { animation: twinkle 0.8s ease-in-out infinite alternate; }

@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes wag { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(10deg); } }
@keyframes tilt { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-5deg); } }
@keyframes breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.02, 0.98); } }
@keyframes jump { 0% { transform: translateY(0); } 40% { transform: translateY(-22px); } 100% { transform: translateY(0); } }
@keyframes float { 0%, 100% { transform: translateY(0); opacity: 0.6; } 50% { transform: translateY(-6px); opacity: 1; } }
@keyframes twinkle { from { opacity: 0.4; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .shantik, .shantik * { animation: none !important; }
}
```

- [ ] **Step 8: Проверка и коммит**

Run: `npx vitest run web/src && npm run typecheck`
Expected: PASS, ошибок типов нет.

```bash
git add web/src/pet
git commit -m "feat(web): Shantik SVG with expressions, phrases and CSS motion"
```

---

### Task 4: Общие хелперы и UI-кирпичики

**Files:**
- Create: `web/src/lib/time.ts`, `web/src/lib/days.ts`, `web/src/lib/nearest.ts`, `web/src/lib/plural.ts`, `web/src/ui/Sheet.tsx`, `web/src/ui/Segmented.tsx`, `web/src/ui/NeedPicker.tsx`, `web/src/ui/ItemRow.tsx`, `web/src/ui/SwipeRow.tsx`
- Modify: `web/src/styles.css` (дописать в конец)
- Test: `web/src/lib/time.test.ts`, `web/src/lib/days.test.ts`, `web/src/lib/nearest.test.ts`, `web/src/lib/plural.test.ts`

**Interfaces:**
- Consumes: `AppState`, `Need` (Task 2), `NEED_EMOJI`, `NEED_LABEL` (Task 2), `NEEDS` из `src/core/types.ts`
- Produces:
  - `dueAtToday(time: string, now: Date): string` — сегодня (по часам устройства) в `HH:MM` → ISO
  - `timeOf(iso: string): string` — ISO → `HH:MM` по часам устройства
  - `DAY_SHORT`, `ALL_DAYS`, `hasDay(mask, index)`, `toggleDay(mask, index)`, `daysLabel(mask)`
  - `interface NearestItem { key: string; kind: 'task' | 'routine'; id: number; need: Need; title: string; time: string | null }`, `nearest(state, limit = 3): NearestItem[]`
  - `pluralRu(n: number, forms: readonly [string, string, string]): string`
  - `<Sheet title onClose>{children}</Sheet>`
  - `<Segmented options value onChange />` — `options: readonly { value: T; label: string }[]`
  - `<NeedPicker value={Need | null} onChange={(need) => void} />`
  - `<ItemRow emoji title meta? done onToggle? onOpen? />` — кружок показывается, если есть `onToggle` или `done`; пока `onToggle` выполняется, кружок заблокирован
  - `<SwipeRow onDelete>{children}</SwipeRow>`

- [ ] **Step 1: Написать падающие тесты**

`web/src/lib/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dueAtToday, timeOf } from './time';

describe('время задачи', () => {
  const now = new Date(2026, 11, 27, 15, 42);

  it('dueAtToday ставит время на сегодняшнюю дату устройства', () => {
    const due = new Date(dueAtToday('09:05', now));
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 11, 27]);
    expect([due.getHours(), due.getMinutes(), due.getSeconds()]).toEqual([9, 5, 0]);
  });

  it('timeOf — обратное преобразование', () => {
    expect(timeOf(dueAtToday('09:05', now))).toBe('09:05');
    expect(timeOf(dueAtToday('23:59', now))).toBe('23:59');
  });
});
```

`web/src/lib/days.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALL_DAYS, daysLabel, hasDay, toggleDay } from './days';

describe('дни недели', () => {
  it('подписи для частых наборов', () => {
    expect(daysLabel(ALL_DAYS)).toBe('каждый день');
    expect(daysLabel(0b0011111)).toBe('по будням');
    expect(daysLabel(0b1100000)).toBe('по выходным');
    expect(daysLabel(0b0010101)).toBe('пн, ср, пт');
  });

  it('toggleDay включает и выключает день, бит 0 — понедельник', () => {
    const monday = toggleDay(0, 0);
    expect(monday).toBe(1);
    expect(hasDay(monday, 0)).toBe(true);
    expect(toggleDay(monday, 0)).toBe(0);
    expect(hasDay(ALL_DAYS, 6)).toBe(true);
  });
});
```

`web/src/lib/nearest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Task } from '../api/types';
import { nearest } from './nearest';

const task = (id: number, need: Task['need']): Task => ({
  id, title: `задача ${id}`, need, dueAt: null, doneAt: null, createdAt: '2026-12-27T09:00:00Z',
});

describe('nearest', () => {
  it('сначала несделанные рутины по времени, потом задачи; черновики без потребности не попадают', () => {
    const items = nearest({
      routinesToday: [
        { id: 2, title: 'вечер', time: '21:00', need: 'love', done: false },
        { id: 1, title: 'таблетки', time: '20:00', need: 'food', done: false },
        { id: 3, title: 'зарядка', time: '08:00', need: 'walk', done: true },
      ],
      tasks: [task(10, null), task(11, 'play')],
    });
    expect(items.map((i) => i.key)).toEqual(['routine:1', 'routine:2', 'task:11']);
    expect(items[0]).toMatchObject({ kind: 'routine', id: 1, need: 'food', time: '20:00' });
    expect(items[2]).toMatchObject({ kind: 'task', id: 11, time: null });
  });

  it('не больше limit', () => {
    const tasks = [1, 2, 3, 4, 5].map((id) => task(id, 'play'));
    expect(nearest({ routinesToday: [], tasks })).toHaveLength(3);
    expect(nearest({ routinesToday: [], tasks }, 2)).toHaveLength(2);
  });
});
```

`web/src/lib/plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pluralRu } from './plural';

const FORMS = ['задачу', 'задачи', 'задач'] as const;

describe('pluralRu', () => {
  it.each([
    [1, 'задачу'], [2, 'задачи'], [4, 'задачи'], [5, 'задач'], [11, 'задач'],
    [12, 'задач'], [14, 'задач'], [21, 'задачу'], [22, 'задачи'], [0, 'задач'],
  ])('%i → %s', (n, form) => {
    expect(pluralRu(n, FORMS)).toBe(form);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run web/src/lib`
Expected: FAIL — нет модулей `./time`, `./days`, `./nearest`, `./plural`.

- [ ] **Step 3: Реализация хелперов**

`web/src/lib/time.ts`:

```ts
const pad = (n: number) => String(n).padStart(2, '0');

/** Сегодняшняя дата устройства + время "HH:MM" → ISO-строка для dueAt. */
export function dueAtToday(time: string, now: Date): string {
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return at.toISOString();
}

/** ISO-строка → "HH:MM" по часам устройства. */
export function timeOf(iso: string): string {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
```

`web/src/lib/days.ts`:

```ts
export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const ALL_DAYS = 0b1111111;
const WEEKDAYS = 0b0011111;
const WEEKEND = 0b1100000;

export const hasDay = (mask: number, index: number): boolean => (mask & (1 << index)) !== 0;
export const toggleDay = (mask: number, index: number): number => mask ^ (1 << index);

export function daysLabel(mask: number): string {
  if (mask === ALL_DAYS) return 'каждый день';
  if (mask === WEEKDAYS) return 'по будням';
  if (mask === WEEKEND) return 'по выходным';
  return DAY_SHORT.filter((_, index) => hasDay(mask, index))
    .map((day) => day.toLowerCase())
    .join(', ');
}
```

`web/src/lib/nearest.ts`:

```ts
import type { AppState, Need } from '../api/types';
import { timeOf } from './time';

export interface NearestItem {
  key: string;
  kind: 'task' | 'routine';
  id: number;
  need: Need;
  title: string;
  time: string | null;
}

export function nearest(state: Pick<AppState, 'tasks' | 'routinesToday'>, limit = 3): NearestItem[] {
  const routines: NearestItem[] = state.routinesToday
    .filter((r) => !r.done)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({ key: `routine:${r.id}`, kind: 'routine', id: r.id, need: r.need, title: r.title, time: r.time }));
  const tasks: NearestItem[] = state.tasks.flatMap((t) =>
    t.need
      ? [{ key: `task:${t.id}`, kind: 'task' as const, id: t.id, need: t.need, title: t.title, time: t.dueAt ? timeOf(t.dueAt) : null }]
      : [],
  );
  return [...routines, ...tasks].slice(0, limit);
}
```

`web/src/lib/plural.ts`:

```ts
export function pluralRu(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run web/src/lib`
Expected: PASS (16 тестов).

- [ ] **Step 5: UI-кирпичики**

`web/src/ui/Sheet.tsx`:

```tsx
import type { ReactNode } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <b>{title}</b>
          <button className="sheet__close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

`web/src/ui/Segmented.tsx`:

```tsx
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          className={`seg__item ${option.value === value ? 'seg__item--on' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

`web/src/ui/NeedPicker.tsx`:

```tsx
import { NEEDS } from '../../../src/core/types';
import type { Need } from '../api/types';
import { NEED_EMOJI, NEED_LABEL } from '../lib/needs';

export function NeedPicker({ value, onChange }: { value: Need | null; onChange: (need: Need) => void }) {
  return (
    <div className="needs-picker" role="radiogroup" aria-label="Куда засчитать">
      {NEEDS.map((need) => (
        <button
          key={need}
          type="button"
          role="radio"
          aria-checked={value === need}
          className={`pick ${value === need ? 'pick--on' : ''}`}
          onClick={() => onChange(need)}
        >
          <span>{NEED_EMOJI[need]}</span>
          <small>{NEED_LABEL[need]}</small>
        </button>
      ))}
    </div>
  );
}
```

`web/src/ui/ItemRow.tsx`:

```tsx
import { useState, type MouseEvent } from 'react';

interface Props {
  emoji: string;
  title: string;
  meta?: string;
  done: boolean;
  muted?: boolean;
  onToggle?: () => Promise<void>;
  onOpen?: () => void;
}

export function ItemRow({ emoji, title, meta, done, muted, onToggle, onOpen }: Props) {
  const [pending, setPending] = useState(false);

  async function toggle(event: MouseEvent) {
    event.stopPropagation();
    if (done || pending || !onToggle) return;
    setPending(true);
    try {
      await onToggle();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`row card ${done ? 'row--done' : ''} ${muted ? 'row--muted' : ''}`} onClick={onOpen}>
      {(onToggle || done) && (
        <button
          className={`check ${done ? 'check--done' : ''}`}
          aria-label={done ? 'Сделано' : 'Отметить сделанным'}
          disabled={done || pending}
          onClick={toggle}
        />
      )}
      <span className="row__title">
        {emoji} {title}
      </span>
      {meta && <span className="muted row__meta">{meta}</span>}
    </div>
  );
}
```

`web/src/ui/SwipeRow.tsx` (без захвата указателя — иначе кнопки внутри строки перестают получать клик):

```tsx
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

const REVEAL = 88;
const THRESHOLD = 48;
const DEAD_ZONE = 6;

export function SwipeRow({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);

  function down(event: PointerEvent) {
    start.current = { x: event.clientX, y: event.clientY, base: offset };
    moved.current = false;
  }

  function move(event: PointerEvent) {
    const from = start.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    if (Math.abs(dx) < DEAD_ZONE || Math.abs(dx) < Math.abs(event.clientY - from.y)) return;
    moved.current = true;
    setOffset(Math.min(0, Math.max(-REVEAL, from.base + dx)));
  }

  function up() {
    if (!start.current) return;
    start.current = null;
    setOffset((value) => (value < -THRESHOLD ? -REVEAL : 0));
  }

  /** После свайпа клик не открывает строку; тап по открытой строке — закрывает её. */
  function clickCapture(event: MouseEvent) {
    if (moved.current) {
      moved.current = false;
      event.stopPropagation();
    } else if (offset !== 0) {
      event.stopPropagation();
      setOffset(0);
    }
  }

  return (
    <div className="swipe">
      <button className="swipe__delete" onClick={onDelete}>
        Удалить
      </button>
      <div
        className="swipe__content"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clickCapture}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Стили — дописать в конец `web/src/styles.css`**

```css
.row { display: flex; align-items: center; gap: 10px; min-height: 48px; }
.row__title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.row__meta { flex: none; }
.row--done .row__title { text-decoration: line-through; color: var(--muted); }
.row--muted { opacity: 0.55; }

.check {
  flex: none;
  width: 26px;
  height: 26px;
  border: 2px solid var(--fur);
  border-radius: 50%;
  background: none;
  padding: 0;
}
.check--done { background: var(--fur); }
.check:disabled:not(.check--done) { opacity: 0.4; }

.seg { display: flex; background: var(--track); border-radius: 10px; padding: 3px; margin: 6px 0 10px; }
.seg__item { flex: 1; border: 0; background: none; border-radius: 8px; padding: 7px 4px; font-size: 14px; }
.seg__item--on { background: var(--card); font-weight: 600; }

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 0.3);
}
.sheet {
  width: 100%;
  max-height: 85%;
  overflow-y: auto;
  background: var(--bg);
  border-radius: 18px 18px 0 0;
  padding: 16px 16px calc(var(--bottom) + 16px);
}
.sheet__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 17px; }
.sheet__close { border: 0; background: none; font-size: 18px; color: var(--muted); padding: 4px 8px; }

.needs-picker { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: var(--card);
  padding: 8px 0;
  font-size: 22px;
}
.pick small { font-size: 12px; color: var(--muted); }
.pick--on { border-color: var(--accent); }

.swipe { position: relative; overflow: hidden; border-radius: 12px; margin: 6px 0; }
.swipe__delete {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 88px;
  border: 0;
  background: var(--low);
  color: #fff;
  font-weight: 600;
}
.swipe__content { position: relative; transition: transform 0.2s ease; touch-action: pan-y; }
.swipe .card { margin: 0; }

.days { display: flex; gap: 6px; margin: 10px 0; }
.day { flex: 1; border: 0; border-radius: 10px; background: var(--card); padding: 8px 0; font-size: 13px; }
.day--on { background: var(--accent); color: #fff; font-weight: 600; }

.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.actions { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.btn--wide { width: 100%; }
```

- [ ] **Step 7: Проверка и коммит**

Run: `npx vitest run web/src && npm run typecheck`
Expected: PASS, ошибок типов нет.

```bash
git add web/src/lib web/src/ui web/src/styles.css
git commit -m "feat(web): time, days, nearest and plural helpers; shared UI pieces"
```

---

### Task 5: Вкладка «Задачи» — сегодня, рутины, редакторы

**Files:**
- Create: `web/src/tabs/TasksTab.tsx`, `web/src/tabs/TaskEditor.tsx`, `web/src/tabs/RoutineEditor.tsx`

**Interfaces:**
- Consumes: `Api`, `AppState`, `Task`, `Routine`, `CompleteResult` (Task 2); `errorText` (Task 2); `NEED_EMOJI` (Task 2); `dueAtToday`, `timeOf`, `DAY_SHORT`, `ALL_DAYS`, `hasDay`, `toggleDay`, `daysLabel` (Task 4); `Sheet`, `Segmented`, `NeedPicker`, `ItemRow`, `SwipeRow` (Task 4)
- Produces:
  - `<TasksTab api state onComplete onChanged />`, где `onComplete: (run: () => Promise<CompleteResult>) => Promise<void>` (App празднует и перезагружает состояние), `onChanged: () => Promise<void>` (App перезагружает состояние после создания/правки/удаления)
  - `<TaskEditor api task={Task | null} onClose onSaved={() => Promise<void>} />`
  - `<RoutineEditor api routine={Routine | null} onClose onSaved={() => Promise<void>} />`

Списки задач и рутин вкладка грузит сама и перезагружает при каждом новом `state` из App (после выполнения или правки).

- [ ] **Step 1: `web/src/tabs/TaskEditor.tsx`**

```tsx
import { useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, Need, Task } from '../api/types';
import { dueAtToday, timeOf } from '../lib/time';
import { NeedPicker } from '../ui/NeedPicker';
import { Sheet } from '../ui/Sheet';

const MAX_TITLE = 200;

interface Props {
  api: Api;
  task: Task | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function TaskEditor({ api, task, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [need, setNeed] = useState<Need | null>(task?.need ?? null);
  const [time, setTime] = useState(task?.dueAt ? timeOf(task.dueAt) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!need) return;
    const input = { title: title.trim(), need, dueAt: time ? dueAtToday(time, new Date()) : null };
    return run(() => (task ? api.updateTask(task.id, input) : api.createTask(input)));
  }

  return (
    <Sheet title={task ? 'Задача' : 'Новая задача'} onClose={onClose}>
      <label className="field">
        <span>Что сделать</span>
        <input className="input" value={title} maxLength={MAX_TITLE} autoFocus={!task} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <NeedPicker value={need} onChange={setNeed} />
      <label className="field">
        <span>Время (необязательно)</span>
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="btn btn--primary btn--wide" disabled={busy || !title.trim() || !need} onClick={save}>
          Сохранить
        </button>
        {task && (
          <button className="btn btn--danger btn--wide" disabled={busy} onClick={() => run(() => api.deleteTask(task.id))}>
            Удалить
          </button>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: `web/src/tabs/RoutineEditor.tsx`**

```tsx
import { useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, Need, Routine } from '../api/types';
import { ALL_DAYS, DAY_SHORT, hasDay, toggleDay } from '../lib/days';
import { NeedPicker } from '../ui/NeedPicker';
import { Sheet } from '../ui/Sheet';

const MAX_TITLE = 200;
const DEFAULT_TIME = '09:00';

interface Props {
  api: Api;
  routine: Routine | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function RoutineEditor({ api, routine, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(routine?.title ?? '');
  const [need, setNeed] = useState<Need | null>(routine?.need ?? null);
  const [time, setTime] = useState(routine?.time ?? DEFAULT_TIME);
  const [days, setDays] = useState(routine?.days ?? ALL_DAYS);
  const [active, setActive] = useState(routine?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!need) return;
    const input = { title: title.trim(), need, time, days };
    return run(() => (routine ? api.updateRoutine(routine.id, { ...input, active }) : api.createRoutine(input)));
  }

  return (
    <Sheet title={routine ? 'Рутина' : 'Новая рутина'} onClose={onClose}>
      <label className="field">
        <span>Что делать</span>
        <input className="input" value={title} maxLength={MAX_TITLE} autoFocus={!routine} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <NeedPicker value={need} onChange={setNeed} />
      <label className="field">
        <span>Во сколько</span>
        <input className="input" type="time" value={time} required onChange={(e) => setTime(e.target.value)} />
      </label>
      <div className="days" role="group" aria-label="Дни недели">
        {DAY_SHORT.map((day, index) => (
          <button key={day} type="button" aria-pressed={hasDay(days, index)} className={`day ${hasDay(days, index) ? 'day--on' : ''}`} onClick={() => setDays(toggleDay(days, index))}>
            {day}
          </button>
        ))}
      </div>
      {routine && (
        <label className="field">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Напоминать
        </label>
      )}
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="btn btn--primary btn--wide" disabled={busy || !title.trim() || !need || !time || days === 0} onClick={save}>
          Сохранить
        </button>
        {routine && (
          <button className="btn btn--danger btn--wide" disabled={busy} onClick={() => run(() => api.deleteRoutine(routine.id))}>
            Удалить
          </button>
        )}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: `web/src/tabs/TasksTab.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, AppState, CompleteResult, Routine, Task } from '../api/types';
import { daysLabel } from '../lib/days';
import { NEED_EMOJI } from '../lib/needs';
import { timeOf } from '../lib/time';
import { ItemRow } from '../ui/ItemRow';
import { Segmented } from '../ui/Segmented';
import { SwipeRow } from '../ui/SwipeRow';
import { RoutineEditor } from './RoutineEditor';
import { TaskEditor } from './TaskEditor';

type View = 'today' | 'routines';
type Editing = { kind: 'task'; task: Task | null } | { kind: 'routine'; routine: Routine | null } | null;

const VIEWS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'routines', label: 'Рутины' },
] as const;

interface Props {
  api: Api;
  state: AppState;
  onComplete: (run: () => Promise<CompleteResult>) => Promise<void>;
  onChanged: () => Promise<void>;
}

export function TasksTab({ api, state, onComplete, onChanged }: Props) {
  const [view, setView] = useState<View>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextTasks, nextRoutines] = await Promise.all([api.listTasks(), api.listRoutines()]);
      setTasks(nextTasks);
      setRoutines(nextRoutines);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load, state]);

  async function remove(action: () => Promise<void>) {
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const add = () => setEditing(view === 'today' ? { kind: 'task', task: null } : { kind: 'routine', routine: null });

  return (
    <>
      <div className="screen-title">Задачи</div>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error && <div className="error">{error}</div>}
      {view === 'today' ? (
        <TodayList api={api} state={state} tasks={tasks} onComplete={onComplete} onEdit={(task) => setEditing({ kind: 'task', task })} onDelete={(id) => remove(() => api.deleteTask(id))} />
      ) : (
        <RoutineList routines={routines} onEdit={(routine) => setEditing({ kind: 'routine', routine })} onDelete={(id) => remove(() => api.deleteRoutine(id))} />
      )}
      <button className="fab" aria-label={view === 'today' ? 'Новая задача' : 'Новая рутина'} onClick={add}>
        +
      </button>
      {editing?.kind === 'task' && <TaskEditor api={api} task={editing.task} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {editing?.kind === 'routine' && <RoutineEditor api={api} routine={editing.routine} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </>
  );
}

interface TodayProps {
  api: Api;
  state: AppState;
  tasks: Task[];
  onComplete: Props['onComplete'];
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
}

function TodayList({ api, state, tasks, onComplete, onEdit, onDelete }: TodayProps) {
  const open = tasks.filter((t) => t.need && !t.doneAt);
  const done = tasks.filter((t) => t.need && t.doneAt);
  if (state.routinesToday.length + open.length + done.length === 0) {
    return <div className="empty">На сегодня пусто. Нажми «+» или просто напиши боту 🐾</div>;
  }
  return (
    <>
      {state.routinesToday.map((r) => (
        <ItemRow key={`r${r.id}`} emoji={NEED_EMOJI[r.need]} title={r.title} meta={r.time} done={r.done} onToggle={() => onComplete(() => api.completeRoutine(r.id))} />
      ))}
      {open.map((t) => (
        <SwipeRow key={t.id} onDelete={() => onDelete(t.id)}>
          <ItemRow
            emoji={t.need ? NEED_EMOJI[t.need] : ''}
            title={t.title}
            meta={t.dueAt ? timeOf(t.dueAt) : undefined}
            done={false}
            onToggle={() => onComplete(() => api.completeTask(t.id))}
            onOpen={() => onEdit(t)}
          />
        </SwipeRow>
      ))}
      {done.map((t) => (
        <ItemRow key={t.id} emoji={t.need ? NEED_EMOJI[t.need] : ''} title={t.title} done />
      ))}
    </>
  );
}

function RoutineList({ routines, onEdit, onDelete }: { routines: Routine[]; onEdit: (r: Routine) => void; onDelete: (id: number) => void }) {
  if (routines.length === 0) return <div className="empty">Рутин пока нет. Таблетки, зарядка, полить цветы — добавь через «+» 🐾</div>;
  return (
    <>
      {routines.map((r) => (
        <SwipeRow key={r.id} onDelete={() => onDelete(r.id)}>
          <ItemRow emoji={NEED_EMOJI[r.need]} title={r.title} meta={`${daysLabel(r.days)} · ${r.time}`} done={false} muted={!r.active} onOpen={() => onEdit(r)} />
        </SwipeRow>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Проверка и коммит**

Run: `npm run typecheck && npx vitest run web/src`
Expected: ошибок типов нет, тесты зелёные. (Вкладка подключается к App в Task 7 и проверяется в браузере в Task 8.)

```bash
git add web/src/tabs/TasksTab.tsx web/src/tabs/TaskEditor.tsx web/src/tabs/RoutineEditor.tsx
git commit -m "feat(web): tasks tab with today/routines lists, swipe delete and editors"
```

---

### Task 6: Вкладка «Сокровища» — записки и альбом

**Files:**
- Create: `web/src/tabs/TreasuresTab.tsx`, `web/src/tabs/PhotoTile.tsx`
- Modify: `web/src/styles.css` (дописать в конец)

**Interfaces:**
- Consumes: `Api`, `Rewards` (Task 2); `errorText` (Task 2); `pluralRu` (Task 4); `Sheet`, `Segmented` (Task 4); `TUNING` из `src/core/tuning.ts` (`photoEvery`)
- Produces: `<TreasuresTab api />`; `<PhotoTile api id caption onOpen={(url) => void} />` — грузит фото через `api.photo(id)` в object URL, освобождает его при размонтировании; при ошибке — плитка-заглушка «🐾 не загрузилось»

- [ ] **Step 1: `web/src/tabs/PhotoTile.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Api } from '../api/types';

interface Props {
  api: Api;
  id: number;
  caption: string | null;
  onOpen: (url: string) => void;
}

export function PhotoTile({ api, id, caption, onOpen }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    api.photo(id).then(
      (blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, id]);

  if (failed) {
    return (
      <div className="tile tile--broken" role="img" aria-label="Фото не загрузилось">
        🐾<small>не загрузилось</small>
      </div>
    );
  }
  if (!url) return <div className="tile tile--loading" aria-label="Загружается" />;
  return (
    <button className="tile" onClick={() => onOpen(url)}>
      <img src={url} alt={caption ?? 'Фото'} />
    </button>
  );
}
```

- [ ] **Step 2: `web/src/tabs/TreasuresTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { TUNING } from '../../../src/core/tuning';
import { errorText } from '../api/errors';
import type { Api, Rewards } from '../api/types';
import { pluralRu } from '../lib/plural';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { PhotoTile } from './PhotoTile';

type View = 'notes' | 'album';
const VIEWS = [
  { value: 'notes', label: '💌 Записки' },
  { value: 'album', label: '📷 Альбом' },
] as const;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export function TreasuresTab({ api }: { api: Api }) {
  const [view, setView] = useState<View>('notes');
  const [data, setData] = useState<Rewards | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rewards().then(setData, (e: unknown) => setError(errorText(e)));
  }, [api]);

  return (
    <>
      <div className="screen-title">Сокровища</div>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error && <div className="error">{error}</div>}
      {data && (view === 'notes' ? <Notes notes={data.notes} /> : <Album api={api} rewards={data} />)}
    </>
  );
}

function Notes({ notes }: { notes: Rewards['notes'] }) {
  if (notes.length === 0) return <div className="empty">Записки появляются, когда Шантику очень-очень хорошо 💌</div>;
  return (
    <>
      {notes.map((note) => (
        <div key={note.id} className="card note">
          <div>💌 {note.text}</div>
          <div className="muted">{dateOf(note.unlockedAt)}</div>
        </div>
      ))}
    </>
  );
}

function Album({ api, rewards }: { api: Api; rewards: Rewards }) {
  const [opened, setOpened] = useState<{ url: string; caption: string | null } | null>(null);
  const { photos, lockedPhotos, nextPhotoIn } = rewards;
  if (photos.length + lockedPhotos === 0) return <div className="empty">Тут будут фото 📷</div>;
  const progress = `${TUNING.photoEvery - nextPhotoIn}/${TUNING.photoEvery}`;
  return (
    <>
      <div className="grid">
        {photos.map((photo) => (
          <PhotoTile key={photo.id} api={api} id={photo.id} caption={photo.caption} onOpen={(url) => setOpened({ url, caption: photo.caption })} />
        ))}
        {Array.from({ length: lockedPhotos }, (_, index) => (
          <div key={`locked${index}`} className="tile tile--locked" aria-label="Закрытое фото">
            🔒{index === 0 && <small>{progress}</small>}
          </div>
        ))}
      </div>
      {lockedPhotos > 0 && (
        <p className="muted center-text">
          следующее фото — через {nextPhotoIn} {pluralRu(nextPhotoIn, ['задачу', 'задачи', 'задач'])}
        </p>
      )}
      {opened && (
        <Sheet title={opened.caption ?? 'Фото'} onClose={() => setOpened(null)}>
          <img className="viewer" src={opened.url} alt={opened.caption ?? 'Фото'} />
        </Sheet>
      )}
    </>
  );
}
```

- [ ] **Step 3: Стили — дописать в конец `web/src/styles.css`**

```css
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 6px 0; }
.tile {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: var(--card);
  padding: 0;
  font-size: 28px;
}
.tile img { width: 100%; height: 100%; object-fit: cover; }
.tile small { font-size: 13px; color: var(--muted); }
.tile--locked { background: var(--track); color: #bbb; }
.tile--broken { background: var(--track); }
.tile--loading { background: var(--track); animation: pulse 1.2s ease-in-out infinite alternate; }
.note > div:first-child { overflow-wrap: anywhere; }
.viewer { width: 100%; border-radius: 12px; display: block; }
.center-text { text-align: center; }

@keyframes pulse { from { opacity: 0.6; } to { opacity: 1; } }
```

- [ ] **Step 4: Проверка и коммит**

Run: `npm run typecheck && npx vitest run web/src`
Expected: ошибок типов нет, тесты зелёные.

```bash
git add web/src/tabs/TreasuresTab.tsx web/src/tabs/PhotoTile.tsx web/src/styles.css
git commit -m "feat(web): treasures tab with notes, album and locked photo progress"
```

---

### Task 7: Вкладка Шантика, настройки, оболочка приложения

**Files:**
- Create: `web/src/tabs/NeedBars.tsx`, `web/src/tabs/PetTab.tsx`, `web/src/tabs/SettingsSheet.tsx`, `web/src/useTimezoneSync.ts`
- Modify: `web/src/App.tsx` (заменить временный целиком), `web/src/styles.css` (дописать в конец)

**Interfaces:**
- Consumes: всё из Tasks 1–6: `createApi`, `errorText`, типы; `Shantik`, `speechFor`; `nearest`, `NEED_EMOJI`, `NEED_LABEL`; `Sheet`, `ItemRow`; `TasksTab`, `TreasuresTab`; `hapticSuccess`; `NEEDS` из core
- Produces:
  - `<App />` — три вкладки, загрузка `state`, общий `complete(run)` (haptic + празднование 2,5 с + перезагрузка), экран загрузки/ошибки с кнопкой повтора, баннер ошибки, тост праздника на других вкладках
  - `useTimezoneSync(api, settings, onSynced)` — один раз на устройстве (флаг в `localStorage`) отправляет часовой пояс устройства, если он отличается от сохранённого
  - `<PetTab api state celebrating seed onComplete onSettings />`, `<NeedBars needs />`, `<SettingsSheet api settings onClose onSaved />`

- [ ] **Step 1: `web/src/tabs/NeedBars.tsx`**

```tsx
import { NEEDS } from '../../../src/core/types';
import type { Needs } from '../api/types';
import { NEED_EMOJI, NEED_LABEL } from '../lib/needs';

const LOW = 30;

export function NeedBars({ needs }: { needs: Needs }) {
  return (
    <div className="bars">
      {NEEDS.map((need) => (
        <div key={need} className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={needs[need]} aria-label={NEED_LABEL[need]}>
          <span className="bar__emoji">{NEED_EMOJI[need]}</span>
          <div className="bar__track">
            <div className={`bar__fill ${needs[need] < LOW ? 'bar__fill--low' : ''}`} style={{ width: `${needs[need]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `web/src/tabs/PetTab.tsx`**

```tsx
import type { Api, AppState, CompleteResult } from '../api/types';
import { nearest, type NearestItem } from '../lib/nearest';
import { NEED_EMOJI } from '../lib/needs';
import { speechFor } from '../pet/phrases';
import { Shantik } from '../pet/Shantik';
import { ItemRow } from '../ui/ItemRow';
import { NeedBars } from './NeedBars';

interface Props {
  api: Api;
  state: AppState;
  celebrating: boolean;
  seed: number;
  onComplete: (run: () => Promise<CompleteResult>) => Promise<void>;
  onSettings: () => void;
}

export function PetTab({ api, state, celebrating, seed, onComplete, onSettings }: Props) {
  const items = nearest(state);
  const complete = (item: NearestItem) =>
    onComplete(() => (item.kind === 'task' ? api.completeTask(item.id) : api.completeRoutine(item.id)));

  return (
    <>
      <div className="screen-title">
        Шантик
        <button className="gear" aria-label="Настройки" onClick={onSettings}>
          ⚙︎
        </button>
      </div>
      <Shantik mood={state.mood} celebrating={celebrating} />
      <div className="speech" aria-live="polite">
        {speechFor(state.mood, celebrating, seed)}
      </div>
      <NeedBars needs={state.needs} />
      <div className="section-label">Ближайшее</div>
      {items.length === 0 ? (
        <div className="empty">Пока ничего не запланировано. Напиши боту, что хочешь сделать 🐾</div>
      ) : (
        items.map((item) => (
          <ItemRow key={item.key} emoji={NEED_EMOJI[item.need]} title={item.title} meta={item.time ?? undefined} done={false} onToggle={() => complete(item)} />
        ))
      )}
    </>
  );
}
```

- [ ] **Step 3: `web/src/tabs/SettingsSheet.tsx`**

```tsx
import { useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, Settings } from '../api/types';
import { Sheet } from '../ui/Sheet';

interface Props {
  api: Api;
  settings: Settings;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}

function timezones(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes(current) ? all : [current, ...all];
}

export function SettingsSheet({ api, settings, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setQuiet = (key: 'start' | 'end', value: string) => setDraft({ ...draft, quiet: { ...draft.quiet, [key]: value } });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateSettings(draft));
      onClose();
    } catch (e) {
      setError(errorText(e, 'settings'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Настройки" onClose={onClose}>
      <div className="section-label">Тихие часы — Шантик спит и не пишет</div>
      <div className="row-2">
        <label className="field">
          <span>С</span>
          <input className="input" type="time" value={draft.quiet.start} onChange={(e) => setQuiet('start', e.target.value)} />
        </label>
        <label className="field">
          <span>До</span>
          <input className="input" type="time" value={draft.quiet.end} onChange={(e) => setQuiet('end', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Часовой пояс</span>
        <select className="input" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
          {timezones(draft.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="btn btn--primary btn--wide" disabled={saving} onClick={save}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: `web/src/useTimezoneSync.ts`**

```ts
import { useEffect } from 'react';
import type { Api, Settings } from './api/types';

const SYNCED_KEY = 'shantik.timezone-synced';

function alreadySynced(): boolean {
  try {
    return localStorage.getItem(SYNCED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSynced(): void {
  try {
    localStorage.setItem(SYNCED_KEY, '1');
  } catch {
    // Хранилище недоступно — синхронизация повторится при следующем открытии, это безопасно.
  }
}

/** Спека: часовой пояс при первом открытии — из Intl. Потом пояс меняется только в настройках. */
export function useTimezoneSync(api: Api | null, settings: Settings | undefined, onSynced: (settings: Settings) => void): void {
  useEffect(() => {
    if (!api || !settings || alreadySynced()) return;
    markSynced();
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (device === settings.timezone) return;
    api.updateSettings({ ...settings, timezone: device }).then(onSynced, (error: unknown) => {
      console.error('[timezone] не удалось сохранить часовой пояс', error);
    });
  }, [api, settings, onSynced]);
}
```

- [ ] **Step 5: `web/src/App.tsx` — заменить целиком**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { createApi } from './api';
import { errorText } from './api/errors';
import type { Api, AppState, CompleteResult, Settings } from './api/types';
import { speechFor } from './pet/phrases';
import { PetTab } from './tabs/PetTab';
import { SettingsSheet } from './tabs/SettingsSheet';
import { TasksTab } from './tabs/TasksTab';
import { TreasuresTab } from './tabs/TreasuresTab';
import { hapticSuccess } from './telegram';
import { useTimezoneSync } from './useTimezoneSync';

const CELEBRATE_MS = 2500;
type Tab = 'pet' | 'tasks' | 'treasures';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'pet', label: '🐶 Шантик' },
  { id: 'tasks', label: '✅ Задачи' },
  { id: 'treasures', label: '🎁 Сокровища' },
];
/** Фраза Шантика меняется раз в день, а не на каждый рендер. */
const SEED = new Date().getDate();

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pet');
  const [celebrating, setCelebrating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!api) return;
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void createApi().then(setApi);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  const applySettings = useCallback((settings: Settings) => setState((s) => (s ? { ...s, settings } : s)), []);
  useTimezoneSync(api, state?.settings, applySettings);

  const complete = useCallback(
    async (run: () => Promise<CompleteResult>) => {
      try {
        if ((await run()).completed) {
          hapticSuccess();
          setCelebrating(true);
        }
        await reload();
      } catch (e) {
        setError(errorText(e));
      }
    },
    [reload],
  );

  if (!api || !state) return <Splash error={error} onRetry={reload} />;

  return (
    <div className="app">
      <main className="screen">
        {error && (
          <div className="banner" role="alert">
            {error}
          </div>
        )}
        {tab === 'pet' && (
          <PetTab api={api} state={state} celebrating={celebrating} seed={SEED} onComplete={complete} onSettings={() => setSettingsOpen(true)} />
        )}
        {tab === 'tasks' && <TasksTab api={api} state={state} onComplete={complete} onChanged={reload} />}
        {tab === 'treasures' && <TreasuresTab api={api} />}
      </main>
      {celebrating && tab !== 'pet' && <div className="toast">{speechFor(state.mood, true, SEED)}</div>}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab--on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {settingsOpen && <SettingsSheet api={api} settings={state.settings} onClose={() => setSettingsOpen(false)} onSaved={applySettings} />}
    </div>
  );
}

function Splash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="app">
      <main className="screen center">
        <div className="empty">{error ?? 'Шантик просыпается… 🐾'}</div>
        {error && (
          <button className="btn" onClick={onRetry}>
            Попробовать ещё раз
          </button>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Стили — дописать в конец `web/src/styles.css`**

```css
.gear { position: absolute; right: 0; border: 0; background: none; font-size: 22px; color: var(--muted); padding: 4px 8px; }

.speech {
  position: relative;
  margin: 4px auto 12px;
  max-width: 280px;
  background: var(--card);
  border-radius: 14px;
  padding: 8px 14px;
  text-align: center;
}

.bars { display: grid; gap: 8px; margin: 8px 0; }
.bar { display: flex; align-items: center; gap: 8px; }
.bar__emoji { width: 24px; text-align: center; }
.bar__track { flex: 1; height: 10px; background: var(--track); border-radius: 5px; overflow: hidden; }
.bar__fill { height: 100%; background: var(--fur); border-radius: 5px; transition: width 0.6s ease; }
.bar__fill--low { background: var(--low); }

.banner { background: #fde8ea; color: #a33a48; border-radius: 12px; padding: 8px 12px; margin-bottom: 8px; font-size: 14px; }

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bottom) + 72px);
  transform: translateX(-50%);
  z-index: 5;
  background: var(--text);
  color: #fff;
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 14px;
  white-space: nowrap;
}

.center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
```

- [ ] **Step 7: Проверка и коммит**

Run: `npm run typecheck && npx vitest run && npm run build:web`
Expected: ошибок типов нет, все тесты (сервер + web) зелёные, сборка проходит.

Run: `npm run dev:web` и открыть `http://localhost:5173` — приложение стартует на заглушке API, видны три вкладки. (Подробная проверка — в Task 8.)

```bash
git add web/src
git commit -m "feat(web): pet tab, settings, timezone sync and app shell"
```

---

### Task 8: Сборка на Vercel и проверка в браузере 390×844

**Files:**
- Modify: `vercel.json`, `CLAUDE.md`
- Possibly modify: файлы `web/src/**` — только чтобы исправить найденное при проверке

**Interfaces:**
- Consumes: всё приложение (Tasks 1–7)
- Produces: `vercel.json` собирает Mini App (`npm run build:web` → `web/dist`), функции `api/*` продолжают работать; отчёт о проверке со скриншотами

- [ ] **Step 1: `vercel.json`**

```json
{
  "regions": ["fra1"],
  "buildCommand": "npm run build:web",
  "outputDirectory": "web/dist"
}
```

- [ ] **Step 2: `CLAUDE.md` — в раздел «Стек», в строку «Команды» добавить**

```
`npm run dev:web` (Mini App в браузере на заглушке API), `npm run build:web`
```

- [ ] **Step 3: Проверка в браузере**

Запустить `npm run dev:web -- --port 5173 --strictPort` в фоне. Через Playwright MCP открыть `http://localhost:5173`, размер окна 390×844. Скриншоты сохранять в `.superpowers/sdd/2026-10-06-shantik-03-mini-app/screens/` (git-игнор). Чек-лист — каждый пункт отметить в отчёте «ок» или «исправлено: …»:

1. **Шантик**: шпиц в состоянии `asking:food` (грустные брови, миска справа), реплика из пула миски, шкала 🍖 красная (22), остальные рыжие; в «Ближайшем» «Таблетки 20:00», «Выпить воды», «Ответить Маше».
2. **Выполнение**: тап по кружку «Выпить воды» → Шантик прыгает с искрами и показывает фразу праздника ~2,5 с, шкала 🍖 растёт, строка исчезает из «Ближайшего».
3. **Двойной тап** (Review Focus): два быстрых клика по кружку «Ответить Маше» — во время запроса кружок заблокирован (`disabled`), выполнение одно.
4. **Задачи → Сегодня**: «+» → новая задача с названием из 200 символов «А» без пробелов, потребность 🎾, время 18:30 → строка переносится, нет горизонтальной прокрутки: `document.documentElement.scrollWidth <= 390` (Review Focus).
5. **Свайп**: протащить строку задачи влево (mouse down → move −120 px → up) → видна красная «Удалить» → тап удаляет. Тап по задаче → редактор → кнопка «Удалить» тоже удаляет.
6. **Рутины**: «+» → рутина «Зарядка», 🦮, 08:00, дни Пн–Пт → строка «по будням · 08:00». Редактор: снять «Напоминать» → строка бледная.
7. **Празднование на другой вкладке**: выполнить рутину «Таблетки» на вкладке «Задачи» → внизу тост с фразой праздника.
8. **Сокровища**: записка с датой; в альбоме первое фото открывается в листе; фото «Это фото не загрузится» показывает «🐾 не загрузилось» (Review Focus); две закрытые плитки, на первой «3/10»; подпись «следующее фото — через 7 задач».
9. **Настройки**: шестерёнка → начало 02:00 → «Сохранить» → текст «Тихие часы: начало с 20:00 до 00:00, конец с 05:00 до 12:00.», лист не закрылся (Review Focus); 22:00–08:00 → сохраняется, лист закрывается.
10. **Safe area**: верх контента ниже 47 px выреза, таб-бар выше 34 px полоски; лист настроек не уходит под полоску.
11. **Консоль браузера** без ошибок React (ключи, неконтролируемые инпуты и т.п.).

Найденные проблемы исправить в соответствующих файлах `web/src/**`, повторить пункт, `npm run typecheck && npx vitest run` — зелёные.

- [ ] **Step 4: Итоговая проверка**

Run: `npm run typecheck && npx vitest run && npm run build:web`
Expected: всё зелёное, `web/dist` собран.

- [ ] **Step 5: Commit**

```bash
git add vercel.json CLAUDE.md web/src
git commit -m "feat(web): Vercel build for Mini App, browser-verified at 390x844"
```
