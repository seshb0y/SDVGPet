/** Все числа механики в одном месте — крутить здесь. */
export const TUNING = {
  max: 100,
  floor: 10,
  decayPerHour: { food: 7, walk: 5, play: 5, love: 4 },
  completionGain: 35,
  comebackGain: 70,
  comebackAfterHours: 24,
  askBelow: 30,
  happyFrom: 60,
  noteFrom: 80,
  photoEvery: 10,
  /** Дальше 72 ч назад не считаем: к этому моменту все шкалы уже на полу. */
  maxDecayHours: 72,
  dailyCap: 6,
  signalSlotHours: 3,
  tiredSignalSlotHours: 6,
  tiredAfterUnanswered: 3,
  followupAfterMinutes: 90,
  morningAfterQuietMinutes: 30,
  eveningBeforeQuietMinutes: 60,
  checkinWindowMinutes: 60,
  routineWindowMinutes: 60,
} as const;
