import { snoozeFits } from '../core/schedule/routines.js';
import type { Need, Settings } from '../core/types.js';
import type { Reward } from '../db/rewards.js';

export type Button = { text: string; data: string } | { text: string; webApp: string };

export interface OutgoingMessage {
  text: string;
  buttons?: Button[][];
  silent?: boolean;
  /** Telegram file_id — отправить фото с подписью text */
  photo?: string;
}

export type Sender = (message: OutgoingMessage) => Promise<void>;

export const NEED_LABEL: Record<Need, string> = {
  food: '🍖 Миска',
  walk: '🦮 Прогулка',
  play: '🎾 Игра',
  love: '🤍 Ласка',
};

export const QUICK_ACTIONS: Record<Need, readonly string[]> = {
  food: ['выпить стакан воды', 'перекусить чем-нибудь', 'принять таблетки, если пора'],
  walk: ['выйти на улицу хотя бы на 5 минут', 'потянуться пару минут', 'дойти до магазина'],
  play: ['сделать одно маленькое дело', 'помыть одну тарелку', 'ответить на одно сообщение'],
  love: ['полежать 10 минут', 'включить любимую песню', 'выпить чаю и ничего не делать'],
};

const ASK: Record<Need, readonly string[]> = {
  food: ['миска почти пустая 🥺', 'у меня урчит в животике 🍖', 'гав! кажется, пора подкрепиться', 'я смотрю на миску… а она на меня 🥺', 'кушать хочется, давай вместе?'],
  walk: ['гав! хочу гулять 🦮', 'я принёс поводок 🦮👀', 'на улице столько всего интересного!', 'лапки просят пройтись 🐾', 'пойдём подышим?'],
  play: ['принёс мячик 🎾 сначала дело, потом играем?', 'гав! давай одно маленькое дело', 'я верю, ты справишься 🎾', 'сделаем что-нибудь вместе?', 'одна задачка — и я счастлив 🎾'],
  love: ['хочу на ручки 🤍', 'ты сегодня отдыхала? 🤍', 'давай немного побудем вместе', 'я соскучился 🥺🤍', 'тебе тоже нужна забота 🤍'],
};
const FOLLOWUP = ['гав? я всё ещё жду 🥺', 'напоминаю тихонько 🐾', 'я тут, никуда не ушёл 🐶', 'ну пожалуйста? 🥺', 'одна маленькая штучка — и всё 🐾'];
const SUGGEST = ['может, {action}?', 'давай {action}?', 'как насчёт: {action}?', 'предлагаю {action} 🐾', 'попробуем {action}?'];
const ROUTINE = ['{time} — {title} 🐾 Я слежу 👀', 'Гав! Время: {title} ({time})', '{title}, {time} 🐶 не забудь!', 'Напоминаю: {title} 🐾', 'Пора: {title} ⏰'];
const MORNING = ['Доброе утро! ☀️', 'Гав-гав, просыпаемся! 🐶', 'Утро! Я уже виляю хвостом 🐾', 'С добрым утром 🌤', 'Привет! Новый день 🐶'];
const EVENING_DONE = ['Сегодня ты сделала {deeds} — я сытый и счастливый 🐶', 'Итог дня: {deeds}! Горжусь тобой 🐾', '{deeds} за день 🎉 ты лучшая', 'Сегодня {deeds} — отличный день 🐶', 'Ты сделала {deeds}. Спасибо, что заботишься о нас 🤍'];
const EVENING_EMPTY = ['Сегодня был тихий день, это тоже нормально. Я рядом 🤍', 'Тихий день — тоже день, это тоже нормально 🤍 Завтра попробуем вместе', 'Ничего страшного, это тоже нормально. Я тебя люблю 🐶', 'Отдыхать — это тоже нормально 🤍 спокойной ночи', 'Сегодня без дел — это тоже нормально. Я рядом 🐾'];
const REWARD_INTRO = 'Шантик что-то принёс в зубах… 💌';

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick: пустой список');
  return item;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export function pluralDeeds(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} дело`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} дела`;
  return `${count} дел`;
}

export function routineMessage(
  routine: { id: number; title: string; time: string },
  date: string,
  now: Date,
  settings: Settings,
  random: () => number,
): OutgoingMessage {
  const ref = `${routine.id}:${date}`;
  const snoozes = [
    { minutes: 15, text: '⏰ +15 мин' },
    { minutes: 60, text: '⏰ +1 ч' },
  ]
    .filter(({ minutes }) => snoozeFits(now, minutes, settings))
    .map(({ minutes, text }) => ({ text, data: `rsnooze:${ref}:${minutes}` }));
  const buttons: Button[][] = [[{ text: '✅ Сделала', data: `rdone:${ref}` }]];
  if (snoozes.length > 0) buttons.push(snoozes);
  return { text: fill(pick(ROUTINE, random), { time: routine.time, title: routine.title }), buttons };
}

export function needMessage(
  need: Need,
  suggestion: { id: number; title: string } | null,
  random: () => number,
  isFollowup: boolean,
): OutgoingMessage {
  const opener = pick(isFollowup ? FOLLOWUP : ASK[need], random);
  const actionIndex = Math.floor(random() * QUICK_ACTIONS[need].length);
  const action = suggestion ? `«${suggestion.title}»` : (QUICK_ACTIONS[need][actionIndex] ?? '');
  const doneData = suggestion ? `done:${suggestion.id}` : `quick:${need}:${actionIndex}`;
  return {
    text: `${opener}\n${fill(pick(SUGGEST, random), { action })}`,
    buttons: [[{ text: '✅ Сделала', data: doneData }, { text: '⏰ Позже', data: 'later' }]],
  };
}

export function morningMessage(
  today: readonly { title: string; time: string }[],
  miniAppUrl: string,
  random: () => number,
): OutgoingMessage {
  const plan = today.length
    ? `Сегодня у нас: ${today.map((r) => `${r.title} в ${r.time}`).join(', ')}. Что ещё сделаем?`
    : 'Что сегодня сделаем?';
  return {
    text: `${pick(MORNING, random)}\n${plan}`,
    silent: true,
    buttons: [[{ text: '🐶 Открыть Шантика', webApp: miniAppUrl }]],
  };
}

export function eveningMessage(doneCount: number, random: () => number): OutgoingMessage {
  const text =
    doneCount > 0
      ? fill(pick(EVENING_DONE, random), { deeds: pluralDeeds(doneCount) })
      : pick(EVENING_EMPTY, random);
  return { text, silent: true };
}

export function rewardMessages(rewards: readonly Reward[]): OutgoingMessage[] {
  return rewards.map((reward) =>
    reward.kind === 'photo' && reward.fileId
      ? { text: `${REWARD_INTRO}\n\n${reward.text ?? ''}`.trim(), photo: reward.fileId }
      : { text: `${REWARD_INTRO}\n\n${reward.text ?? ''}`.trim() },
  );
}
