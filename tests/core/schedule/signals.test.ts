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
