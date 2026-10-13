import { useState } from 'react';
import { Ban, Ellipsis } from 'lucide-react';
import { useChatState, useChatStore } from '../state/ChatContext';

// 頭像底色依代號固定挑一組（docs/design.md 2.1）
const AVATAR_COLORS: Array<[string, string]> = [
  ['#F7C89B', '#5B3A29'],
  ['#D9CBEA', '#4A3A63'],
  ['#CFE0C3', '#3E5A36'],
  ['#C9DBEA', '#34506A'],
  ['#F4BBA8', '#6B2E1F'],
];

export function avatarColors(nickname: string): [string, string] {
  let h = 0;
  for (const ch of nickname) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function MemberList({ showNote = false }: { showNote?: boolean }) {
  const store = useChatStore();
  const { members, me, blocked } = useChatState();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const sorted = [...members].sort((a, b) => {
    if (a.userId === me?.userId) return -1;
    if (b.userId === me?.userId) return 1;
    return a.onlineSince.localeCompare(b.onlineSince);
  });

  return (
    <>
      <ul className="member-list">
        {sorted.map((m) => {
          const isMe = m.userId === me?.userId;
          const isBlocked = blocked.includes(m.userId);
          const [bg, fg] = avatarColors(m.nickname);
          const cls = ['member', isMe && 'member--me', m.away && 'member--away'].filter(Boolean).join(' ');
          return (
            <li key={m.userId} className={cls}>
              <span className="avatar" style={{ background: bg, color: fg }} aria-hidden="true">
                {Array.from(m.nickname)[0]}
                <span className="avatar__status" />
              </span>
              <span className="member__name">
                {m.nickname}
                {isMe && <span className="member__you">（你）</span>}
                {m.away && <span className="tag">暫離</span>}
                {isBlocked && <span className="tag tag--danger">已封鎖</span>}
              </span>
              {!isMe && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${m.nickname} 的選項`}
                  aria-expanded={menuFor === m.userId}
                  onClick={() => setMenuFor(menuFor === m.userId ? null : m.userId)}
                >
                  <Ellipsis size={20} aria-hidden="true" />
                </button>
              )}
              {menuFor === m.userId && (
                <>
                  <button type="button" className="menu-backdrop" aria-label="關閉選單" onClick={() => setMenuFor(null)} />
                  <div className="menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={`menu__item${isBlocked ? '' : ' menu__item--danger'}`}
                      onClick={() => {
                        if (isBlocked) store.unblock(m.userId);
                        else store.block(m.userId);
                        setMenuFor(null);
                      }}
                    >
                      <Ban size={18} aria-hidden="true" />
                      {isBlocked ? '解除封鎖' : '封鎖'}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {showNote && (
        <p className="member-list__note">
          封鎖只影響你自己的畫面：你不會看到對方的訊息、表情回應和進出提示，別人看不出來。
        </p>
      )}
    </>
  );
}
