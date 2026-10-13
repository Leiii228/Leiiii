import { LogOut, RotateCw, Users } from 'lucide-react';
import { useChatState } from '../state/ChatContext';

interface Props {
  onOpenMembers: () => void;
  onLeave: () => void;
}

export function TopBar({ onOpenMembers, onLeave }: Props) {
  const { members, connection } = useChatState();

  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">匿名聊天室</h1>
        <div className="topbar__actions">
          <button
            type="button"
            className="members-btn"
            onClick={onOpenMembers}
            aria-label={`線上名單，${members.length} 人`}
          >
            <Users size={18} aria-hidden="true" />
            <span>{members.length}</span>
          </button>
          <button type="button" className="leave-btn" onClick={onLeave}>
            <LogOut size={18} aria-hidden="true" />
            <span>離開</span>
          </button>
        </div>
      </header>
      {connection !== 'online' && (
        <div className="conn-banner" role="status">
          <RotateCw size={16} className="spin" aria-hidden="true" />
          {connection === 'connecting' ? '連線中…' : '連線中斷，正在重新連線…'}
        </div>
      )}
    </>
  );
}
