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
