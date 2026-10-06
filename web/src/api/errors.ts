import { ApiError } from './client';

const GENERIC = 'Шантик не дотянулся до сервера. Попробуй ещё раз 🐾';

export function errorText(error: unknown, context?: 'settings'): string {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.status === 401) return 'Открой Шантика из чата с ботом 🐾';
  if (error.status === 400 && context === 'settings') {
    return 'Тихие часы: начало с 20:00 до 00:00, конец с 05:00 до 12:00.';
  }
  if (error.status === 404) return 'Этого уже нет — обнови список.';
  return GENERIC;
}
