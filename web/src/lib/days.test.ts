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
