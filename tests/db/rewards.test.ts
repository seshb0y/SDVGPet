import { describe, expect, it } from 'vitest';
import {
  addNote,
  addPhoto,
  countLocked,
  getUnlockedPhoto,
  listUnlocked,
  unlockOldest,
} from '../../src/db/rewards.js';
import { testDb } from '../helpers/db.js';

const NOW = new Date('2026-12-27T10:00:00Z');

describe('rewards repo', () => {
  it('открывает самую старую неоткрытую награду нужного типа', async () => {
    const db = await testDb();
    await addNote(db, 'первая');
    await addNote(db, 'вторая');
    expect(await unlockOldest(db, 'note', NOW)).toMatchObject({ text: 'первая', unlockedAt: NOW });
    expect(await unlockOldest(db, 'note', NOW)).toMatchObject({ text: 'вторая' });
    expect(await unlockOldest(db, 'note', NOW)).toBeNull();
  });

  it('считает неоткрытые и отдаёт только открытые фото', async () => {
    const db = await testDb();
    await addNote(db, 'записка');
    const photo = await addPhoto(db, 'FILE_1', 'мы на море');
    expect(await countLocked(db)).toEqual({ notes: 1, photos: 1 });
    expect(await getUnlockedPhoto(db, photo.id)).toBeNull();
    await unlockOldest(db, 'photo', NOW);
    expect(await getUnlockedPhoto(db, photo.id)).toMatchObject({ fileId: 'FILE_1', text: 'мы на море' });
    expect(await countLocked(db)).toEqual({ notes: 1, photos: 0 });
    expect((await listUnlocked(db)).map((r) => r.kind)).toEqual(['photo']);
  });
});
