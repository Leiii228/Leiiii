import { useState } from 'react';
import { Composer } from '../components/Composer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmojiPicker } from '../components/EmojiPicker';
import { Lightbox } from '../components/Lightbox';
import { MemberList } from '../components/MemberList';
import { MessageList } from '../components/MessageList';
import { Sheet } from '../components/Sheet';
import { TopBar } from '../components/TopBar';
import { useChatState, useChatStore } from '../state/ChatContext';

type Confirm = { kind: 'retract'; id: string } | { kind: 'leave' } | null;

export function ChatScreen() {
  const store = useChatStore();
  const { members } = useChatState();
  const [membersOpen, setMembersOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ srcs: string[]; index: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <main className="chat">
      <TopBar onOpenMembers={() => setMembersOpen(true)} onLeave={() => setConfirm({ kind: 'leave' })} />

      <div className="chat__body">
        <div className="chat__main">
          <MessageList
            editingId={editingId}
            onEdit={setEditingId}
            onRetract={(id) => setConfirm({ kind: 'retract', id })}
            onOpenPicker={setPickerFor}
            onOpenImages={(srcs, index) => setLightbox({ srcs, index })}
          />
          <Composer editingId={editingId} onDoneEditing={() => setEditingId(null)} />
        </div>
        <aside className="members-aside" aria-labelledby="members-aside-title">
          <h2 id="members-aside-title" className="members-aside__title">
            線上 {members.length} 人
          </h2>
          <MemberList />
        </aside>
      </div>

      {membersOpen && (
        <Sheet title={`線上 ${members.length} 人`} closeLabel="關閉線上名單" onClose={() => setMembersOpen(false)}>
          <MemberList showNote />
        </Sheet>
      )}

      {pickerFor && (
        <EmojiPicker
          onPick={(emoji) => {
            void store.toggleReaction(pickerFor, emoji);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}

      {lightbox && <Lightbox srcs={lightbox.srcs} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}

      {confirm?.kind === 'retract' && (
        <ConfirmDialog
          title="要收回這則訊息嗎？"
          body="收回後，大家會看到「你收回了一則訊息」，訊息裡的圖片也會一起刪除。"
          confirmLabel="收回"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (editingId === confirm.id) setEditingId(null);
            void store.retract(confirm.id);
            setConfirm(null);
          }}
        />
      )}

      {confirm?.kind === 'leave' && (
        <ConfirmDialog
          title="要離開聊天室嗎？"
          body="離開後就不能再編輯或收回你之前送的訊息，下次進來要重新輸入代號。"
          confirmLabel="離開"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void store.leave();
          }}
        />
      )}
    </main>
  );
}
