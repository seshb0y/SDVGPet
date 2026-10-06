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
