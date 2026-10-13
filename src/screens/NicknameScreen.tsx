import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert, MessageCircle } from 'lucide-react';
import { useChatState, useChatStore } from '../state/ChatContext';
import { NICKNAME_MAX, charLength, clampNicknameInput, cleanNickname } from '../lib/validation';

export function NicknameScreen() {
  const store = useChatStore();
  const { members, joining, nicknameError, connection } = useChatState();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 電腦上自動把游標放進輸入框；手機上不要，避免鍵盤跳出來擋住畫面
  useEffect(() => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) inputRef.current?.focus();
  }, []);

  const cleaned = cleanNickname(value);
  const canSubmit = cleaned.length > 0 && !joining && connection === 'online';
  const onlineCount = members.filter((m) => !m.away).length;
  const error = connection === 'offline' ? '連不上伺服器，請稍後再試' : nicknameError;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) void store.join(cleaned);
  };

  return (
    <main className="nickname">
      <div className="nickname__body">
        <div className="nickname__intro">
          <div className="logo" aria-hidden="true">
            <MessageCircle size={32} strokeWidth={1.8} />
          </div>
          <h1 className="nickname__title">匿名聊天室</h1>
          <p className="nickname__lead">
            輸入一個代號就能開始聊天。
            <br />
            訊息 24 小時後會自動消失。
          </p>
          {connection === 'online' && (
            <p className="online-pill" style={{ margin: 0 }}>
              <span className="dot" aria-hidden="true" />
              現在有 {onlineCount} 個人在聊天
            </p>
          )}
        </div>

        <form className="nickname__form" onSubmit={submit} noValidate>
          <div className="nickname__label-row">
            <label className="nickname__label" htmlFor="nickname">
              你的代號
            </label>
            <span className="nickname__count" aria-live="polite">
              {charLength(cleaned)} / {NICKNAME_MAX}
            </span>
          </div>
          <input
            ref={inputRef}
            id="nickname"
            className="nickname__input"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="go"
            placeholder="例如：小明"
            value={value}
            onChange={(e) => setValue(clampNicknameInput(e.target.value))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'nickname-error' : undefined}
          />
          {error && (
            <p id="nickname-error" className="field-error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              {error}
            </p>
          )}
          <button type="submit" className="primary-btn" disabled={!canSubmit}>
            {joining ? '進入中…' : '進入'}
          </button>
        </form>
      </div>
      <p className="nickname__footnote">不用註冊，也不會記住你的代號</p>
    </main>
  );
}
