import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { errorText } from './errors';

describe('errorText', () => {
  it('401 — просит открыть из чата с ботом', () => {
    expect(errorText(new ApiError(401, 'unauthorized'))).toBe('Открой Шантика из чата с ботом 🐾');
  });

  it('400 в настройках — объясняет правило тихих часов', () => {
    expect(errorText(new ApiError(400, 'bad_request'), 'settings')).toBe(
      'Тихие часы: начало с 20:00 до 00:00, конец с 05:00 до 12:00.',
    );
  });

  it('404 — запись уже удалена', () => {
    expect(errorText(new ApiError(404, 'not_found'))).toBe('Этого уже нет — обнови список.');
  });

  it('остальное — мягкий общий текст', () => {
    expect(errorText(new ApiError(500, 'internal'))).toBe('Шантик не дотянулся до сервера. Попробуй ещё раз 🐾');
    expect(errorText(new TypeError('Failed to fetch'))).toBe('Шантик не дотянулся до сервера. Попробуй ещё раз 🐾');
  });
});
