import type { Need, PetState } from '../api/types';

export const SPEECH = {
  sleeping: ['Хр-р… 💤', 'Сплю. Завтра поиграем 🌙', 'Тс-с, я сопю 💤'],
  celebrating: ['Ура! Ты умница! 🎉', 'Гав-гав! Так держать! 🐾', 'Вот это да! 💛', 'Я горжусь тобой! ✨'],
  happy: ['Мне так хорошо с тобой! 💛', 'Гав! Лучший день! 🐾', 'Я счастливый шпиц ✨'],
  ok: ['Я тут, рядом 🐾', 'Как ты? 🤍', 'Одно маленькое дело — и мне будет ещё лучше 🐾'],
  asking: {
    food: ['Миска почти пустая 🥺', 'Может, перекусим? 🍖', 'Попьёшь водички со мной? 💧'],
    walk: ['Пойдём прогуляемся? 🦮', 'Хочу на улицу! 🐾', 'Хоть пять минут подвигаемся? 🦮'],
    play: ['Поиграем? Одно маленькое дело 🎾', 'Давай сделаем что-нибудь вместе 🎾', 'Мячик ждёт! 🎾'],
    love: ['Погладь меня… и себя тоже 🤍', 'Сделай что-нибудь приятное для себя 🤍', 'Отдохни немножко со мной 🤍'],
  } satisfies Record<Need, string[]>,
};

const pick = (pool: readonly string[], seed: number): string => pool[Math.abs(seed) % pool.length] ?? '';

export function speechFor(mood: PetState, celebrating: boolean, seed: number): string {
  if (celebrating) return pick(SPEECH.celebrating, seed);
  switch (mood.kind) {
    case 'sleeping':
      return pick(SPEECH.sleeping, seed);
    case 'asking':
      return pick(SPEECH.asking[mood.need], seed);
    case 'happy':
      return pick(SPEECH.happy, seed);
    case 'ok':
      return pick(SPEECH.ok, seed);
  }
}
