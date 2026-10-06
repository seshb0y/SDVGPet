import { useState } from 'react';
import { errorText } from '../api/errors';
import type { Api, Settings } from '../api/types';
import { Sheet } from '../ui/Sheet';

interface Props {
  api: Api;
  settings: Settings;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}

function timezones(current: string): string[] {
  // Старые Safari не знают supportedValuesOf — тогда показываем только текущий пояс.
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [current];
  return all.includes(current) ? all : [current, ...all];
}

export function SettingsSheet({ api, settings, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setQuiet = (key: 'start' | 'end', value: string) => setDraft({ ...draft, quiet: { ...draft.quiet, [key]: value } });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateSettings(draft));
      onClose();
    } catch (e) {
      setError(errorText(e, 'settings'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Настройки" onClose={onClose}>
      <div className="section-label">Тихие часы — Шантик спит и не пишет</div>
      <div className="row-2">
        <label className="field">
          <span>С</span>
          <input className="input" type="time" value={draft.quiet.start} onChange={(e) => setQuiet('start', e.target.value)} />
        </label>
        <label className="field">
          <span>До</span>
          <input className="input" type="time" value={draft.quiet.end} onChange={(e) => setQuiet('end', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Часовой пояс</span>
        <select className="input" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
          {timezones(draft.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="btn btn--primary btn--wide" disabled={saving} onClick={save}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}
