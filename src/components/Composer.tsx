import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, CircleAlert, Info, Paperclip, Pencil, X } from 'lucide-react';
import { useChatState, useChatStore } from '../state/ChatContext';
import { errorText } from '../lib/errorText';
import { ACCEPTED_IMAGE_TYPES, IMAGES_MAX, TEXT_MAX, charLength } from '../lib/validation';

interface Props {
  editingId: string | null;
  onDoneEditing: () => void;
}

interface Picked {
  file: File;
  url: string;
}

interface Hint {
  text: string;
  danger: boolean;
}

const MAX_INPUT_HEIGHT = 148; // 大約 6 行

function isAcceptedFile(f: File): boolean {
  if (f.type === 'image/svg+xml') return false;
  if (ACCEPTED_IMAGE_TYPES.includes(f.type)) return true;
  // 有些瀏覽器對 HEIC 不給 type
  return !f.type && /\.(heic|heif)$/i.test(f.name);
}

export function Composer({ editingId, onDoneEditing }: Props) {
  const store = useChatStore();
  const { connection, messages } = useChatState();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draft = useRef('');
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finePointer = useMemo(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches, []);
  const editing = editingId ? messages.find((m) => m.id === editingId && !m.retracted) ?? null : null;
  const online = connection === 'online';
  const length = charLength(text);
  const tooLong = length > TEXT_MAX;

  // 進入編輯模式：先把正在打的草稿收起來，填入原本的文字；離開時再放回去
  useEffect(() => {
    if (editingId) {
      const target = messages.find((m) => m.id === editingId);
      draft.current = text;
      setText(target?.text ?? '');
      setHint(null);
      inputRef.current?.focus();
    } else {
      setText(draft.current);
      draft.current = '';
    }
  }, [editingId]);

  // 正在編輯的訊息被收回了
  useEffect(() => {
    if (editingId && !editing) onDoneEditing();
  }, [editingId, editing, onDoneEditing]);

  // 輸入框跟著內容長高，最多約 6 行
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const showHint = (h: Hint | null, clearAfterMs?: number) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(h);
    if (h && clearAfterMs) hintTimer.current = setTimeout(() => setHint(null), clearAfterMs);
  };

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list);
    const accepted = all.filter(isAcceptedFile);
    const room = IMAGES_MAX - picked.length;
    const taken = accepted.slice(0, Math.max(0, room));
    setPicked((p) => [...p, ...taken.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (accepted.length > room) showHint({ text: errorText('TOO_MANY_IMAGES'), danger: false });
    else if (accepted.length < all.length) showHint({ text: errorText('IMAGE_UNSUPPORTED'), danger: false });
    else showHint(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePicked = (index: number) => {
    setPicked((p) => {
      URL.revokeObjectURL(p[index].url);
      return p.filter((_, i) => i !== index);
    });
  };

  const canSend = online && !busy && !tooLong && (editing ? Boolean(text.trim()) || editing.images.length > 0 : Boolean(text.trim()) || picked.length > 0);

  const submit = async () => {
    if (!canSend) return;

    if (editing) {
      setBusy(true);
      const problem = await store.edit(editing.id, text);
      setBusy(false);
      if (problem) showHint({ text: problem.text, danger: true });
      else onDoneEditing();
      return;
    }

    setBusy(true);
    const problem = await store.send(text, picked.map((p) => p.file));
    setBusy(false);
    if (problem) {
      const wait = problem.code === 'RATE_LIMITED' ? 4000 : undefined;
      showHint({ text: problem.text, danger: true }, wait);
      return;
    }
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    setPicked([]);
    setText('');
    showHint(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 電腦上 Enter 送出、Shift+Enter 換行；手機上 Enter 是換行。選字中（注音）的 Enter 不算
    if (e.key === 'Enter' && !e.shiftKey && finePointer && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
    if (e.key === 'Escape' && editing) onDoneEditing();
  };

  const visibleHint: Hint | null = tooLong
    ? { text: `訊息太長了，最多 20,000 字（目前 ${length.toLocaleString()} 字）`, danger: true }
    : hint;

  return (
    <form
      className={`composer${editing ? ' composer--editing' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="composer__inner">
        {visibleHint && (
          <p className={`composer__hint${visibleHint.danger ? ' composer__hint--danger' : ''}`} role="status">
            {visibleHint.danger ? <CircleAlert size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
            {visibleHint.text}
          </p>
        )}

        {editing && (
          <div className="composer__editing">
            <span>
              <Pencil size={16} aria-hidden="true" />
              正在編輯訊息
            </span>
            <button type="button" className="icon-btn" aria-label="取消編輯" onClick={onDoneEditing}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {!editing && picked.length > 0 && (
          <div className="previews">
            {picked.map((p, i) => (
              <div key={p.url} className="preview">
                <img src={p.url} alt={`已選的第 ${i + 1} 張圖片`} />
                <button
                  type="button"
                  className="preview__remove"
                  aria-label={`移除第 ${i + 1} 張`}
                  onClick={() => removePicked(i)}
                >
                  <X size={12} strokeWidth={3} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="composer__row">
          {!editing && (
            <>
              <button
                type="button"
                className="icon-btn"
                aria-label="選擇圖片"
                onClick={() => fileRef.current?.click()}
                disabled={picked.length >= IMAGES_MAX}
              >
                <Paperclip size={22} aria-hidden="true" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={[...ACCEPTED_IMAGE_TYPES, '.heic', '.heif'].join(',')}
                multiple
                hidden
                onChange={(e) => onFiles(e.target.files)}
              />
            </>
          )}
          <label htmlFor="composer-input" className="sr-only">
            {editing ? '編輯訊息' : '訊息'}
          </label>
          <textarea
            ref={inputRef}
            id="composer-input"
            className="composer__input"
            rows={1}
            placeholder="輸入訊息…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (hint?.danger) showHint(null);
            }}
            onKeyDown={onKeyDown}
          />
          {editing ? (
            <button type="submit" className="save-btn" disabled={!canSend} onPointerDown={(e) => e.preventDefault()}>
              儲存
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              aria-label={online ? '送出' : '送出（連線中斷時無法送出）'}
              disabled={!canSend}
              onPointerDown={(e) => e.preventDefault()}
            >
              <ArrowUp size={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <span className="composer__keys">Enter 送出・Shift + Enter 換行</span>
      </div>
    </form>
  );
}
