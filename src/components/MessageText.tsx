import { useLayoutEffect, useRef, useState } from 'react';
import { linkify } from '../lib/linkify';

/** 訊息文字：一律當純文字顯示，網址變成可以點的連結，超過 15 行先折起來 */
export function MessageText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [text, expanded]);

  return (
    <>
      <p ref={ref} className={`msg-text${expanded ? '' : ' msg-text--clamped'}`}>
        {linkify(text).map((part, i) =>
          part.kind === 'link' ? (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow">
              {part.text}
            </a>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {overflowing && !expanded && (
        <button type="button" className="show-all" onClick={() => setExpanded(true)}>
          顯示全部
        </button>
      )}
    </>
  );
}
