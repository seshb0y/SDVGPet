import { z } from 'zod';

const ConfigSchema = z.object({
  BOT_TOKEN: z.string().min(20),
  /** JSON-ответ getMe — чтобы grammY не вызывал getMe на каждом холодном старте. */
  BOT_INFO: z.string().min(2),
  DATABASE_URL: z.string().min(1),
  WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/),
  TICK_SECRET: z.string().min(16),
  USER_ID: z.coerce.number().int().positive(),
  ADMIN_ID: z.coerce.number().int().positive(),
  MINI_APP_URL: z.url(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  return ConfigSchema.parse(env);
}
