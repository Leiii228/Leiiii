import { useState } from 'react';
import { CircleAlert, Ellipsis, Pencil, Undo2 } from 'lucide-react';
import type { Message, Reaction } from '../chat/types';
import type { LocalStatus } from '../state/chatStore';
import { formatTime } from '../lib/time';
import { ImageGrid } from './ImageGrid';
import { MessageText } from './MessageText';
import { ReactionBar } from './ReactionBar';

interface Props {
  message: Message;
  mine: boolean;
  /** 和上一則是同一個人連續送的：不再顯示代號 */
  grouped: boolean;
  local: LocalStatus | undefined;
  reactions: Reaction[];
  meId: string;
  selected: boolean;
  srcOf: (index: number) => string;
  onOpenImages: (index: number) => void;
  onToggleReaction: (emoji: string) => void;
  onAddReaction: () => void;
  onEdit: () => void;
  onRetract: () => void;
  onRetry: () => void;
}

export function MessageBubble(props: Props) {
  const { message, mine, grouped, local, reactions, meId, selected } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const hasImages = message.images.length > 0;
  const confirmed = !local;

  const bubbleClass = [
    'bubble',
    hasImages && 'bubble--has-images',
    local?.status === 'sending' && 'bubble--sending',
    local?.status === 'failed' && 'bubble--failed',
    (selected || menuOpen) && 'bubble--selected',
  ]
    .filter(Boolean)
    .join(' ');

  const meta = (
    <span className="msg__meta">
      {message.editedAt && <span>(已編輯)</span>}
      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
    </span>
  );

  let status = meta;
  if (local?.status === 'sending') status = <span className="status-sending">傳送中…</span>;
  if (local?.status === 'failed') {
    status = (
      <button type="button" className="retry-btn" onClick={props.onRetry}>
        <CircleAlert size={15} aria-hidden="true" />
        傳送失敗，點此重試
      </button>
    );
  }

  return (
    <div className={`msg${mine ? ' msg--mine' : ''}${grouped ? ' msg--grouped' : ''}`}>
      {!mine && !grouped && <span className="msg__name">{message.nickname}</span>}
      <div className="msg__row">
        {mine && confirmed && (
          <button
            type="button"
            className="more-btn"
            aria-label="訊息選項"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Ellipsis size={18} aria-hidden="true" />
          </button>
        )}
        {mine && status}
        <div className={bubbleClass}>
          {hasImages && (
            <ImageGrid
              images={message.images}
              srcOf={props.srcOf}
              onOpen={props.onOpenImages}
              progress={local?.status === 'sending' ? local.progress : undefined}
            />
          )}
          {message.text && <MessageText text={message.text} />}
        </div>
        {!mine && meta}

        {menuOpen && (
          <>
            <button type="button" className="menu-backdrop" aria-label="關閉選單" onClick={() => setMenuOpen(false)} />
            <div className="menu" role="menu" style={{ left: 0, top: 'calc(100% + 4px)' }}>
              <button
                type="button"
                role="menuitem"
                className="menu__item"
                onClick={() => {
                  setMenuOpen(false);
                  props.onEdit();
                }}
              >
                <Pencil size={18} aria-hidden="true" />
                編輯
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu__item menu__item--danger"
                onClick={() => {
                  setMenuOpen(false);
                  props.onRetract();
                }}
              >
                <Undo2 size={18} aria-hidden="true" />
                收回
              </button>
            </div>
          </>
        )}
      </div>
      {confirmed && (
        <ReactionBar
          reactions={reactions}
          meId={meId}
          onToggle={props.onToggleReaction}
          onAdd={props.onAddReaction}
        />
      )}
    </div>
  );
}
