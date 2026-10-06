import type { AppState, Need } from '../api/types';
import { timeOf } from './time';

export interface NearestItem {
  key: string;
  kind: 'task' | 'routine';
  id: number;
  need: Need;
  title: string;
  time: string | null;
}

export function nearest(state: Pick<AppState, 'tasks' | 'routinesToday'>, limit = 3): NearestItem[] {
  const routines: NearestItem[] = state.routinesToday
    .filter((r) => !r.done)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => ({ key: `routine:${r.id}`, kind: 'routine', id: r.id, need: r.need, title: r.title, time: r.time }));
  const tasks: NearestItem[] = state.tasks.flatMap((t) =>
    t.need
      ? [{ key: `task:${t.id}`, kind: 'task' as const, id: t.id, need: t.need, title: t.title, time: t.dueAt ? timeOf(t.dueAt) : null }]
      : [],
  );
  return [...routines, ...tasks].slice(0, limit);
}
