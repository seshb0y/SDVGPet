import type { Api, AppState, CompleteResult } from '../api/types';
import { nearest, type NearestItem } from '../lib/nearest';
import { NEED_EMOJI } from '../lib/needs';
import { speechFor } from '../pet/phrases';
import { Shantik } from '../pet/Shantik';
import { ItemRow } from '../ui/ItemRow';
import { NeedBars } from './NeedBars';

interface Props {
  api: Api;
  state: AppState;
  celebrating: boolean;
  seed: number;
  onComplete: (run: () => Promise<CompleteResult>) => Promise<void>;
  onSettings: () => void;
}

export function PetTab({ api, state, celebrating, seed, onComplete, onSettings }: Props) {
  const items = nearest(state);
  const complete = (item: NearestItem) =>
    onComplete(() => (item.kind === 'task' ? api.completeTask(item.id) : api.completeRoutine(item.id)));

  return (
    <>
      <div className="screen-title">
        Шантик
        <button className="gear" aria-label="Настройки" onClick={onSettings}>
          ⚙︎
        </button>
      </div>
      <Shantik mood={state.mood} celebrating={celebrating} />
      <div className="speech" aria-live="polite">
        {speechFor(state.mood, celebrating, seed)}
      </div>
      <NeedBars needs={state.needs} />
      <div className="section-label">Ближайшее</div>
      {items.length === 0 ? (
        <div className="empty">Пока ничего не запланировано. Напиши боту, что хочешь сделать 🐾</div>
      ) : (
        items.map((item) => (
          <ItemRow key={item.key} emoji={NEED_EMOJI[item.need]} title={item.title} meta={item.time ?? undefined} done={false} onToggle={() => complete(item)} />
        ))
      )}
    </>
  );
}
