import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLatest } from '../lib/useLatest';

interface Props {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/** 手機上從下方滑出的面板；電腦上變成畫面中間的小視窗 */
export function Sheet({ title, closeLabel, onClose, children }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useLatest(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onCloseRef]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__handle" aria-hidden="true" />
        <div className="sheet__header">
          <h2 className="sheet__title">{title}</h2>
          <button ref={closeRef} type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </section>
    </>
  );
}
