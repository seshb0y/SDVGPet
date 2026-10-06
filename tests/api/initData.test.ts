import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../../src/api/initData.js';
import { initDataFor, signInitData } from '../helpers/initData.js';

const TOKEN = '123456:TEST_TOKEN_ABCDEFGHIJKLMNOP';
const NOW = new Date('2026-12-27T09:00:00Z');

describe('verifyInitData', () => {
  it('принимает корректную подпись (с полем signature) и возвращает user.id', () => {
    expect(verifyInitData(initDataFor(111, TOKEN, NOW), TOKEN, NOW)).toEqual({ userId: 111 });
  });

  it('отвергает подпись другим токеном', () => {
    expect(verifyInitData(initDataFor(111, 'other:TOKEN', NOW), TOKEN, NOW)).toBeNull();
  });

  it('отвергает изменённые данные', () => {
    const tampered = initDataFor(111, TOKEN, NOW).replace('111', '222');
    expect(verifyInitData(tampered, TOKEN, NOW)).toBeNull();
  });

  it('отвергает данные старше 24 часов', () => {
    const old = new Date(NOW.getTime() - 25 * 3_600_000);
    expect(verifyInitData(initDataFor(111, TOKEN, old), TOKEN, NOW)).toBeNull();
  });

  it('отвергает строку без hash и без user', () => {
    expect(verifyInitData('auth_date=1', TOKEN, NOW)).toBeNull();
    const noUser = signInitData({ auth_date: String(Math.floor(NOW.getTime() / 1000)) }, TOKEN);
    expect(verifyInitData(noUser, TOKEN, NOW)).toBeNull();
  });
});
