export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const ALL_DAYS = 0b1111111;
const WEEKDAYS = 0b0011111;
const WEEKEND = 0b1100000;

export const hasDay = (mask: number, index: number): boolean => (mask & (1 << index)) !== 0;
export const toggleDay = (mask: number, index: number): number => mask ^ (1 << index);

export function daysLabel(mask: number): string {
  if (mask === ALL_DAYS) return 'каждый день';
  if (mask === WEEKDAYS) return 'по будням';
  if (mask === WEEKEND) return 'по выходным';
  return DAY_SHORT.filter((_, index) => hasDay(mask, index))
    .map((day) => day.toLowerCase())
    .join(', ');
}
