import { describe, expect, it } from 'vitest';
import {
  QUICK_ACTIONS,
  eveningMessage,
  morningMessage,
  needMessage,
  pluralDeeds,
  rewardMessages,
  routineMessage,
} from '../../src/services/messages.js';

const first = () => 0;
const SETTINGS = { timezone: 'Europe/Moscow', quiet: { start: '23:00', end: '09:00' } };
const PILLS = { id: 3, title: 'таблетки', time: '20:00' };

describe('routineMessage', () => {
  it('в 20:00 предлагает «Сделала» и оба снуза', () => {
    const msg = routineMessage(PILLS, '2026-12-27', new Date('2026-12-27T17:00:00Z'), SETTINGS, first);
    expect(msg.text).toContain('таблетки');
    expect(msg.buttons).toEqual([
      [{ text: '✅ Сделала', data: 'rdone:3:2026-12-27' }],
      [
        { text: '⏰ +15 мин', data: 'rsnooze:3:2026-12-27:15' },
        { text: '⏰ +1 ч', data: 'rsnooze:3:2026-12-27:60' },
      ],
    ]);
  });

  it('в 22:30 не предлагает снуз в тихие часы', () => {
    const late = { ...PILLS, time: '22:30' };
    const msg = routineMessage(late, '2026-12-27', new Date('2026-12-27T19:30:00Z'), SETTINGS, first);
    expect(msg.buttons?.[1]).toEqual([{ text: '⏰ +15 мин', data: 'rsnooze:3:2026-12-27:15' }]);
  });

  it('в 22:50 снуза нет вовсе', () => {
    const late = { ...PILLS, time: '22:50' };
    const msg = routineMessage(late, '2026-12-27', new Date('2026-12-27T19:50:00Z'), SETTINGS, first);
    expect(msg.buttons).toHaveLength(1);
  });
});

describe('needMessage', () => {
  it('предлагает её открытую задачу', () => {
    const msg = needMessage('food', { id: 7, title: 'пообедать' }, first, false);
    expect(msg.text).toContain('пообедать');
    expect(msg.buttons).toEqual([[{ text: '✅ Сделала', data: 'done:7' }, { text: '⏰ Позже', data: 'later' }]]);
  });

  it('без задачи предлагает простое действие', () => {
    const msg = needMessage('walk', null, first, false);
    expect(msg.text).toContain(QUICK_ACTIONS.walk[0]);
    expect(msg.buttons?.[0]?.[0]).toEqual({ text: '✅ Сделала', data: 'quick:walk:0' });
  });

  it('повтор звучит иначе, чем первый сигнал', () => {
    expect(needMessage('food', null, first, true).text).not.toEqual(needMessage('food', null, first, false).text);
  });
});

describe('morning, evening, rewards', () => {
  it('утро — без звука, с рутинами дня и кнопкой Mini App', () => {
    const msg = morningMessage([{ title: 'таблетки', time: '20:00' }], 'https://app.example', first);
    expect(msg.silent).toBe(true);
    expect(msg.text).toContain('таблетки в 20:00');
    expect(msg.buttons).toEqual([[{ text: '🐶 Открыть Шантика', webApp: 'https://app.example' }]]);
  });

  it('вечер без дел — тёплый, без упрёков; с делами — со счётом', () => {
    expect(eveningMessage(0, first)).toMatchObject({ silent: true });
    expect(eveningMessage(0, first).text).toContain('это тоже нормально');
    expect(eveningMessage(4, first).text).toContain('4 дела');
  });

  it('награды: записка текстом, фото по file_id', () => {
    const msgs = rewardMessages([
      { id: 1, kind: 'note', text: 'ты умница', fileId: null, unlockedAt: null },
      { id: 2, kind: 'photo', text: 'море', fileId: 'FILE', unlockedAt: null },
    ]);
    expect(msgs[0]?.text).toContain('ты умница');
    expect(msgs[1]).toMatchObject({ photo: 'FILE' });
    expect(msgs[1]?.text).toContain('море');
  });

  it('склоняет «дело»', () => {
    expect([1, 2, 5, 11, 21, 22].map(pluralDeeds)).toEqual(['1 дело', '2 дела', '5 дел', '11 дел', '21 дело', '22 дела']);
  });
});
