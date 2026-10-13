import { useEffect, useId, useRef } from 'react';
import { useLatest } from '../lib/useLatest';

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, danger = false, onConfirm, onCancel }: Props) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useLatest(onCancel);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancelRef]);

  return (
    <div className="dialog-wrap">
      <div className="scrim" onClick={onCancel} aria-hidden="true" />
      <section
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
      >
        <h2 id={`${id}-title`} className="dialog__title">
          {title}
        </h2>
        <p id={`${id}-body`} className="dialog__body">
          {body}
        </p>
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className={`btn-confirm${danger ? ' btn-confirm--danger' : ''}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
