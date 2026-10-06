import { describe, expect, it } from 'vitest';
import type { Task } from '../api/types';
import { nearest } from './nearest';

const task = (id: number, need: Task['need']): Task => ({
  id, title: `задача ${id}`, need, dueAt: null, doneAt: null, createdAt: '2026-12-27T09:00:00Z',
});

describe('nearest', () => {
  it('сначала несделанные рутины по времени, потом задачи; черновики без потребности не попадают', () => {
    const items = nearest({
      routinesToday: [
        { id: 2, title: 'вечер', time: '21:00', need: 'love', done: false },
        { id: 1, title: 'таблетки', time: '20:00', need: 'food', done: false },
        { id: 3, title: 'зарядка', time: '08:00', need: 'walk', done: true },
      ],
      tasks: [task(10, null), task(11, 'play')],
    });
    expect(items.map((i) => i.key)).toEqual(['routine:1', 'routine:2', 'task:11']);
    expect(items[0]).toMatchObject({ kind: 'routine', id: 1, need: 'food', time: '20:00' });
    expect(items[2]).toMatchObject({ kind: 'task', id: 11, time: null });
  });

  it('не больше limit', () => {
    const tasks = [1, 2, 3, 4, 5].map((id) => task(id, 'play'));
    expect(nearest({ routinesToday: [], tasks })).toHaveLength(3);
    expect(nearest({ routinesToday: [], tasks }, 2)).toHaveLength(2);
  });
});
