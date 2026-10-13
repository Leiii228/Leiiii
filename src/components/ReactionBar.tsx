import { useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import type { Reaction } from '../chat/types';

interface Props {
  reactions: Reaction[];
  meId: string;
  onToggle: (emoji: string) => void;
  onAdd: () => void;
}

interface Group {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

function groupReactions(reactions: Reaction[], meId: string): Group[] {
  const map = new Map<string, Group>();
  for (const r of reactions) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
    g.count += 1;
    if (r.userId === meId) {
      g.mine = true;
      g.names.unshift('你');
    } else {
      g.names.push(r.nickname);
    }
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

/** 訊息下方的「👍 3 ❤️ 1 ＋😊」。電腦上滑鼠移過去、手機上長按，會列出是誰按的 */
export function ReactionBar({ reactions, meId, onToggle, onAdd }: Props) {
  const groups = groupReactions(reactions, meId);
  const [shown, setShown] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  // 手機上長按打開名單後，點畫面其他地方就關掉
  useEffect(() => {
    if (!shown) return;
    const close = () => setShown(null);
    const t = setTimeout(() => document.addEventListener('pointerdown', close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', close);
    };
  }, [shown]);

  const clearTimer = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const shownGroup = groups.find((g) => g.emoji === shown);

  return (
    <div className="reactions">
      {shownGroup && (
        <div className="reactors" role="tooltip" id={`reactors-${shownGroup.emoji}`}>
          <span className="reactors__title">
            {shownGroup.emoji} {shownGroup.count} 個人
          </span>
          <ul>
            {shownGroup.names.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          className="chip"
          aria-pressed={g.mine}
          aria-label={`${g.emoji} ${g.count} 個人${g.mine ? '，包括你' : ''}：${g.names.join('、')}`}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setShown(g.emoji);
          }}
          onPointerLeave={(e) => {
            clearTimer();
            if (e.pointerType === 'mouse') setShown(null);
          }}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') return;
            longPressed.current = false;
            pressTimer.current = setTimeout(() => {
              longPressed.current = true;
              setShown(g.emoji);
            }, 450);
          }}
          onPointerUp={clearTimer}
          onPointerCancel={clearTimer}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            onToggle(g.emoji);
          }}
        >
          <span aria-hidden="true">{g.emoji}</span>
          <span className="chip__count" aria-hidden="true">
            {g.count}
          </span>
        </button>
      ))}
      <button type="button" className="add-reaction" aria-label="加上表情回應" onClick={onAdd}>
        <SmilePlus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
