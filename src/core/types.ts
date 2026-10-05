export const NEEDS = ['food', 'walk', 'play', 'love'] as const;
export type Need = (typeof NEEDS)[number];
export type Needs = Readonly<Record<Need, number>>;

/** Тихие часы, строки "HH:MM". Могут переходить через полночь (23:00–09:00). */
export interface QuietHours {
  start: string;
  end: string;
}

export interface Settings {
  timezone: string;
  quiet: QuietHours;
}

/** days — битовая маска: бит 0 = понедельник … бит 6 = воскресенье. */
export interface Routine {
  id: number;
  need: Need;
  time: string;
  days: number;
  active: boolean;
}

/** Запись о рутине за сегодняшнюю дату. */
export interface RoutineLogEntry {
  routineId: number;
  doneAt: Date | null;
  snoozedUntil: Date | null;
}

/** Виды сообщений, входящих в дневной лимит. */
export type CappedKind = 'need' | 'followup' | 'morning' | 'evening';

/** Отправленное сегодня сообщение из лимита. */
export interface OutboxEntry {
  id: number;
  kind: CappedKind;
  need: Need | null;
  sentAt: Date;
  answeredAt: Date | null;
  followedUp: boolean;
}
