import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';

const REVEAL = 88;
const THRESHOLD = 48;
const DEAD_ZONE = 6;

export function SwipeRow({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);

  function down(event: PointerEvent) {
    start.current = { x: event.clientX, y: event.clientY, base: offset };
    moved.current = false;
  }

  function move(event: PointerEvent) {
    const from = start.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    if (Math.abs(dx) < DEAD_ZONE || Math.abs(dx) < Math.abs(event.clientY - from.y)) return;
    moved.current = true;
    setDragging(true);
    setOffset(Math.min(0, Math.max(-REVEAL, from.base + dx)));
  }

  function up() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    setOffset((value) => (value < -THRESHOLD ? -REVEAL : 0));
  }

  /** После свайпа клик не открывает строку; тап по открытой строке — закрывает её. */
  function clickCapture(event: MouseEvent) {
    if (moved.current) {
      moved.current = false;
      event.stopPropagation();
    } else if (offset !== 0) {
      event.stopPropagation();
      setOffset(0);
    }
  }

  return (
    <div className="swipe">
      <button
        className="swipe__delete"
        style={{ opacity: offset === 0 ? 0 : 1, visibility: offset === 0 ? 'hidden' : 'visible' }}
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        onClick={onDelete}
      >
        Удалить
      </button>
      <div
        className="swipe__content"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clickCapture}
      >
        {children}
      </div>
    </div>
  );
}
