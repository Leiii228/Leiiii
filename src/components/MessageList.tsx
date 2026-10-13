import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Message, Reaction } from '../chat/types';
import { useChatState, useChatStore } from '../state/ChatContext';
import { dayKey, formatDateLabel } from '../lib/time';
import { DateDivider } from './DateDivider';
import { MessageBubble } from './MessageBubble';
import { SystemNotice } from './SystemNotice';

interface Props {
  editingId: string | null;
  onEdit: (id: string) => void;
  onRetract: (id: string) => void;
  onOpenPicker: (messageId: string) => void;
  onOpenImages: (srcs: string[], index: number) => void;
}

type FeedItem =
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'notice'; key: string; text: string }
  | { kind: 'message'; key: string; message: Message; grouped: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 80;

export function MessageList({ editingId, onEdit, onRetract, onOpenPicker, onOpenImages }: Props) {
  const store = useChatStore();
  const { messages, notices, reactions, blocked, me, local } = useChatState();
  const meId = me?.userId ?? '';

  // 被封鎖的人：訊息、表情回應、進出提示都不顯示
  const visible = useMemo(() => messages.filter((m) => !blocked.includes(m.userId)), [messages, blocked]);

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      if (blocked.includes(r.userId)) continue;
      const list = map.get(r.messageId) ?? [];
      list.push(r);
      map.set(r.messageId, list);
    }
    return map;
  }, [reactions, blocked]);

  const feed = useMemo(() => {
    type Entry = { at: string; item: Message | (typeof notices)[number]; isNotice: boolean };
    const entries: Entry[] = [
      ...visible.map((m) => ({ at: m.createdAt, item: m, isNotice: false })),
      ...notices
        .filter((n) => !blocked.includes(n.userId))
        .map((n) => ({ at: n.at, item: n, isNotice: true })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    const items: FeedItem[] = [];
    let lastDay = '';
    let prev: Message | null = null;
    for (const e of entries) {
      const day = dayKey(e.at);
      if (day !== lastDay) {
        items.push({ kind: 'divider', key: `d-${day}`, label: formatDateLabel(e.at) });
        lastDay = day;
        prev = null;
      }
      if (e.isNotice) {
        const n = e.item as (typeof notices)[number];
        items.push({ kind: 'notice', key: n.id, text: `${n.nickname} ${n.kind === 'joined' ? '進來了' : '離開了'}` });
        prev = null;
        continue;
      }
      const m = e.item as Message;
      if (m.retracted) {
        const text = m.userId === meId ? '你收回了一則訊息' : `${m.nickname} 收回了一則訊息`;
        items.push({ kind: 'notice', key: m.id, text });
        prev = null;
        continue;
      }
      const grouped =
        prev !== null &&
        prev.userId === m.userId &&
        new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_GAP_MS;
      items.push({ kind: 'message', key: m.id, message: m, grouped });
      prev = m;
    }
    return items;
  }, [visible, notices, blocked, meId]);

  // ── 捲動：在最底下時跟著新訊息往下；往上捲在看舊訊息時，改成顯示「有新訊息 ↓」 ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const seen = useRef<Set<string> | null>(null);
  const [newCount, setNewCount] = useState(0);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
  };

  useLayoutEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(visible.map((m) => m.id));
      scrollToBottom();
      return;
    }
    const fresh = visible.filter((m) => !seen.current!.has(m.id));
    fresh.forEach((m) => seen.current!.add(m.id));
    const mineSent = fresh.some((m) => m.userId === meId);
    if (atBottom.current || mineSent) {
      scrollToBottom();
      setNewCount(0);
    } else {
      const fromOthers = fresh.filter((m) => m.userId !== meId).length;
      if (fromOthers) setNewCount((c) => c + fromOthers);
    }
  }, [feed]);

  // 圖片載入、長訊息展開等讓高度改變時，原本在最底下就繼續貼著最底下
  useEffect(() => {
    const target = feedRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) scrollToBottom();
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current && newCount) setNewCount(0);
  };

  return (
    <section className="messages" aria-label="訊息">
      <div ref={scrollRef} className="messages__scroll" onScroll={onScroll}>
        <div ref={feedRef} className="feed" role="log" aria-live="polite" aria-relevant="additions">
          {feed.map((item) => {
            if (item.kind === 'divider') return <DateDivider key={item.key} label={item.label} />;
            if (item.kind === 'notice') return <SystemNotice key={item.key} text={item.text} />;
            const m = item.message;
            return (
              <MessageBubble
                key={item.key}
                message={m}
                mine={m.userId === meId}
                grouped={item.grouped}
                local={local[m.id]}
                reactions={reactionsByMessage.get(m.id) ?? []}
                meId={meId}
                selected={editingId === m.id}
                srcOf={(i) => store.imageSrc(m, i)}
                onOpenImages={(i) =>
                  onOpenImages(
                    m.images.map((_, j) => store.imageSrc(m, j)),
                    i,
                  )
                }
                onToggleReaction={(emoji) => void store.toggleReaction(m.id, emoji)}
                onAddReaction={() => onOpenPicker(m.id)}
                onEdit={() => onEdit(m.id)}
                onRetract={() => onRetract(m.id)}
                onRetry={() => store.retry(m.id)}
              />
            );
          })}
        </div>
      </div>
      {newCount > 0 && (
        <button
          type="button"
          className="new-messages"
          onClick={() => {
            scrollToBottom(true);
            setNewCount(0);
          }}
        >
          有 {newCount} 則新訊息
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
