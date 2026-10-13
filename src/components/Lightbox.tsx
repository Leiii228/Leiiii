import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLatest } from '../lib/useLatest';

interface Props {
  srcs: string[];
  startIndex: number;
  onClose: () => void;
}

/** 圖片放大檢視：左右滑或左右鍵換張，往下滑、Esc、點 ✕ 關閉 */
export function Lightbox({ srcs, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const total = srcs.length;
  const onCloseRef = useLatest(onClose);

  const go = (delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [total, onCloseRef]);

  const onPointerDown = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 80 && dy > Math.abs(dx)) onClose();
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`圖片檢視，第 ${index + 1} 張，共 ${total} 張`}>
      <div className="lightbox__top">
        <span className="lightbox__count">
          {index + 1} / {total}
        </span>
        <button ref={closeRef} type="button" className="icon-btn" aria-label="關閉" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="lightbox__stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <img src={srcs[index]} alt={`第 ${index + 1} 張圖片`} draggable={false} />
        {total > 1 && (
          <>
            <button
              type="button"
              className="icon-btn lightbox__nav lightbox__nav--prev"
              aria-label="上一張"
              onClick={() => go(-1)}
              disabled={index === 0}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn lightbox__nav lightbox__nav--next"
              aria-label="下一張"
              onClick={() => go(1)}
              disabled={index === total - 1}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="lightbox__bottom">
        {total > 1 && (
          <div className="lightbox__dots" aria-hidden="true">
            {srcs.map((_, i) => (
              <span key={i} className={i === index ? 'is-current' : undefined} />
            ))}
          </div>
        )}
        <span className="lightbox__hint">{total > 1 ? '左右滑看其他張・往下滑關閉' : '往下滑關閉'}</span>
      </div>
    </div>
  );
}
