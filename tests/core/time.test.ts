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
