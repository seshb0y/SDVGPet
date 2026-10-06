import { describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db.js';

describe('schema', () => {
  it('создаёт singleton-строки settings и pet с умолчаниями', async () => {
    const db = await testDb();
    const [settings] = await db.query<{ timezone: string; quiet_start: string }>('SELECT * FROM settings');
    const [pet] = await db.query<{ food: number; completed_total: number }>('SELECT * FROM pet');
    expect(settings).toMatchObject({ timezone: 'Europe/Moscow', quiet_start: '23:00' });
    expect(pet).toMatchObject({ food: 100, completed_total: 0 });
  });

  it('не даёт создать вторую строку settings', async () => {
    const db = await testDb();
    await expect(db.query('INSERT INTO settings (id) VALUES (2)')).rejects.toThrow();
  });
});
