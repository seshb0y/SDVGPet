# Шантик — план 1: core (чистая логика) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать и покрыть тестами всю логику питомца и планировщика сообщений как чистые функции в `src/core/`.

**Architecture:** Functional core: модули без I/O, без `Date.now()` и `Math.random()` — время передаётся аргументом. Следующие планы (сервер, Mini App) только вызывают эти функции. Это план 1 из 4: core → сервер (БД, бот, tick, API) → Mini App → деплой.

**Tech Stack:** TypeScript 5 (strict, ESM), Node 22, vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-05-shantik-design.md`

## Global Constraints

- `src/core/` не импортирует ничего из `src/db`, `src/bot`, `api/`, `web/` и не делает I/O.
- Нет `Date.now()`, `new Date()` без аргументов, `Math.random()` внутри `src/core/`.
- Функции не мутируют аргументы, возвращают новые объекты.
- Потребности: `food` (🍖 Миска), `walk` (🦮 Прогулка), `play` (🎾 Игра), `love` (🤍 Ласка).
- Шкалы 0–100, нижний предел 10, убывание в час: food 7, walk 5, play 5, love 4; только вне тихих часов.
- Выполнение задачи +35 (максимум 100); первая задача после перерыва ≥ 24 ч — +70.
- Порог «просит» < 30, «радуется» — все ≥ 60.
- Записка: все четыре ≥ 80, не чаще раза в календарный день. Фото: каждые 10 выполненных задач.
- Лимит 6 сообщений в день на сигналы, повторы, утро и вечер; рутины и награды вне лимита.
- Сигнал потребности не чаще 1 раза в 3 ч на потребность; после 3 неотвеченных сигналов подряд — 6 ч до утра.
- Повтор через 90 мин после неотвеченного сигнала, один раз.
- Утро — через 30 мин после конца тихих часов; вечер — за 60 мин до начала тихих часов.
- Все числа — в `src/core/tuning.ts`.
- Файлы до ~200 строк, функции до ~40 строк. Тексты и комментарии на русском, идентификаторы на английском.

## Review Focus

- **Тихие часы через полночь** (23:00–09:00): 00:30 и 08:59 — тихо, 09:00 и 22:59 — нет. Тест в Task 1.
- **Долгий перерыв** (бот не вызывался неделю): убывание не уходит ниже 10 и считается быстро (не перебирает неделю поминутно без предела). Тест в Task 2.
- **Пропущенное время рутины** (деплой в 15:00, рутина в 20:00, сейчас 21:00): не отправлять рутину спустя час и больше — только в окне 60 мин после её времени. Тест в Task 5.
- **Рутина внутри тихих часов** (рутина 08:00 при тихих 23:00–09:00): никогда не отправляется. Тест в Task 5.
- **Повторный tick в ту же минуту**: планировщик выдаёт те же `dedupKey`, так что атомарный захват в БД отсечёт дубль. Тест в Task 8.

## File Structure

```
package.json            скрипты, devDependencies
tsconfig.json           strict ESM
vitest.config.ts        тесты из tests/
src/core/
  types.ts              Need, Needs, Settings, Routine, OutboxEntry, RoutineLogEntry
  tuning.ts             все числа механики
  time.ts               локальное время в поясе, тихие часы, HH:MM
  needs.ts              decay(), applyCompletion()
  mood.ts               petState()
  rewards.ts            rewardsEarned()
  schedule/
    routines.ts         dueRoutines()
    signals.ts          needSignal(), followup()
    checkins.ts         morningEvening()
    plan.ts             planTick() — сборка, лимит, приоритеты
tests/core/             по файлу тестов на модуль
```

---

### Task 1: Каркас проекта, типы, константы и время

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/core/types.ts`, `src/core/tuning.ts`, `src/core/time.ts`
- Test: `tests/core/time.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `NEEDS: readonly ['food','walk','play','love']`, `type Need`, `type Needs = Readonly<Record<Need, number>>`
  - `interface QuietHours { start: string; end: string }` (формат `"HH:MM"`)
  - `interface Settings { timezone: string; quiet: QuietHours }`
  - `interface Routine { id: number; need: Need; time: string; days: number; active: boolean }` — `days` битовая маска, бит 0 = понедельник … бит 6 = воскресенье
  - `interface RoutineLogEntry { routineId: number; doneAt: Date | null; snoozedUntil: Date | null }`
  - `type CappedKind = 'need' | 'followup' | 'morning' | 'evening'`
  - `interface OutboxEntry { id: number; kind: CappedKind; need: Need | null; sentAt: Date; answeredAt: Date | null; followedUp: boolean }`
  - `TUNING` (объект констант, см. Step 3)
  - `parseHHMM(value: string): number` — минуты от полуночи, бросает `Error` на кривой строке
  - `interface LocalTime { date: string; minutes: number; weekday: number }` — `date` = `"YYYY-MM-DD"`, `weekday` 0 = пн … 6 = вс
  - `localTime(at: Date, timeZone: string): LocalTime`
  - `isQuiet(minutes: number, quiet: QuietHours): boolean`
  - `minutesSince(from: number, to: number): number` — сколько минут от `from` до `to` по кругу суток

- [ ] **Step 1: Создать каркас и поставить зависимости**

```bash
npm init -y
npm i -D typescript vitest @types/node@22
```

Заменить `package.json` на:

```json
{
  "name": "sdvgpet",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {}
}
```

и вернуть в `devDependencies` версии, которые поставил `npm i` (не менять их руками).

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 2: Типы — `src/core/types.ts`**

```ts
export const NEEDS = ['food', 'walk', 'play', 'love'] as const;
export type Need = (typeof NEEDS)[number];
export type Needs = Readonly<Record<Need, number>>;

/** Тихие часы, строки "HH:MM". Могут переходить через полночь (23:00–09:00). */
export interface QuietHours {
  start: string;
  end: string;
}

export interface Settings {
  timezone: string;
  quiet: QuietHours;
}

/** days — битовая маска: бит 0 = понедельник … бит 6 = воскресенье. */
export interface Routine {
  id: number;
  need: Need;
  time: string;
  days: number;
  active: boolean;
}

/** Запись о рутине за сегодняшнюю дату. */
export interface RoutineLogEntry {
  routineId: number;
  doneAt: Date | null;
  snoozedUntil: Date | null;
}

/** Виды сообщений, входящих в дневной лимит. */
export type CappedKind = 'need' | 'followup' | 'morning' | 'evening';

/** Отправленное сегодня сообщение из лимита. */
export interface OutboxEntry {
  id: number;
  kind: CappedKind;
  need: Need | null;
  sentAt: Date;
  answeredAt: Date | null;
  followedUp: boolean;
}
```

- [ ] **Step 3: Константы — `src/core/tuning.ts`**

```ts
/** Все числа механики в одном месте — крутить здесь. */
export const TUNING = {
  max: 100,
  floor: 10,
  decayPerHour: { food: 7, walk: 5, play: 5, love: 4 },
  completionGain: 35,
  comebackGain: 70,
  comebackAfterHours: 24,
  askBelow: 30,
  happyFrom: 60,
  noteFrom: 80,
  photoEvery: 10,
  /** Дальше 72 ч назад не считаем: к этому моменту все шкалы уже на полу. */
  maxDecayHours: 72,
  dailyCap: 6,
  signalSlotHours: 3,
  tiredSignalSlotHours: 6,
  tiredAfterUnanswered: 3,
  followupAfterMinutes: 90,
  morningAfterQuietMinutes: 30,
  eveningBeforeQuietMinutes: 60,
  checkinWindowMinutes: 60,
  routineWindowMinutes: 60,
} as const;
```

- [ ] **Step 4: Написать падающие тесты — `tests/core/time.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isQuiet, localTime, minutesSince, parseHHMM } from '../../src/core/time.js';

const QUIET = { start: '23:00', end: '09:00' };

describe('parseHHMM', () => {
  it('переводит HH:MM в минуты от полуночи', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('бросает ошибку на некорректной строке', () => {
    expect(() => parseHHMM('24:00')).toThrow();
    expect(() => parseHHMM('9:00')).toThrow();
    expect(() => parseHHMM('abc')).toThrow();
  });
});

describe('localTime', () => {
  it('возвращает дату, минуты и день недели в поясе', () => {
    // 06:00 UTC = 09:00 МСК, 27.12.2026 — воскресенье
    expect(localTime(new Date('2026-12-27T06:00:00Z'), 'Europe/Moscow')).toEqual({
      date: '2026-12-27',
      minutes: 540,
      weekday: 6,
    });
  });

  it('после полуночи по поясу дата уже следующая', () => {
    // 21:30 UTC 26.12 = 00:30 МСК 27.12
    expect(localTime(new Date('2026-12-26T21:30:00Z'), 'Europe/Moscow')).toEqual({
      date: '2026-12-27',
      minutes: 30,
      weekday: 6,
    });
  });
});

describe('isQuiet', () => {
  it('тихие часы через полночь', () => {
    expect(isQuiet(parseHHMM('23:00'), QUIET)).toBe(true);
    expect(isQuiet(parseHHMM('00:30'), QUIET)).toBe(true);
    expect(isQuiet(parseHHMM('08:59'), QUIET)).toBe(true);
    expect(isQuiet(parseHHMM('09:00'), QUIET)).toBe(false);
    expect(isQuiet(parseHHMM('22:59'), QUIET)).toBe(false);
  });

  it('тихие часы внутри суток', () => {
    const day = { start: '13:00', end: '15:00' };
    expect(isQuiet(parseHHMM('14:00'), day)).toBe(true);
    expect(isQuiet(parseHHMM('15:00'), day)).toBe(false);
  });

  it('одинаковые начало и конец — тихих часов нет', () => {
    expect(isQuiet(0, { start: '00:00', end: '00:00' })).toBe(false);
  });
});

describe('minutesSince', () => {
  it('считает по кругу суток', () => {
    expect(minutesSince(parseHHMM('20:00'), parseHHMM('20:30'))).toBe(30);
    expect(minutesSince(parseHHMM('23:30'), parseHHMM('00:15'))).toBe(45);
  });
});
```

- [ ] **Step 5: Запустить — должны упасть**

Run: `npx vitest run tests/core/time.test.ts`
Expected: FAIL — `Failed to load url ../../src/core/time.js` (модуля ещё нет).

- [ ] **Step 6: Реализация — `src/core/time.ts`**

```ts
import type { QuietHours } from './types.js';

const MINUTES_PER_DAY = 1440;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface LocalTime {
  /** "YYYY-MM-DD" в поясе пользователя */
  date: string;
  /** минуты от полуночи, 0..1439 */
  minutes: number;
  /** 0 = понедельник … 6 = воскресенье */
  weekday: number;
}

export function parseHHMM(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Некорректное время: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function localTime(at: Date, timeZone: string): LocalTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
  };
}

export function isQuiet(minutes: number, quiet: QuietHours): boolean {
  const start = parseHHMM(quiet.start);
  const end = parseHHMM(quiet.end);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function minutesSince(from: number, to: number): number {
  return (to - from + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
```

- [ ] **Step 7: Запустить тесты и проверку типов**

Run: `npx vitest run tests/core/time.test.ts && npx tsc --noEmit`
Expected: PASS, 0 ошибок типов.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/core tests/core
git commit -m "feat(core): project scaffold, types, tuning and time helpers"
```

---

### Task 2: Шкалы — убывание и выполнение задачи

**Files:**
- Create: `src/core/needs.ts`
- Test: `tests/core/needs.test.ts`

**Interfaces:**
- Consumes: `NEEDS`, `Need`, `Needs`, `Settings` (types.ts); `TUNING`; `localTime`, `isQuiet` (time.ts)
- Produces:
  - `wakingMinutes(from: Date, to: Date, settings: Settings): number` — минуты вне тихих часов между моментами, не больше `TUNING.maxDecayHours * 60` последних
  - `decay(needs: Needs, from: Date, to: Date, settings: Settings): Needs`
  - `applyCompletion(needs: Needs, need: Need, lastCompletedAt: Date | null, now: Date): Needs` — `lastCompletedAt` = время предыдущего выполнения задачи (в плане 2 хранится в `pet.last_completed_at`)
  - `INITIAL_NEEDS: Needs` — все шкалы по 100

- [ ] **Step 1: Написать падающие тесты — `tests/core/needs.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { INITIAL_NEEDS, applyCompletion, decay, wakingMinutes } from '../../src/core/needs.js';
import type { Needs, Settings } from '../../src/core/types.js';

const SETTINGS: Settings = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };
const FULL: Needs = Object.freeze({ food: 100, walk: 100, play: 100, love: 100 });

describe('wakingMinutes', () => {
  it('не считает тихие часы', () => {
    // 22:00 МСК → 10:00 МСК следующего дня: бодрствование 22–23 и 9–10
    expect(wakingMinutes(new Date('2026-12-27T19:00:00Z'), new Date('2026-12-28T07:00:00Z'), SETTINGS)).toBe(120);
  });

  it('ноль, если to не позже from', () => {
    const at = new Date('2026-12-27T10:00:00Z');
    expect(wakingMinutes(at, at, SETTINGS)).toBe(0);
    expect(wakingMinutes(at, new Date('2026-12-27T09:00:00Z'), SETTINGS)).toBe(0);
  });

  it('недельный перерыв ограничен maxDecayHours и считается быстро', () => {
    const started = performance.now();
    const minutes = wakingMinutes(new Date('2026-12-20T06:00:00Z'), new Date('2026-12-27T06:00:00Z'), SETTINGS);
    expect(minutes).toBeLessThanOrEqual(72 * 60);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('decay', () => {
  it('убывает с разной скоростью за 2 часа бодрствования', () => {
    // 09:00 → 11:00 МСК
    const result = decay(FULL, new Date('2026-12-27T06:00:00Z'), new Date('2026-12-27T08:00:00Z'), SETTINGS);
    expect(result).toEqual({ food: 86, walk: 90, play: 90, love: 92 });
  });

  it('не меняется за ночь в тихие часы', () => {
    // 23:00 → 09:00 МСК
    const result = decay(FULL, new Date('2026-12-27T20:00:00Z'), new Date('2026-12-28T06:00:00Z'), SETTINGS);
    expect(result).toEqual(FULL);
  });

  it('не опускается ниже 10 после долгого перерыва', () => {
    const result = decay(FULL, new Date('2026-12-20T06:00:00Z'), new Date('2026-12-27T06:00:00Z'), SETTINGS);
    expect(result).toEqual({ food: 10, walk: 10, play: 10, love: 10 });
  });

  it('не мутирует входные шкалы', () => {
    decay(FULL, new Date('2026-12-27T06:00:00Z'), new Date('2026-12-27T08:00:00Z'), SETTINGS);
    expect(FULL.food).toBe(100);
  });
});

describe('applyCompletion', () => {
  const now = new Date('2026-12-27T10:00:00Z');
  const low: Needs = { food: 20, walk: 50, play: 50, love: 90 };

  it('добавляет 35 к потребности задачи', () => {
    const recent = new Date('2026-12-27T08:00:00Z');
    expect(applyCompletion(low, 'food', recent, now)).toEqual({ ...low, food: 55 });
  });

  it('не поднимает выше 100', () => {
    expect(applyCompletion(low, 'love', new Date('2026-12-27T08:00:00Z'), now).love).toBe(100);
  });

  it('после перерыва ≥ 24 ч добавляет 70', () => {
    const longAgo = new Date('2026-12-26T10:00:00Z');
    expect(applyCompletion(low, 'food', longAgo, now).food).toBe(90);
  });

  it('самая первая задача (lastCompletedAt = null) — обычные +35', () => {
    expect(applyCompletion(low, 'walk', null, now).walk).toBe(85);
  });

  it('INITIAL_NEEDS — все по 100', () => {
    expect(INITIAL_NEEDS).toEqual(FULL);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/needs.test.ts`
Expected: FAIL — модуль `needs.js` не найден.

- [ ] **Step 3: Реализация — `src/core/needs.ts`**

```ts
import { isQuiet, localTime } from './time.js';
import { TUNING } from './tuning.js';
import { NEEDS, type Need, type Needs, type Settings } from './types.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

export const INITIAL_NEEDS: Needs = Object.freeze({ food: 100, walk: 100, play: 100, love: 100 });

function mapNeeds(needs: Needs, fn: (value: number, need: Need) => number): Needs {
  return Object.fromEntries(NEEDS.map((need) => [need, fn(needs[need], need)])) as Record<Need, number>;
}

export function wakingMinutes(from: Date, to: Date, settings: Settings): number {
  const startMs = Math.max(from.getTime(), to.getTime() - TUNING.maxDecayHours * MS_PER_HOUR);
  const total = Math.floor((to.getTime() - startMs) / MS_PER_MINUTE);
  if (total <= 0) return 0;

  // ponytail: поминутный обход с постоянным сдвигом пояса — переход на летнее время
  // внутри окна не учитывается (для МСК неважно). Окно ограничено 72 ч → ≤ 4320 итераций.
  let minute = localTime(new Date(startMs), settings.timezone).minutes;
  let waking = 0;
  for (let i = 0; i < total; i++) {
    if (!isQuiet(minute, settings.quiet)) waking++;
    minute = (minute + 1) % 1440;
  }
  return waking;
}

export function decay(needs: Needs, from: Date, to: Date, settings: Settings): Needs {
  const hours = wakingMinutes(from, to, settings) / 60;
  return mapNeeds(needs, (value, need) => Math.max(TUNING.floor, value - TUNING.decayPerHour[need] * hours));
}

export function applyCompletion(needs: Needs, need: Need, lastCompletedAt: Date | null, now: Date): Needs {
  const isComeback =
    lastCompletedAt !== null && now.getTime() - lastCompletedAt.getTime() >= TUNING.comebackAfterHours * MS_PER_HOUR;
  const gain = isComeback ? TUNING.comebackGain : TUNING.completionGain;
  return { ...needs, [need]: Math.min(TUNING.max, needs[need] + gain) };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/needs.test.ts && npx tsc --noEmit`
Expected: PASS. Если тест «считается быстро» падает по времени — оптимизировать `isQuiet` (вынести `parseHHMM` из цикла), а не ослаблять тест.

- [ ] **Step 5: Commit**

```bash
git add src/core/needs.ts tests/core/needs.test.ts
git commit -m "feat(core): needs decay and task completion"
```

---

### Task 3: Состояние Шантика

**Files:**
- Create: `src/core/mood.ts`
- Test: `tests/core/mood.test.ts`

**Interfaces:**
- Consumes: `NEEDS`, `Need`, `Needs`, `QuietHours`; `TUNING`; `isQuiet`
- Produces:
  - `type PetState = { kind: 'sleeping' } | { kind: 'asking'; need: Need } | { kind: 'happy' } | { kind: 'ok' }` (`celebrating` — только UI, в core нет)
  - `lowestNeed(needs: Needs): Need` — при равенстве первая по порядку `NEEDS`
  - `petState(needs: Needs, minutes: number, quiet: QuietHours): PetState` — `minutes` из `localTime().minutes`

- [ ] **Step 1: Написать падающие тесты — `tests/core/mood.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { lowestNeed, petState } from '../../src/core/mood.js';
import { parseHHMM } from '../../src/core/time.js';

const QUIET = { start: '23:00', end: '09:00' };
const NOON = parseHHMM('12:00');

describe('lowestNeed', () => {
  it('находит самую низкую шкалу', () => {
    expect(lowestNeed({ food: 50, walk: 20, play: 40, love: 90 })).toBe('walk');
  });

  it('при равенстве берёт первую по порядку', () => {
    expect(lowestNeed({ food: 20, walk: 20, play: 40, love: 90 })).toBe('food');
  });
});

describe('petState', () => {
  it('в тихие часы спит, даже если голоден', () => {
    expect(petState({ food: 10, walk: 10, play: 10, love: 10 }, parseHHMM('02:00'), QUIET)).toEqual({ kind: 'sleeping' });
  });

  it('просит самую низкую потребность ниже 30', () => {
    expect(petState({ food: 20, walk: 25, play: 80, love: 80 }, NOON, QUIET)).toEqual({ kind: 'asking', need: 'food' });
  });

  it('ровно 30 — уже не просит', () => {
    expect(petState({ food: 30, walk: 80, play: 80, love: 80 }, NOON, QUIET)).toEqual({ kind: 'ok' });
  });

  it('все от 60 — радуется', () => {
    expect(petState({ food: 60, walk: 70, play: 80, love: 100 }, NOON, QUIET)).toEqual({ kind: 'happy' });
  });

  it('одна шкала 59 — нормально', () => {
    expect(petState({ food: 59, walk: 70, play: 80, love: 100 }, NOON, QUIET)).toEqual({ kind: 'ok' });
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/mood.test.ts`
Expected: FAIL — модуль `mood.js` не найден.

- [ ] **Step 3: Реализация — `src/core/mood.ts`**

```ts
import { isQuiet } from './time.js';
import { TUNING } from './tuning.js';
import { NEEDS, type Need, type Needs, type QuietHours } from './types.js';

export type PetState =
  | { kind: 'sleeping' }
  | { kind: 'asking'; need: Need }
  | { kind: 'happy' }
  | { kind: 'ok' };

export function lowestNeed(needs: Needs): Need {
  return NEEDS.reduce((lowest: Need, need: Need) => (needs[need] < needs[lowest] ? need : lowest));
}

export function petState(needs: Needs, minutes: number, quiet: QuietHours): PetState {
  if (isQuiet(minutes, quiet)) return { kind: 'sleeping' };
  const lowest = lowestNeed(needs);
  if (needs[lowest] < TUNING.askBelow) return { kind: 'asking', need: lowest };
  if (needs[lowest] >= TUNING.happyFrom) return { kind: 'happy' };
  return { kind: 'ok' };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/mood.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/mood.ts tests/core/mood.test.ts
git commit -m "feat(core): pet state from needs and quiet hours"
```

---

### Task 4: Награды

**Files:**
- Create: `src/core/rewards.ts`
- Test: `tests/core/rewards.test.ts`

**Interfaces:**
- Consumes: `NEEDS`, `Needs`; `TUNING`
- Produces:
  - `interface RewardInput { needs: Needs; completedTotal: number; lastNoteDate: string | null; today: string }` — `needs` и `completedTotal` уже ПОСЛЕ выполнения задачи; даты `"YYYY-MM-DD"`
  - `interface EarnedRewards { note: boolean; photo: boolean }`
  - `rewardsEarned(input: RewardInput): EarnedRewards` — говорит только «заслужена ли»; наличие неоткрытых наград проверяет сервер

- [ ] **Step 1: Написать падающие тесты — `tests/core/rewards.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { rewardsEarned } from '../../src/core/rewards.js';

const HIGH = { food: 80, walk: 85, play: 90, love: 100 };
const base = { needs: HIGH, completedTotal: 3, lastNoteDate: null, today: '2026-12-27' };

describe('rewardsEarned', () => {
  it('записка, когда все шкалы от 80', () => {
    expect(rewardsEarned(base)).toEqual({ note: true, photo: false });
  });

  it('нет записки, если одна шкала 79', () => {
    expect(rewardsEarned({ ...base, needs: { ...HIGH, food: 79 } }).note).toBe(false);
  });

  it('не больше одной записки в день', () => {
    expect(rewardsEarned({ ...base, lastNoteDate: '2026-12-27' }).note).toBe(false);
    expect(rewardsEarned({ ...base, lastNoteDate: '2026-12-26' }).note).toBe(true);
  });

  it('фото за каждые 10 выполненных задач', () => {
    expect(rewardsEarned({ ...base, completedTotal: 10 }).photo).toBe(true);
    expect(rewardsEarned({ ...base, completedTotal: 20 }).photo).toBe(true);
    expect(rewardsEarned({ ...base, completedTotal: 11 }).photo).toBe(false);
  });

  it('ноль выполненных задач — не фото', () => {
    expect(rewardsEarned({ ...base, completedTotal: 0 }).photo).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/rewards.test.ts`
Expected: FAIL — модуль `rewards.js` не найден.

- [ ] **Step 3: Реализация — `src/core/rewards.ts`**

```ts
import { TUNING } from './tuning.js';
import { NEEDS, type Needs } from './types.js';

export interface RewardInput {
  needs: Needs;
  completedTotal: number;
  lastNoteDate: string | null;
  today: string;
}

export interface EarnedRewards {
  note: boolean;
  photo: boolean;
}

export function rewardsEarned({ needs, completedTotal, lastNoteDate, today }: RewardInput): EarnedRewards {
  const allHigh = NEEDS.every((need) => needs[need] >= TUNING.noteFrom);
  return {
    note: allHigh && lastNoteDate !== today,
    photo: completedTotal > 0 && completedTotal % TUNING.photoEvery === 0,
  };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/rewards.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/rewards.ts tests/core/rewards.test.ts
git commit -m "feat(core): note and photo reward rules"
```

---

### Task 5: Планировщик — рутины

**Files:**
- Create: `src/core/schedule/routines.ts`
- Test: `tests/core/schedule/routines.test.ts`

**Interfaces:**
- Consumes: `Routine`, `RoutineLogEntry`, `QuietHours`; `LocalTime`, `parseHHMM`, `isQuiet`; `TUNING`
- Produces:
  - `interface DueRoutine { routineId: number; resend: boolean }` — `resend: true` = повтор после «⏰ +15 мин / +1 ч»
  - `dueRoutines(routines: readonly Routine[], todayLog: readonly RoutineLogEntry[], now: Date, local: LocalTime, quiet: QuietHours): DueRoutine[]`

Правила: рутина активна и сегодня её день; её время не попадает в тихие часы; первая отправка — только в окне `[time, time + 60 мин)`; если сегодня уже отправлена — повтор только когда `snoozedUntil <= now` и не выполнена.

- [ ] **Step 1: Написать падающие тесты — `tests/core/schedule/routines.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dueRoutines } from '../../../src/core/schedule/routines.js';
import { parseHHMM, type LocalTime } from '../../../src/core/time.js';
import type { Routine, RoutineLogEntry } from '../../../src/core/types.js';

const QUIET = { start: '23:00', end: '09:00' };
const EVERY_DAY = 0b1111111;
const PILLS: Routine = { id: 1, need: 'food', time: '20:00', days: EVERY_DAY, active: true };
const NOW = new Date('2026-12-27T17:05:00Z');

// 27.12.2026 — воскресенье (weekday 6)
function at(hhmm: string): LocalTime {
  return { date: '2026-12-27', minutes: parseHHMM(hhmm), weekday: 6 };
}

describe('dueRoutines', () => {
  it('отправляет рутину в её время', () => {
    expect(dueRoutines([PILLS], [], NOW, at('20:00'), QUIET)).toEqual([{ routineId: 1, resend: false }]);
  });

  it('отправляет с опозданием до 59 минут', () => {
    expect(dueRoutines([PILLS], [], NOW, at('20:59'), QUIET)).toHaveLength(1);
  });

  it('не отправляет пропущенную рутину спустя час и больше', () => {
    expect(dueRoutines([PILLS], [], NOW, at('21:00'), QUIET)).toEqual([]);
  });

  it('не отправляет раньше времени', () => {
    expect(dueRoutines([PILLS], [], NOW, at('19:59'), QUIET)).toEqual([]);
  });

  it('не отправляет в чужой день недели', () => {
    const weekdays: Routine = { ...PILLS, days: 0b0011111 }; // пн–пт
    expect(dueRoutines([weekdays], [], NOW, at('20:00'), QUIET)).toEqual([]);
  });

  it('не отправляет неактивную рутину', () => {
    expect(dueRoutines([{ ...PILLS, active: false }], [], NOW, at('20:00'), QUIET)).toEqual([]);
  });

  it('никогда не отправляет рутину, чьё время внутри тихих часов', () => {
    const early: Routine = { ...PILLS, time: '08:00' };
    expect(dueRoutines([early], [], NOW, at('08:00'), QUIET)).toEqual([]);
    expect(dueRoutines([early], [], NOW, at('09:00'), QUIET)).toEqual([]);
  });

  it('не отправляет повторно уже отправленную сегодня', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: null, snoozedUntil: null }];
    expect(dueRoutines([PILLS], log, NOW, at('20:10'), QUIET)).toEqual([]);
  });

  it('не отправляет выполненную', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: NOW, snoozedUntil: new Date('2026-12-27T17:00:00Z') }];
    expect(dueRoutines([PILLS], log, NOW, at('21:30'), QUIET)).toEqual([]);
  });

  it('повторяет после отложенного времени, даже вне окна', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: null, snoozedUntil: new Date('2026-12-27T17:00:00Z') }];
    expect(dueRoutines([PILLS], log, NOW, at('21:30'), QUIET)).toEqual([{ routineId: 1, resend: true }]);
  });

  it('не повторяет, пока отложенное время не наступило', () => {
    const log: RoutineLogEntry[] = [{ routineId: 1, doneAt: null, snoozedUntil: new Date('2026-12-27T18:00:00Z') }];
    expect(dueRoutines([PILLS], log, NOW, at('21:30'), QUIET)).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/schedule/routines.test.ts`
Expected: FAIL — модуль `routines.js` не найден.

- [ ] **Step 3: Реализация — `src/core/schedule/routines.ts`**

```ts
import { isQuiet, parseHHMM, type LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { QuietHours, Routine, RoutineLogEntry } from '../types.js';

export interface DueRoutine {
  routineId: number;
  resend: boolean;
}

function isScheduledToday(routine: Routine, weekday: number): boolean {
  return routine.active && (routine.days & (1 << weekday)) !== 0;
}

function dueOne(
  routine: Routine,
  entry: RoutineLogEntry | undefined,
  now: Date,
  local: LocalTime,
  quiet: QuietHours,
): DueRoutine | null {
  const time = parseHHMM(routine.time);
  if (!isScheduledToday(routine, local.weekday) || isQuiet(time, quiet)) return null;

  if (!entry) {
    const late = local.minutes - time;
    return late >= 0 && late < TUNING.routineWindowMinutes ? { routineId: routine.id, resend: false } : null;
  }
  if (entry.doneAt) return null;
  const snoozeOver = entry.snoozedUntil !== null && entry.snoozedUntil.getTime() <= now.getTime();
  return snoozeOver ? { routineId: routine.id, resend: true } : null;
}

export function dueRoutines(
  routines: readonly Routine[],
  todayLog: readonly RoutineLogEntry[],
  now: Date,
  local: LocalTime,
  quiet: QuietHours,
): DueRoutine[] {
  return routines.flatMap((routine) => {
    const entry = todayLog.find((e) => e.routineId === routine.id);
    const due = dueOne(routine, entry, now, local, quiet);
    return due ? [due] : [];
  });
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/schedule/routines.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedule/routines.ts tests/core/schedule/routines.test.ts
git commit -m "feat(core): routine reminders scheduling"
```

---

### Task 6: Планировщик — утро и вечер

**Files:**
- Create: `src/core/schedule/checkins.ts`
- Test: `tests/core/schedule/checkins.test.ts`

**Interfaces:**
- Consumes: `OutboxEntry`, `QuietHours`; `LocalTime`, `parseHHMM`, `minutesSince`; `TUNING`
- Produces:
  - `type Checkin = 'morning' | 'evening'`
  - `dueCheckin(local: LocalTime, quiet: QuietHours, sentToday: readonly OutboxEntry[]): Checkin | null`

Правила: утро — в окне `[конец тихих + 30 мин, +60 мин)`; вечер — в окне `[начало тихих − 60 мин, +60 мин)`; каждое не больше раза за дату (`sentToday` — записи за локальную дату).

- [ ] **Step 1: Написать падающие тесты — `tests/core/schedule/checkins.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dueCheckin } from '../../../src/core/schedule/checkins.js';
import { parseHHMM, type LocalTime } from '../../../src/core/time.js';
import type { OutboxEntry } from '../../../src/core/types.js';

const QUIET = { start: '23:00', end: '09:00' };

function at(hhmm: string): LocalTime {
  return { date: '2026-12-27', minutes: parseHHMM(hhmm), weekday: 6 };
}

function sent(kind: OutboxEntry['kind']): OutboxEntry {
  return { id: 1, kind, need: null, sentAt: new Date('2026-12-27T06:30:00Z'), answeredAt: null, followedUp: false };
}

describe('dueCheckin', () => {
  it('утро с 09:30 до 10:29', () => {
    expect(dueCheckin(at('09:29'), QUIET, [])).toBeNull();
    expect(dueCheckin(at('09:30'), QUIET, [])).toBe('morning');
    expect(dueCheckin(at('10:29'), QUIET, [])).toBe('morning');
    expect(dueCheckin(at('10:30'), QUIET, [])).toBeNull();
  });

  it('вечер с 22:00 до 22:59', () => {
    expect(dueCheckin(at('21:59'), QUIET, [])).toBeNull();
    expect(dueCheckin(at('22:00'), QUIET, [])).toBe('evening');
    expect(dueCheckin(at('22:59'), QUIET, [])).toBe('evening');
  });

  it('не повторяет уже отправленное сегодня', () => {
    expect(dueCheckin(at('09:40'), QUIET, [sent('morning')])).toBeNull();
    expect(dueCheckin(at('22:10'), QUIET, [sent('evening')])).toBeNull();
  });

  it('утреннее сообщение не мешает вечернему', () => {
    expect(dueCheckin(at('22:10'), QUIET, [sent('morning')])).toBe('evening');
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/schedule/checkins.test.ts`
Expected: FAIL — модуль `checkins.js` не найден.

- [ ] **Step 3: Реализация — `src/core/schedule/checkins.ts`**

```ts
import { minutesSince, parseHHMM, type LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { OutboxEntry, QuietHours } from '../types.js';

export type Checkin = 'morning' | 'evening';

function inWindow(minutes: number, start: number): boolean {
  return minutesSince(start, minutes) < TUNING.checkinWindowMinutes;
}

export function dueCheckin(local: LocalTime, quiet: QuietHours, sentToday: readonly OutboxEntry[]): Checkin | null {
  const alreadySent = (kind: Checkin) => sentToday.some((entry) => entry.kind === kind);
  const morningStart = parseHHMM(quiet.end) + TUNING.morningAfterQuietMinutes;
  const eveningStart = parseHHMM(quiet.start) - TUNING.eveningBeforeQuietMinutes;

  if (inWindow(local.minutes, morningStart % 1440) && !alreadySent('morning')) return 'morning';
  if (inWindow(local.minutes, (eveningStart + 1440) % 1440) && !alreadySent('evening')) return 'evening';
  return null;
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/schedule/checkins.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedule/checkins.ts tests/core/schedule/checkins.test.ts
git commit -m "feat(core): morning and evening check-ins"
```

---

### Task 7: Планировщик — сигналы потребностей и повторы

**Files:**
- Create: `src/core/schedule/signals.ts`
- Test: `tests/core/schedule/signals.test.ts`

**Interfaces:**
- Consumes: `Need`, `Needs`, `OutboxEntry`; `LocalTime`; `lowestNeed` (mood.ts); `TUNING`
- Produces:
  - `interface SignalDecision { need: Need; slot: string }` — `slot` вида `"3h:4"` / `"6h:2"` для ключа дедупликации
  - `needSignal(needs: Needs, local: LocalTime, now: Date, sentToday: readonly OutboxEntry[]): SignalDecision | null`
  - `dueFollowup(needs: Needs, now: Date, sentToday: readonly OutboxEntry[]): OutboxEntry | null` — возвращает исходный сигнал, к которому нужен повтор

Правила сигнала: самая низкая шкала < 30; по этой потребности не было сигнала за последние `slotHours` часов; `slotHours` = 3, а если последние 3 сигнала (`need`/`followup`) за сегодня все без ответа — 6. Слот = `floor(минуты / (slotHours × 60))`.
Правила повтора: сигнал `need` без ответа, без повтора, отправлен ≥ 90 мин назад, и его потребность всё ещё < 30 (если она уже сделала задачу в Mini App — не дёргаем). Самый старый первым.

- [ ] **Step 1: Написать падающие тесты — `tests/core/schedule/signals.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dueFollowup, needSignal } from '../../../src/core/schedule/signals.js';
import { parseHHMM, type LocalTime } from '../../../src/core/time.js';
import type { Needs, OutboxEntry } from '../../../src/core/types.js';

const HUNGRY: Needs = { food: 20, walk: 80, play: 80, love: 80 };
const FINE: Needs = { food: 50, walk: 80, play: 80, love: 80 };
// 12:00 МСК = 09:00 UTC
const NOW = new Date('2026-12-27T09:00:00Z');
const LOCAL: LocalTime = { date: '2026-12-27', minutes: parseHHMM('12:00'), weekday: 6 };

function signal(id: number, minutesAgo: number, extra: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id,
    kind: 'need',
    need: 'food',
    sentAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    answeredAt: null,
    followedUp: false,
    ...extra,
  };
}

describe('needSignal', () => {
  it('сигналит о самой низкой потребности ниже 30', () => {
    expect(needSignal(HUNGRY, LOCAL, NOW, [])).toEqual({ need: 'food', slot: '3h:4' });
  });

  it('молчит, если все шкалы от 30', () => {
    expect(needSignal(FINE, LOCAL, NOW, [])).toBeNull();
  });

  it('не повторяет ту же потребность раньше чем через 3 часа', () => {
    expect(needSignal(HUNGRY, LOCAL, NOW, [signal(1, 170, { answeredAt: NOW })])).toBeNull();
    expect(needSignal(HUNGRY, LOCAL, NOW, [signal(1, 180, { answeredAt: NOW })])).not.toBeNull();
  });

  it('после 3 неотвеченных сигналов подряд — интервал 6 часов', () => {
    const ignored = [
      signal(1, 400, { need: 'walk' }),
      signal(2, 300, { need: 'play' }),
      signal(3, 200, { need: 'love' }),
    ];
    expect(needSignal(HUNGRY, LOCAL, NOW, ignored)).toEqual({ need: 'food', slot: '6h:2' });
    expect(needSignal(HUNGRY, LOCAL, NOW, [...ignored, signal(4, 240)])).toBeNull();
  });

  it('ответ на любой из последних трёх снимает «усталость»', () => {
    const mixed = [
      signal(1, 400, { need: 'walk' }),
      signal(2, 300, { need: 'play', answeredAt: NOW }),
      signal(3, 200, { need: 'love' }),
    ];
    expect(needSignal(HUNGRY, LOCAL, NOW, mixed)?.slot).toBe('3h:4');
  });
});

describe('dueFollowup', () => {
  it('повтор через 90 минут после неотвеченного сигнала', () => {
    expect(dueFollowup(HUNGRY, NOW, [signal(7, 89)])).toBeNull();
    expect(dueFollowup(HUNGRY, NOW, [signal(7, 90)])?.id).toBe(7);
  });

  it('не повторяет отвеченный или уже повторённый', () => {
    expect(dueFollowup(HUNGRY, NOW, [signal(7, 120, { answeredAt: NOW })])).toBeNull();
    expect(dueFollowup(HUNGRY, NOW, [signal(7, 120, { followedUp: true })])).toBeNull();
  });

  it('не повторяет, если потребность уже закрыта', () => {
    expect(dueFollowup(FINE, NOW, [signal(7, 120)])).toBeNull();
  });

  it('берёт самый старый сигнал', () => {
    expect(dueFollowup(HUNGRY, NOW, [signal(8, 100), signal(7, 150)])?.id).toBe(7);
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/schedule/signals.test.ts`
Expected: FAIL — модуль `signals.js` не найден.

- [ ] **Step 3: Реализация — `src/core/schedule/signals.ts`**

```ts
import { lowestNeed } from '../mood.js';
import type { LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { Need, Needs, OutboxEntry } from '../types.js';

const MS_PER_MINUTE = 60_000;

export interface SignalDecision {
  need: Need;
  slot: string;
}

const bySentAt = (a: OutboxEntry, b: OutboxEntry) => a.sentAt.getTime() - b.sentAt.getTime();

function isTired(sentToday: readonly OutboxEntry[]): boolean {
  const signals = sentToday.filter((e) => e.kind === 'need' || e.kind === 'followup').sort(bySentAt);
  const lastFew = signals.slice(-TUNING.tiredAfterUnanswered);
  return lastFew.length === TUNING.tiredAfterUnanswered && lastFew.every((e) => e.answeredAt === null);
}

export function needSignal(
  needs: Needs,
  local: LocalTime,
  now: Date,
  sentToday: readonly OutboxEntry[],
): SignalDecision | null {
  const need = lowestNeed(needs);
  if (needs[need] >= TUNING.askBelow) return null;

  const slotHours = isTired(sentToday) ? TUNING.tiredSignalSlotHours : TUNING.signalSlotHours;
  const since = now.getTime() - slotHours * 60 * MS_PER_MINUTE;
  const recentlyAsked = sentToday.some((e) => e.kind === 'need' && e.need === need && e.sentAt.getTime() > since);
  if (recentlyAsked) return null;

  return { need, slot: `${slotHours}h:${Math.floor(local.minutes / (slotHours * 60))}` };
}

export function dueFollowup(needs: Needs, now: Date, sentToday: readonly OutboxEntry[]): OutboxEntry | null {
  const threshold = now.getTime() - TUNING.followupAfterMinutes * MS_PER_MINUTE;
  const candidates = sentToday
    .filter(
      (e) =>
        e.kind === 'need' &&
        e.need !== null &&
        e.answeredAt === null &&
        !e.followedUp &&
        e.sentAt.getTime() <= threshold &&
        needs[e.need] < TUNING.askBelow,
    )
    .sort(bySentAt);
  return candidates[0] ?? null;
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/schedule/signals.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedule/signals.ts tests/core/schedule/signals.test.ts
git commit -m "feat(core): need signals with anti-fatigue and follow-ups"
```

---

### Task 8: Планировщик — сборка `planTick`

**Files:**
- Create: `src/core/schedule/plan.ts`
- Test: `tests/core/schedule/plan.test.ts`

**Interfaces:**
- Consumes: `dueRoutines`, `DueRoutine` (Task 5); `dueCheckin` (Task 6); `needSignal`, `dueFollowup` (Task 7); `localTime`, `isQuiet`; `Settings`, `Needs`, `Routine`, `RoutineLogEntry`, `OutboxEntry`, `Need`; `TUNING`
- Produces:
  - `interface TickInput { now: Date; settings: Settings; needs: Needs; routines: readonly Routine[]; routineLog: readonly RoutineLogEntry[]; outboxToday: readonly OutboxEntry[] }` — `needs` уже после `decay`; `routineLog` и `outboxToday` — записи за текущую локальную дату
  - `type Outgoing =`
    `| { kind: 'routine'; routineId: number; resend: boolean }`
    `| { kind: 'morning' | 'evening'; dedupKey: string }`
    `| { kind: 'need'; need: Need; dedupKey: string }`
    `| { kind: 'followup'; parentId: number; need: Need; dedupKey: string }`
  - `planTick(input: TickInput): Outgoing[]` — что отправить в этот tick. Сервер (план 2) захватывает каждое сообщение по `dedupKey` / `(routineId, date)` и отправляет только захваченные.

Правила: в тихие часы — пусто; рутины всегда (вне лимита); остаток лимита = `6 − outboxToday.length`; по приоритету: утро/вечер → повтор → сигнал; не больше одного повтора и одного сигнала за tick; сигнал не по той же потребности, что повтор. Ключи: `morning:<дата>`, `evening:<дата>`, `need:<need>:<дата>:<слот>`, `followup:<id>`.

- [ ] **Step 1: Написать падающие тесты — `tests/core/schedule/plan.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { planTick, type TickInput } from '../../../src/core/schedule/plan.js';
import type { OutboxEntry, Settings } from '../../../src/core/types.js';

const SETTINGS: Settings = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };
const HUNGRY = { food: 20, walk: 80, play: 80, love: 80 };

// UTC+3: 06:40Z = 09:40 МСК (окно утра), 09:00Z = 12:00 МСК
function input(utc: string, extra: Partial<TickInput> = {}): TickInput {
  return {
    now: new Date(utc),
    settings: SETTINGS,
    needs: HUNGRY,
    routines: [],
    routineLog: [],
    outboxToday: [],
    ...extra,
  };
}

function entry(id: number, extra: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id,
    kind: 'need',
    need: 'walk',
    sentAt: new Date('2026-12-27T07:00:00Z'),
    answeredAt: new Date('2026-12-27T07:10:00Z'),
    followedUp: false,
    ...extra,
  };
}

describe('planTick', () => {
  it('в тихие часы ничего не отправляет', () => {
    const pills = { id: 1, need: 'food' as const, time: '02:00', days: 127, active: true };
    expect(planTick(input('2026-12-26T23:00:00Z', { routines: [pills] }))).toEqual([]);
  });

  it('утром: утреннее сообщение и сигнал потребности', () => {
    expect(planTick(input('2026-12-27T06:40:00Z'))).toEqual([
      { kind: 'morning', dedupKey: 'morning:2026-12-27' },
      { kind: 'need', need: 'food', dedupKey: 'need:food:2026-12-27:3h:3' },
    ]);
  });

  it('повтор важнее сигнала и не дублирует его потребность', () => {
    const ignored = entry(5, { need: 'food', answeredAt: null, sentAt: new Date('2026-12-27T07:00:00Z') });
    expect(planTick(input('2026-12-27T09:00:00Z', { outboxToday: [ignored] }))).toEqual([
      { kind: 'followup', parentId: 5, need: 'food', dedupKey: 'followup:5' },
    ]);
  });

  it('соблюдает дневной лимит 6', () => {
    const five = [1, 2, 3, 4, 5].map((id) => entry(id));
    expect(planTick(input('2026-12-27T06:40:00Z', { outboxToday: five }))).toEqual([
      { kind: 'morning', dedupKey: 'morning:2026-12-27' },
    ]);
    const six = [...five, entry(6)];
    expect(planTick(input('2026-12-27T06:40:00Z', { outboxToday: six }))).toEqual([]);
  });

  it('рутины идут вне лимита', () => {
    const six = [1, 2, 3, 4, 5, 6].map((id) => entry(id));
    const pills = { id: 9, need: 'food' as const, time: '20:00', days: 127, active: true };
    // 17:05Z = 20:05 МСК
    expect(planTick(input('2026-12-27T17:05:00Z', { outboxToday: six, routines: [pills] }))).toEqual([
      { kind: 'routine', routineId: 9, resend: false },
    ]);
  });

  it('повторный вызов с тем же входом даёт те же ключи (для дедупликации в БД)', () => {
    const same = input('2026-12-27T06:40:00Z');
    expect(planTick(same)).toEqual(planTick(same));
  });
});
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npx vitest run tests/core/schedule/plan.test.ts`
Expected: FAIL — модуль `plan.js` не найден.

- [ ] **Step 3: Реализация — `src/core/schedule/plan.ts`**

```ts
import { isQuiet, localTime, type LocalTime } from '../time.js';
import { TUNING } from '../tuning.js';
import type { Need, Needs, OutboxEntry, Routine, RoutineLogEntry, Settings } from '../types.js';
import { dueCheckin } from './checkins.js';
import { dueRoutines } from './routines.js';
import { dueFollowup, needSignal } from './signals.js';

export interface TickInput {
  now: Date;
  settings: Settings;
  needs: Needs;
  routines: readonly Routine[];
  routineLog: readonly RoutineLogEntry[];
  outboxToday: readonly OutboxEntry[];
}

export type Outgoing =
  | { kind: 'routine'; routineId: number; resend: boolean }
  | { kind: 'morning' | 'evening'; dedupKey: string }
  | { kind: 'need'; need: Need; dedupKey: string }
  | { kind: 'followup'; parentId: number; need: Need; dedupKey: string };

function cappedCandidates(input: TickInput, local: LocalTime): Outgoing[] {
  const { now, settings, needs, outboxToday } = input;
  const { date } = local;
  const result: Outgoing[] = [];

  const checkin = dueCheckin(local, settings.quiet, outboxToday);
  if (checkin) result.push({ kind: checkin, dedupKey: `${checkin}:${date}` });

  const followup = dueFollowup(needs, now, outboxToday);
  if (followup?.need) {
    result.push({ kind: 'followup', parentId: followup.id, need: followup.need, dedupKey: `followup:${followup.id}` });
  }

  const signal = needSignal(needs, local, now, outboxToday);
  if (signal && signal.need !== followup?.need) {
    result.push({ kind: 'need', need: signal.need, dedupKey: `need:${signal.need}:${date}:${signal.slot}` });
  }
  return result;
}

export function planTick(input: TickInput): Outgoing[] {
  const local = localTime(input.now, input.settings.timezone);
  if (isQuiet(local.minutes, input.settings.quiet)) return [];

  const routines: Outgoing[] = dueRoutines(input.routines, input.routineLog, input.now, local, input.settings.quiet).map(
    (due) => ({ kind: 'routine', ...due }),
  );
  const budget = Math.max(0, TUNING.dailyCap - input.outboxToday.length);
  const capped = cappedCandidates(input, local).slice(0, budget);
  return [...routines, ...capped];
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/core/schedule/plan.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Прогнать весь набор**

Run: `npm test && npm run typecheck`
Expected: все тесты core зелёные, 0 ошибок типов.

- [ ] **Step 6: Проверить чистоту core**

Run: `grep -rnE "Date\.now|Math\.random|new Date\(\)|from '\.\./\.\./(db|bot)|from '\.\./(db|bot)" src/core || echo clean`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/core/schedule/plan.ts tests/core/schedule/plan.test.ts
git commit -m "feat(core): tick planner with daily cap and priorities"
```

