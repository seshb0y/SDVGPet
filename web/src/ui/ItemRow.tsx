import { useState, type MouseEvent } from 'react';

interface Props {
  emoji: string;
  title: string;
  meta?: string;
  done: boolean;
  muted?: boolean;
  onToggle?: () => Promise<void>;
  onOpen?: () => void;
}

export function ItemRow({ emoji, title, meta, done, muted, onToggle, onOpen }: Props) {
  const [pending, setPending] = useState(false);

  async function toggle(event: MouseEvent) {
    event.stopPropagation();
    if (done || pending || !onToggle) return;
    setPending(true);
    try {
      await onToggle();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`row card ${done ? 'row--done' : ''} ${muted ? 'row--muted' : ''}`} onClick={onOpen}>
      {(onToggle || done) && (
        <button
          className={`check ${done ? 'check--done' : ''}`}
          aria-label={done ? 'Сделано' : 'Отметить сделанным'}
          disabled={done || pending}
          onClick={toggle}
        />
      )}
      <span className="row__title">
        {emoji} {title}
      </span>
      {meta && <span className="muted row__meta">{meta}</span>}
    </div>
  );
}
