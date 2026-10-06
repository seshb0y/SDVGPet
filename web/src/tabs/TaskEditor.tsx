import { useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, Need, Task } from '../api/types';
import { dueAtToday, timeOf } from '../lib/time';
import { NeedPicker } from '../ui/NeedPicker';
import { Sheet } from '../ui/Sheet';

const MAX_TITLE = 200;

interface Props {
  api: Api;
  task: Task | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function TaskEditor({ api, task, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [need, setNeed] = useState<Need | null>(task?.need ?? null);
  const [time, setTime] = useState(task?.dueAt ? timeOf(task.dueAt) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!need) return;
    const input = { title: title.trim(), need, dueAt: time ? dueAtToday(time, new Date()) : null };
    return run(() => (task ? api.updateTask(task.id, input) : api.createTask(input)));
  }

  return (
    <Sheet title={task ? 'Задача' : 'Новая задача'} onClose={onClose}>
      <label className="field">
        <span>Что сделать</span>
        <input className="input" value={title} maxLength={MAX_TITLE} autoFocus={!task} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <NeedPicker value={need} onChange={setNeed} />
      <label className="field">
        <span>Время (необязательно)</span>
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="btn btn--primary btn--wide" disabled={busy || !title.trim() || !need} onClick={save}>
          Сохранить
        </button>
        {task && (
          <button className="btn btn--danger btn--wide" disabled={busy} onClick={() => run(() => api.deleteTask(task.id))}>
            Удалить
          </button>
        )}
      </div>
    </Sheet>
  );
}
