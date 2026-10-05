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
