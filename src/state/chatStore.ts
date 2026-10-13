import type { ChatService } from '../chat/ChatService';
import {
  isChatError,
  type ChatErrorCode,
  type ChatEvent,
  type ConnectionStatus,
  type ImageRef,
  type Member,
  type Message,
  type OutgoingMessage,
  type Reaction,
} from '../chat/types';
import { prepareImage } from '../lib/compressImage';
import { errorText } from '../lib/errorText';
import { newId } from '../lib/id';
import { MESSAGE_LIMIT, REACTION_LIMIT, RateLimiter } from '../lib/rateLimit';
import { setUnreadTitle } from '../lib/unreadTitle';
import { IMAGES_MAX, TEXT_MAX, charLength } from '../lib/validation';

// 狀態層：目前有哪些訊息、誰在線上、我封鎖了誰、未讀幾則……
// 只透過 ChatService 介面和伺服器溝通，不知道背後是假的還是 Supabase。

export interface LocalStatus {
  status: 'sending' | 'failed';
  /** 0～1，只有圖片上傳時有意義 */
  progress: number;
  /** 還沒上傳完成的圖片，先用本機的預覽 */
  previews: string[];
}

export interface Notice {
  id: string;
  kind: 'joined' | 'left';
  userId: string;
  nickname: string;
  at: string;
}

export interface MemberView extends Member {
  away: boolean;
}

export interface ChatState {
  phase: 'starting' | 'nickname' | 'chat';
  joining: boolean;
  nicknameError: string | null;
  me: Member | null;
  connection: ConnectionStatus;
  messages: Message[];
  local: Record<string, LocalStatus>;
  reactions: Reaction[];
  members: MemberView[];
  notices: Notice[];
  blocked: string[];
  unread: number;
  demo: { enabled: boolean; offline: boolean; failNext: boolean };
}

/** 送出時的檢查沒過（文字和圖片會留在輸入框裡） */
export interface SendProblem {
  code: ChatErrorCode;
  text: string;
}

const BLOCKED_KEY = 'leiiii.blocked';

function readBlocked(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(BLOCKED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function writeBlocked(ids: string[]): void {
  try {
    if (ids.length) sessionStorage.setItem(BLOCKED_KEY, JSON.stringify(ids));
    else sessionStorage.removeItem(BLOCKED_KEY);
  } catch {
    // 不能存也沒關係，只是重新整理後封鎖清單會不見
  }
}

const byTime = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt);
const sameReaction = (a: Reaction, b: Reaction) =>
  a.messageId === b.messageId && a.userId === b.userId && a.emoji === b.emoji;

export class ChatStore {
  private state: ChatState;
  private listeners = new Set<() => void>();
  private readonly service: ChatService;
  private outgoing = new Map<string, OutgoingMessage>();
  private messageLimiter = new RateLimiter(MESSAGE_LIMIT.limit, MESSAGE_LIMIT.windowMs);
  private reactionLimiter = new RateLimiter(REACTION_LIMIT.limit, REACTION_LIMIT.windowMs);

  constructor(service: ChatService) {
    this.service = service;
    this.state = {
      phase: 'starting',
      joining: false,
      nicknameError: null,
      me: null,
      connection: 'connecting',
      messages: [],
      local: {},
      reactions: [],
      members: [],
      notices: [],
      blocked: readBlocked(),
      unread: 0,
      demo: { enabled: service.demo !== null, offline: false, failNext: false },
    };
  }

  // ── 給 React 用 ──────────────────────────────────────────

  getState = (): ChatState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)): void {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  // ── 啟動 ──────────────────────────────────────────────────

  async start(): Promise<void> {
    this.service.subscribe((e) => this.handle(e));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.state.unread) {
        this.set({ unread: 0 });
        setUnreadTitle(0);
      }
    });

    await this.service.connect();

    if (this.service.storedNickname()) {
      try {
        const me = await this.service.resume();
        if (me) {
          this.set({ me, phase: 'chat' });
          return;
        }
      } catch (e) {
        this.set({ nicknameError: isChatError(e) ? errorText(e.code) : '連不上伺服器，請稍後再試' });
      }
    }
    this.set({ phase: 'nickname' });
  }

  // ── 進入與離開 ────────────────────────────────────────────

  async join(nickname: string): Promise<void> {
    this.set({ joining: true, nicknameError: null });
    try {
      const me = await this.service.join(nickname);
      this.set({ me, phase: 'chat', joining: false, notices: [] });
    } catch (e) {
      this.set({
        joining: false,
        nicknameError: isChatError(e) ? errorText(e.code) : '連不上伺服器，請稍後再試',
      });
    }
  }

  async leave(): Promise<void> {
    await this.service.leave();
    for (const l of Object.values(this.state.local)) l.previews.forEach((u) => URL.revokeObjectURL(u));
    this.outgoing.clear();
    writeBlocked([]);
    setUnreadTitle(0);
    this.set({
      phase: 'nickname',
      me: null,
      messages: [],
      local: {},
      reactions: [],
      notices: [],
      blocked: [],
      unread: 0,
      nicknameError: null,
    });
  }

  // ── 訊息 ──────────────────────────────────────────────────

  /**
   * 送出訊息。檢查沒過時回傳問題（輸入框保留內容）；
   * 檢查通過就立刻在畫面上出現「傳送中」的泡泡，回傳 null，之後的成功或失敗反映在泡泡上。
   */
  async send(text: string, files: File[]): Promise<SendProblem | null> {
    const me = this.state.me;
    if (!me) return { code: 'NOT_OWNER', text: errorText('NOT_OWNER') };
    if (this.state.connection !== 'online') return { code: 'OFFLINE', text: errorText('OFFLINE') };
    if (charLength(text) > TEXT_MAX) return { code: 'TOO_LONG', text: errorText('TOO_LONG') };
    if (!text.trim() && files.length === 0) return { code: 'EMPTY', text: errorText('EMPTY') };
    if (files.length > IMAGES_MAX) return { code: 'TOO_MANY_IMAGES', text: errorText('TOO_MANY_IMAGES') };

    const wait = this.messageLimiter.take();
    if (wait > 0) return { code: 'RATE_LIMITED', text: errorText('RATE_LIMITED', Math.ceil(wait / 1000)) };

    let images;
    try {
      images = await Promise.all(files.map(prepareImage));
    } catch (e) {
      const code = isChatError(e) ? e.code : 'IMAGE_UNSUPPORTED';
      return { code, text: errorText(code) };
    }

    const id = newId();
    const previews = images.map((img) => URL.createObjectURL(img.blob));
    const pending: Message = {
      id,
      userId: me.userId,
      nickname: me.nickname,
      text,
      images: images.map((img, i): ImageRef => ({ path: `local:${i}`, width: img.width, height: img.height })),
      createdAt: new Date().toISOString(),
      editedAt: null,
      retracted: false,
    };
    this.outgoing.set(id, { id, text, images });
    this.set((s) => ({
      messages: [...s.messages, pending],
      local: { ...s.local, [id]: { status: 'sending', progress: 0, previews } },
    }));
    void this.runSend(id);
    return null;
  }

  retry(id: string): void {
    if (!this.outgoing.has(id)) return;
    this.patchLocal(id, { status: 'sending', progress: 0 });
    void this.runSend(id);
  }

  private async runSend(id: string): Promise<void> {
    const out = this.outgoing.get(id);
    if (!out) return;
    try {
      await this.service.sendMessage(out, (progress) => this.patchLocal(id, { progress }));
    } catch {
      this.patchLocal(id, { status: 'failed' });
    }
  }

  private patchLocal(id: string, patch: Partial<LocalStatus>): void {
    this.set((s) => (s.local[id] ? { local: { ...s.local, [id]: { ...s.local[id], ...patch } } } : {}));
  }

  async edit(id: string, text: string): Promise<SendProblem | null> {
    const before = this.state.messages.find((m) => m.id === id);
    if (!before) return null;
    if (charLength(text) > TEXT_MAX) return { code: 'TOO_LONG', text: errorText('TOO_LONG') };
    if (!text.trim() && before.images.length === 0) return { code: 'EMPTY', text: errorText('EMPTY') };
    if (text === before.text) return null;
    this.replaceMessage({ ...before, text, editedAt: new Date().toISOString() });
    try {
      await this.service.editMessage(id, text);
      return null;
    } catch (e) {
      this.replaceMessage(before);
      const code = isChatError(e) ? e.code : 'SEND_FAILED';
      return { code, text: code === 'SEND_FAILED' ? '編輯失敗，請再試一次' : errorText(code) };
    }
  }

  async retract(id: string): Promise<void> {
    const before = this.state.messages.find((m) => m.id === id);
    if (!before) return;
    this.replaceMessage({ ...before, text: '', images: [], retracted: true });
    try {
      await this.service.retractMessage(id);
    } catch {
      this.replaceMessage(before);
    }
  }

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const me = this.state.me;
    if (!me || this.state.connection !== 'online') return;
    if (this.reactionLimiter.take() > 0) return;
    const mine: Reaction = { messageId, userId: me.userId, nickname: me.nickname, emoji };
    const had = this.state.reactions.some((r) => sameReaction(r, mine));
    this.set((s) => ({
      reactions: had ? s.reactions.filter((r) => !sameReaction(r, mine)) : [...s.reactions, mine],
    }));
    try {
      await this.service.toggleReaction(messageId, emoji);
    } catch {
      this.set((s) => ({
        reactions: had ? [...s.reactions, mine] : s.reactions.filter((r) => !sameReaction(r, mine)),
      }));
    }
  }

  /** 圖片要顯示的網址：還在傳送中的用本機預覽，其他的問 ChatService */
  imageSrc(message: Message, index: number): string {
    const local = this.state.local[message.id];
    if (local?.previews[index]) return local.previews[index];
    const ref = message.images[index];
    return ref ? this.service.imageUrl(ref) : '';
  }

  // ── 封鎖 ──────────────────────────────────────────────────

  block(userId: string): void {
    if (this.state.blocked.includes(userId)) return;
    const blocked = [...this.state.blocked, userId];
    writeBlocked(blocked);
    this.set({ blocked });
  }

  unblock(userId: string): void {
    const blocked = this.state.blocked.filter((id) => id !== userId);
    writeBlocked(blocked);
    this.set({ blocked });
  }

  // ── 示範模式的開關 ────────────────────────────────────────

  setDemoOffline(offline: boolean): void {
    this.service.demo?.setOffline(offline);
    this.set((s) => ({ demo: { ...s.demo, offline } }));
  }

  setDemoFailNext(failNext: boolean): void {
    this.service.demo?.setFailNext(failNext);
    this.set((s) => ({ demo: { ...s.demo, failNext } }));
  }

  // ── 處理 ChatService 的事件 ──────────────────────────────

  private handle(e: ChatEvent): void {
    switch (e.type) {
      case 'connection_changed':
        this.set({ connection: e.status });
        break;

      case 'history_loaded': {
        const ids = new Set(e.messages.map((m) => m.id));
        // 還在傳送中或失敗的訊息留著
        const pending = this.state.messages.filter((m) => this.state.local[m.id] && !ids.has(m.id));
        this.set({ messages: [...e.messages, ...pending].sort(byTime), reactions: e.reactions });
        break;
      }

      case 'members_synced': {
        const away = new Set(e.away);
        this.set({ members: e.members.map((m) => ({ ...m, away: away.has(m.userId) })) });
        break;
      }

      case 'member_joined':
        this.set((s) => ({
          members: [...s.members.filter((m) => m.userId !== e.member.userId), { ...e.member, away: false }],
          notices: this.withNotice(s, 'joined', e.member),
        }));
        break;

      case 'member_left':
        this.set((s) => ({
          members: s.members.filter((m) => m.userId !== e.member.userId),
          notices: this.withNotice(s, 'left', e.member),
        }));
        break;

      case 'member_away_changed':
        this.set((s) => ({
          members: s.members.map((m) => (m.userId === e.userId ? { ...m, away: e.away } : m)),
        }));
        break;

      case 'message_added': {
        const local = this.state.local[e.message.id];
        if (local) {
          // 自己送出的訊息被伺服器確認了
          local.previews.forEach((u) => URL.revokeObjectURL(u));
          this.outgoing.delete(e.message.id);
          this.set((s) => {
            const { [e.message.id]: _, ...rest } = s.local;
            return {
              messages: s.messages.map((m) => (m.id === e.message.id ? e.message : m)).sort(byTime),
              local: rest,
            };
          });
          break;
        }
        if (this.state.messages.some((m) => m.id === e.message.id)) break;
        this.set((s) => ({ messages: [...s.messages, e.message].sort(byTime) }));
        this.countUnread(e.message);
        break;
      }

      case 'message_updated':
        this.replaceMessage(e.message);
        break;

      case 'reaction_added':
        if (!this.state.reactions.some((r) => sameReaction(r, e.reaction))) {
          this.set((s) => ({ reactions: [...s.reactions, e.reaction] }));
        }
        break;

      case 'reaction_removed':
        this.set((s) => ({ reactions: s.reactions.filter((r) => !sameReaction(r, e.reaction)) }));
        break;

      case 'kicked_nickname_conflict':
        this.set({
          phase: 'nickname',
          me: null,
          nicknameError: errorText(e.reason === 'conflict' ? 'NICKNAME_TAKEN' : 'NICKNAME_TAKEN_WHILE_AWAY'),
        });
        break;
    }
  }

  private withNotice(s: ChatState, kind: Notice['kind'], member: Member): Notice[] {
    if (s.phase !== 'chat' || !s.me || member.userId === s.me.userId) return s.notices;
    return [
      ...s.notices,
      { id: newId(), kind, userId: member.userId, nickname: member.nickname, at: new Date().toISOString() },
    ];
  }

  private replaceMessage(message: Message): void {
    this.set((s) => ({ messages: s.messages.map((m) => (m.id === message.id ? message : m)) }));
  }

  private countUnread(message: Message): void {
    const s = this.state;
    if (s.phase !== 'chat' || !document.hidden) return;
    if (message.userId === s.me?.userId || s.blocked.includes(message.userId)) return;
    const unread = s.unread + 1;
    this.set({ unread });
    setUnreadTitle(unread);
  }
}
