import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../../src/db/client.js';

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8');

export async function testDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows,
  };
}
