import { neon } from '@neondatabase/serverless';

/** Минимальный интерфейс БД: прод — Neon HTTP, тесты — PGlite. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
  };
}
