import { useEffect, useState } from 'react';
import { TUNING } from '../../../src/core/tuning';
import { errorText } from '../api/errors';
import type { Api, Rewards } from '../api/types';
import { pluralRu } from '../lib/plural';
import { Segmented } from '../ui/Segmented';
import { Sheet } from '../ui/Sheet';
import { PhotoTile } from './PhotoTile';

type View = 'notes' | 'album';
const VIEWS = [
  { value: 'notes', label: '💌 Записки' },
  { value: 'album', label: '📷 Альбом' },
] as const;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export function TreasuresTab({ api }: { api: Api }) {
  const [view, setView] = useState<View>('notes');
  const [data, setData] = useState<Rewards | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rewards().then(setData, (e: unknown) => setError(errorText(e)));
  }, [api]);

  return (
    <>
      <div className="screen-title">Сокровища</div>
      <Segmented options={VIEWS} value={view} onChange={setView} />
      {error && <div className="error">{error}</div>}
      {data && (view === 'notes' ? <Notes notes={data.notes} /> : <Album api={api} rewards={data} />)}
    </>
  );
}

function Notes({ notes }: { notes: Rewards['notes'] }) {
  if (notes.length === 0) return <div className="empty">Записки появляются, когда Шантику очень-очень хорошо 💌</div>;
  return (
    <>
      {notes.map((note) => (
        <div key={note.id} className="card note">
          <div>💌 {note.text}</div>
          <div className="muted">{dateOf(note.unlockedAt)}</div>
        </div>
      ))}
    </>
  );
}

function Album({ api, rewards }: { api: Api; rewards: Rewards }) {
  const [opened, setOpened] = useState<{ url: string; caption: string | null } | null>(null);
  const { photos, lockedPhotos, nextPhotoIn } = rewards;
  if (photos.length + lockedPhotos === 0) return <div className="empty">Тут будут фото 📷</div>;
  const progress = `${TUNING.photoEvery - nextPhotoIn}/${TUNING.photoEvery}`;
  return (
    <>
      <div className="grid">
        {photos.map((photo) => (
          <PhotoTile key={photo.id} api={api} id={photo.id} caption={photo.caption} onOpen={(url) => setOpened({ url, caption: photo.caption })} />
        ))}
        {Array.from({ length: lockedPhotos }, (_, index) => (
          <div key={`locked${index}`} className="tile tile--locked" aria-label="Закрытое фото">
            🔒{index === 0 && <small>{progress}</small>}
          </div>
        ))}
      </div>
      {lockedPhotos > 0 && (
        <p className="muted center-text">
          следующее фото — через {nextPhotoIn} {pluralRu(nextPhotoIn, ['задачу', 'задачи', 'задач'])}
        </p>
      )}
      {opened && (
        <Sheet title={opened.caption ?? 'Фото'} onClose={() => setOpened(null)}>
          <img className="viewer" src={opened.url} alt={opened.caption ?? 'Фото'} />
        </Sheet>
      )}
    </>
  );
}
