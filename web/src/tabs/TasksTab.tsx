import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, AppState, CompleteResult, Routine, Task } from '../api/types';
import { daysLabel } from '../lib/days';
import { NEED_EMOJI } from '../lib/needs';
import { timeOf } from '../lib/time';
import { ItemRow } from '../ui/ItemRow';
import { Segmented } from '../ui/Segmented';
import { SwipeRow } from '../ui/SwipeRow';
import { RoutineEditor } from './RoutineEditor';
import { TaskEditor } from './TaskEditor';

type View = 'today' | 'routines';
type Editing = { kind: 'task'; task: Task | null } | { kind: 'routine'; routine: Routine | null } | null;

const VIEWS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'routines', label: 'Рутины' },
] as const;

interface Props {
  api: Api;
  state: AppState;
  onComplete: (run: () => Promise<CompleteResult>) => Promise<void>;
  onChanged: () => Promise<void>;
}

export function TasksTab({ api, state, onComplete, onChanged }: Props) {
  const [view, setView] = useState<View>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextTasks, nextRoutines] = await Promise.all([api.listTasks(), api.listRoutines()]);
      setTasks(nextTasks);
      setRoutines(nextRoutines);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load, state]);

  async function remove(action: () => Promise<void>) {
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const add = () => setEditing(view === 'today' ? { kind: 'task', task: null } : { kind: 'routine', routine: null });

  return (
    <>
      <div className="screen-title">Задачи</div>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error && <div className="error">{error}</div>}
      {view === 'today' ? (
        <TodayList api={api} state={state} tasks={tasks} onComplete={onComplete} onEdit={(task) => setEditing({ kind: 'task', task })} onDelete={(id) => remove(() => api.deleteTask(id))} />
      ) : (
        <RoutineList routines={routines} onEdit={(routine) => setEditing({ kind: 'routine', routine })} onDelete={(id) => remove(() => api.deleteRoutine(id))} />
      )}
      <button className="fab" aria-label={view === 'today' ? 'Новая задача' : 'Новая рутина'} onClick={add}>
        +
      </button>
      {editing?.kind === 'task' && <TaskEditor api={api} task={editing.task} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {editing?.kind === 'routine' && <RoutineEditor api={api} routine={editing.routine} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </>
  );
}

interface TodayProps {
  api: Api;
  state: AppState;
  tasks: Task[];
  onComplete: Props['onComplete'];
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
}

function TodayList({ api, state, tasks, onComplete, onEdit, onDelete }: TodayProps) {
  const open = tasks.filter((t) => t.need && !t.doneAt);
  const done = tasks.filter((t) => t.need && t.doneAt);
  if (state.routinesToday.length + open.length + done.length === 0) {
    return <div className="empty">На сегодня пусто. Нажми «+» или просто напиши боту 🐾</div>;
  }
  return (
    <>
      {state.routinesToday.map((r) => (
        <ItemRow key={`r${r.id}`} emoji={NEED_EMOJI[r.need]} title={r.title} meta={r.time} done={r.done} onToggle={() => onComplete(() => api.completeRoutine(r.id))} />
      ))}
      {open.map((t) => (
        <SwipeRow key={t.id} onDelete={() => onDelete(t.id)}>
          <ItemRow
            emoji={t.need ? NEED_EMOJI[t.need] : ''}
            title={t.title}
            meta={t.dueAt ? timeOf(t.dueAt) : undefined}
            done={false}
            onToggle={() => onComplete(() => api.completeTask(t.id))}
            onOpen={() => onEdit(t)}
          />
        </SwipeRow>
      ))}
      {done.map((t) => (
        <ItemRow key={t.id} emoji={t.need ? NEED_EMOJI[t.need] : ''} title={t.title} done />
      ))}
    </>
  );
}

function RoutineList({ routines, onEdit, onDelete }: { routines: Routine[]; onEdit: (r: Routine) => void; onDelete: (id: number) => void }) {
  if (routines.length === 0) return <div className="empty">Рутин пока нет. Таблетки, зарядка, полить цветы — добавь через «+» 🐾</div>;
  return (
    <>
      {routines.map((r) => (
        <SwipeRow key={r.id} onDelete={() => onDelete(r.id)}>
          <ItemRow emoji={NEED_EMOJI[r.need]} title={r.title} meta={`${daysLabel(r.days)} · ${r.time}`} done={false} muted={!r.active} onOpen={() => onEdit(r)} />
        </SwipeRow>
      ))}
    </>
  );
}
