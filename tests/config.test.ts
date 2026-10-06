import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const VALID = {
  BOT_TOKEN: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  BOT_INFO: '{"id":1,"is_bot":true,"first_name":"Шантик","username":"shantik_bot"}',
  DATABASE_URL: 'postgres://u:p@host/db',
  WEBHOOK_SECRET: 'webhook_secret_123456',
  TICK_SECRET: 'tick_secret_1234567890',
  USER_ID: '111',
  ADMIN_ID: '222',
  MINI_APP_URL: 'https://shantik.vercel.app',
};

describe('loadConfig', () => {
  it('читает корректное окружение и приводит id к числам', () => {
    const config = loadConfig(VALID);
    expect(config.USER_ID).toBe(111);
    expect(config.ADMIN_ID).toBe(222);
  });

  it('падает без обязательной переменной', () => {
    const { BOT_TOKEN: _omit, ...rest } = VALID;
    expect(() => loadConfig(rest)).toThrow();
  });

  it('падает на webhook-секрете с недопустимыми символами', () => {
    expect(() => loadConfig({ ...VALID, WEBHOOK_SECRET: 'bad secret!' })).toThrow();
  });
});
