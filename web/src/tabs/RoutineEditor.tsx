import { useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, Need, Routine } from '../api/types';
import { ALL_DAYS, DAY_SHORT, hasDay, toggleDay } from '../lib/days';
import { NeedPicker } from '../ui/NeedPicker';
import { Sheet } from '../ui/Sheet';

const MAX_TITLE = 200;
const DEFAULT_TIME = '09:00';

interface Props {
  api: Api;
  routine: Routine | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function RoutineEditor({ api, routine, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(routine?.title ?? '');
  const [need, setNeed] = useState<Need | null>(routine?.need ?? null);
  const [time, setTime] = useState(routine?.time ?? DEFAULT_TIME);
  const [days, setDays] = useState(routine?.days ?? ALL_DAYS);
  const [active, setActive] = useState(routine?.active ?? true);
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
    const input = { title: title.trim(), need, time, days };
    return run(() => (routine ? api.updateRoutine(routine.id, { ...input, active }) : api.createRoutine(input)));
  }

  return (
    <Sheet title={routine ? 'Рутина' : 'Новая рутина'} onClose={onClose}>
      <label className="field">
        <span>Что делать</span>
        <input className="input" value={title} maxLength={MAX_TITLE} autoFocus={!routine} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <NeedPicker value={need} onChange={setNeed} />
      <label className="field">
        <span>Во сколько</span>
        <input className="input" type="time" value={time} required onChange={(e) => setTime(e.target.value)} />
      </label>
      <div className="days" role="group" aria-label="Дни недели">
        {DAY_SHORT.map((day, index) => (
          <button key={day} type="button" aria-pressed={hasDay(days, index)} className={`day ${hasDay(days, index) ? 'day--on' : ''}`} onClick={() => setDays(toggleDay(days, index))}>
            {day}
          </button>
        ))}
      </div>
      {routine && (
        <label className="field">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Напоминать
        </label>
      )}
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="btn btn--primary btn--wide" disabled={busy || !title.trim() || !need || !time || days === 0} onClick={save}>
          Сохранить
        </button>
        {routine && (
          <button className="btn btn--danger btn--wide" disabled={busy} onClick={() => run(() => api.deleteRoutine(routine.id))}>
            Удалить
          </button>
        )}
      </div>
    </Sheet>
  );
}
