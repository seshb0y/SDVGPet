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
