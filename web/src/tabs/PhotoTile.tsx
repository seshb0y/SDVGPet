import { useEffect, useState } from 'react';
import type { Api } from '../api/types';

interface Props {
  api: Api;
  id: number;
  caption: string | null;
  onOpen: (url: string) => void;
}

export function PhotoTile({ api, id, caption, onOpen }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    api.photo(id).then(
      (blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, id]);

  if (failed) {
    return (
      <div className="tile tile--broken" role="img" aria-label="Фото не загрузилось">
        🐾<small>не загрузилось</small>
      </div>
    );
  }
  if (!url) return <div className="tile tile--loading" aria-label="Загружается" />;
  return (
    <button className="tile" onClick={() => onOpen(url)}>
      <img src={url} alt={caption ?? 'Фото'} />
    </button>
  );
}
