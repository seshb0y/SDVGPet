import { useCallback, useEffect, useState } from 'react';
import { createApi } from './api';
import { errorText } from './api/errors';
import type { Api, AppState, CompleteResult, Settings } from './api/types';
import { speechFor } from './pet/phrases';
import { PetTab } from './tabs/PetTab';
import { SettingsSheet } from './tabs/SettingsSheet';
import { TasksTab } from './tabs/TasksTab';
import { TreasuresTab } from './tabs/TreasuresTab';
import { hapticSuccess } from './telegram';
import { useTimezoneSync } from './useTimezoneSync';

const CELEBRATE_MS = 2500;
type Tab = 'pet' | 'tasks' | 'treasures';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'pet', label: '🐶 Шантик' },
  { id: 'tasks', label: '✅ Задачи' },
  { id: 'treasures', label: '🎁 Сокровища' },
];
/** Фраза Шантика меняется раз в день, а не на каждый рендер. */
const SEED = new Date().getDate();

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pet');
  const [celebrating, setCelebrating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!api) return;
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void createApi().then(setApi);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  const applySettings = useCallback((settings: Settings) => setState((s) => (s ? { ...s, settings } : s)), []);
  useTimezoneSync(api, state?.settings, applySettings);

  const complete = useCallback(
    async (run: () => Promise<CompleteResult>) => {
      try {
        if ((await run()).completed) {
          hapticSuccess();
          setCelebrating(true);
        }
        await reload();
      } catch (e) {
        setError(errorText(e));
      }
    },
    [reload],
  );

  if (!api || !state) return <Splash error={error} onRetry={reload} />;

  return (
    <div className="app">
      <main className="screen">
        {error && (
          <div className="banner" role="alert">
            {error}
          </div>
        )}
        {tab === 'pet' && (
          <PetTab api={api} state={state} celebrating={celebrating} seed={SEED} onComplete={complete} onSettings={() => setSettingsOpen(true)} />
        )}
        {tab === 'tasks' && <TasksTab api={api} state={state} onComplete={complete} onChanged={reload} />}
        {tab === 'treasures' && <TreasuresTab api={api} />}
      </main>
      {celebrating && tab !== 'pet' && <div className="toast">{speechFor(state.mood, true, SEED)}</div>}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab--on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {settingsOpen && <SettingsSheet api={api} settings={state.settings} onClose={() => setSettingsOpen(false)} onSaved={applySettings} />}
    </div>
  );
}

function Splash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="app">
      <main className="screen center">
        <div className="empty">{error ?? 'Шантик просыпается… 🐾'}</div>
        {error && (
          <button className="btn" onClick={onRetry}>
            Попробовать ещё раз
          </button>
        )}
      </main>
    </div>
  );
}
