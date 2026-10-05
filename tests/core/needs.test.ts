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
