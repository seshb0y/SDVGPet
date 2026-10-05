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
