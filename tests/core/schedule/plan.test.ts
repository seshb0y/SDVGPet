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
    // 13:30 МСК: сигнал отправлен 10:00 МСК (> 3 ч назад) — кулдаун не мешает, дубль гасит только проверка потребности
    const ignored = entry(5, { need: 'food', answeredAt: null, sentAt: new Date('2026-12-27T07:00:00Z') });
    expect(planTick(input('2026-12-27T10:30:00Z', { outboxToday: [ignored] }))).toEqual([
      { kind: 'followup', parentId: 5, need: 'food', dedupKey: 'followup:5' },
    ]);
  });

  it('при остатке лимита 1 приоритет у чек-ина, а не у повтора', () => {
    // 09:40 МСК: окно утра; повтор сигнала от 08:00 МСК тоже созрел
    const ignored = entry(5, { need: 'food', answeredAt: null, sentAt: new Date('2026-12-27T05:00:00Z') });
    const filler = [1, 2, 3, 4].map((id) => entry(id));
    expect(planTick(input('2026-12-27T06:40:00Z', { outboxToday: [...filler, ignored] }))).toEqual([
      { kind: 'morning', dedupKey: 'morning:2026-12-27' },
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
