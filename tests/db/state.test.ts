import { describe, expect, it } from 'vitest';
import { getPet, getSettings, savePet, saveSettings } from '../../src/db/state.js';
import { testDb } from '../helpers/db.js';

describe('state repo', () => {
  it('читает настройки по умолчанию и сохраняет новые', async () => {
    const db = await testDb();
    expect(await getSettings(db)).toEqual({ timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } });
    await saveSettings(db, { timezone: 'Asia/Yekaterinburg', quiet: { start: '22:30', end: '08:00' } });
    expect(await getSettings(db)).toEqual({ timezone: 'Asia/Yekaterinburg', quiet: { start: '22:30', end: '08:00' } });
  });

  it('сохраняет и читает питомца, включая дробные шкалы', async () => {
    const db = await testDb();
    const pet = {
      needs: { food: 42.5, walk: 60, play: 70.25, love: 10 },
      updatedAt: new Date('2026-12-27T10:00:00Z'),
      lastCompletedAt: new Date('2026-12-27T09:00:00Z'),
      completedTotal: 7,
      lastNoteDate: '2026-12-26',
    };
    await savePet(db, pet);
    expect(await getPet(db)).toEqual(pet);
  });
});
