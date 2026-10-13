import type { ChatListener, ChatService, DemoControls } from '../ChatService';
import {
  ChatError,
  type ChatEvent,
  type ImageRef,
  type Member,
  type Message,
  type OutgoingMessage,
  type Reaction,
} from '../types';
import { newId } from '../../lib/id';
import { MESSAGE_LIMIT, REACTION_LIMIT, RateLimiter } from '../../lib/rateLimit';
import {
  IMAGES_MAX,
  IMAGE_BYTES_MAX,
  TEXT_MAX,
  charLength,
  cleanNickname,
  isValidNickname,
  nicknameKey,
} from '../../lib/validation';
import { BotDirector, type BotHost, type BotProfile } from './bots';
import { makeDemoImage } from './demoImage';
import { buildSeed } from './seedMessages';

// 階段一的假伺服器（docs/architecture.md 第 4.2 節）。
// - 機器人網友只存在於這個分頁
// - 同一個瀏覽器的其他分頁透過 BroadcastChannel 互相傳話，可以真的聊天
// - 刻意模擬延遲、斷線和失敗，讓「傳送中」「重新連線中」這些畫面在階段一就做好

const LATENCY = 300;
const HEARTBEAT_MS = 4000;
const STALE_MS = 10_000;
const GRACE_MS = 60_000;
const HISTORY_LIMIT = 50;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const SESSION_KEY = 'leiiii.session';
const CHANNEL_NAME = 'leiiii-chat-demo';

interface Presence {
  member: Member;
  lastSeen: number;
  away: boolean;
  awaySince: number;
  isBot: boolean;
}

interface Session {
  userId: string;
  nickname: string | null;
}

interface WireMessage {
  message: Message;
  blobs: Blob[];
}

type Wire =
  | { t: 'hello'; member: Member }
  | { t: 'who' }
  | { t: 'bye'; userId: string }
  | { t: 'history_request' }
  | { t: 'history'; messages: WireMessage[]; reactions: Reaction[] }
  | { t: 'message'; message: WireMessage }
  | { t: 'message_update'; message: Message }
  | { t: 'reaction_add'; reaction: Reaction }
  | { t: 'reaction_remove'; reaction: Reaction };

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 私密瀏覽模式可能不能用 sessionStorage，就當作每次都是新的人
  }
}

export class MockChatService implements ChatService, BotHost {
  readonly demo: DemoControls = {
    setOffline: (v) => this.setOffline(v),
    setFailNext: (v) => {
      this.failNext = v;
    },
  };

  private listeners = new Set<ChatListener>();
  private channel: BroadcastChannel | null = null;
  private messages = new Map<string, Message>();
  /** 真人（其他分頁或自己）送的訊息，才會分享給其他分頁 */
  private humanMessageIds = new Set<string>();
  private blobs = new Map<string, Blob>();
  private blobUrls = new Map<string, string>();
  private reactions: Reaction[] = [];
  private presence = new Map<string, Presence>();
  private me: Member | null = null;
  private offline = false;
  private failNext = false;
  private connected = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private bots = new BotDirector(this);
  private messageLimiter = new RateLimiter(MESSAGE_LIMIT.limit, MESSAGE_LIMIT.windowMs);
  private reactionLimiter = new RateLimiter(REACTION_LIMIT.limit, REACTION_LIMIT.windowMs);

  // ── 介面：連線 ────────────────────────────────────────────

  subscribe(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.emit({ type: 'connection_changed', status: 'connecting' });

    await this.loadSeed();

    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (e: MessageEvent<Wire>) => this.onWire(e.data);
    }
    window.addEventListener('pagehide', () => {
      if (this.me) this.post({ t: 'bye', userId: this.me.userId });
    });

    for (const bot of this.bots.initiallyOnline()) this.addPresence(bot, true);
    this.post({ t: 'who' });
    this.post({ t: 'history_request' });
    await delay(400);

    setInterval(() => this.sweep(), 2000);
    this.bots.start();
    this.connected = true;
    this.emit({ type: 'connection_changed', status: 'online' });
    this.emitMembers();
  }

  storedNickname(): string | null {
    return readSession()?.nickname ?? null;
  }

  async join(nickname: string, reuseUserId?: string): Promise<Member> {
    await delay(LATENCY);
    if (this.offline) throw new ChatError('OFFLINE');
    const cleaned = cleanNickname(nickname);
    if (!isValidNickname(cleaned)) throw new ChatError('NICKNAME_INVALID');

    const key = nicknameKey(cleaned);
    const userId = reuseUserId ?? newId();
    for (const p of this.presence.values()) {
      if (p.member.userId !== userId && !p.away && nicknameKey(p.member.nickname) === key) {
        throw new ChatError('NICKNAME_TAKEN');
      }
    }

    this.me = { userId, nickname: cleaned, onlineSince: new Date().toISOString() };
    writeSession({ userId, nickname: cleaned });
    this.startHeartbeat();
    this.emitMembers();
    this.emitHistory();
    this.bots.onHumanJoined(this.me);
    return this.me;
  }

  async resume(): Promise<Member | null> {
    const session = readSession();
    if (!session?.nickname) return null;
    try {
      return await this.join(session.nickname, session.userId);
    } catch (e) {
      if (e instanceof ChatError && e.code === 'NICKNAME_TAKEN') {
        writeSession({ userId: session.userId, nickname: null });
        throw new ChatError('NICKNAME_TAKEN_WHILE_AWAY');
      }
      throw e;
    }
  }

  async leave(): Promise<void> {
    if (this.me) this.post({ t: 'bye', userId: this.me.userId });
    this.stopHeartbeat();
    this.me = null;
    writeSession(null);
  }

  // ── 介面：訊息 ────────────────────────────────────────────

  async sendMessage(out: OutgoingMessage, onProgress?: (fraction: number) => void): Promise<void> {
    const me = this.requireMe();
    if (charLength(out.text) > TEXT_MAX) throw new ChatError('TOO_LONG');
    if (!out.text.trim() && out.images.length === 0) throw new ChatError('EMPTY');
    if (out.images.length > IMAGES_MAX) throw new ChatError('TOO_MANY_IMAGES');
    if (out.images.some((img) => img.blob.size > IMAGE_BYTES_MAX)) throw new ChatError('IMAGE_TOO_LARGE');
    if (this.messageLimiter.take() > 0) throw new ChatError('RATE_LIMITED');

    const total = out.images.length;
    for (let i = 0; i < total; i++) {
      for (let step = 1; step <= 4; step++) {
        await delay(120);
        if (this.offline) throw new ChatError('OFFLINE');
        onProgress?.((i + step / 4) / total);
      }
    }
    await delay(LATENCY);
    if (this.offline) throw new ChatError('OFFLINE');
    if (this.failNext) {
      this.failNext = false;
      throw new ChatError(total ? 'UPLOAD_FAILED' : 'SEND_FAILED');
    }

    const images: ImageRef[] = out.images.map((img, i) => {
      const path = `${me.userId}/${out.id}/${i}.webp`;
      this.storeBlob(path, img.blob);
      return { path, width: img.width, height: img.height };
    });
    const message: Message = {
      id: out.id,
      userId: me.userId,
      nickname: me.nickname,
      text: out.text,
      images,
      createdAt: new Date().toISOString(),
      editedAt: null,
      retracted: false,
    };
    this.messages.set(message.id, message);
    this.humanMessageIds.add(message.id);
    this.emit({ type: 'message_added', message });
    this.post({ t: 'message', message: this.toWire(message) });
    this.bots.onHumanMessage(message);
  }

  async editMessage(id: string, text: string): Promise<void> {
    const me = this.requireMe();
    await delay(LATENCY);
    if (this.offline) throw new ChatError('OFFLINE');
    const m = this.messages.get(id);
    if (!m || m.userId !== me.userId || m.retracted) throw new ChatError('NOT_OWNER');
    if (charLength(text) > TEXT_MAX) throw new ChatError('TOO_LONG');
    if (!text.trim() && m.images.length === 0) throw new ChatError('EMPTY');
    const updated: Message = { ...m, text, editedAt: new Date().toISOString() };
    this.applyUpdate(updated, true);
  }

  async retractMessage(id: string): Promise<void> {
    const me = this.requireMe();
    await delay(LATENCY);
    if (this.offline) throw new ChatError('OFFLINE');
    const m = this.messages.get(id);
    if (!m || m.userId !== me.userId) throw new ChatError('NOT_OWNER');
    this.applyUpdate({ ...m, text: '', images: [], retracted: true }, true);
  }

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const me = this.requireMe();
    if (this.reactionLimiter.take() > 0) throw new ChatError('RATE_LIMITED');
    await delay(150);
    if (this.offline) throw new ChatError('OFFLINE');
    const existing = this.reactions.find(
      (r) => r.messageId === messageId && r.userId === me.userId && r.emoji === emoji,
    );
    if (existing) {
      this.removeReaction(existing);
      this.post({ t: 'reaction_remove', reaction: existing });
    } else {
      const reaction: Reaction = { messageId, userId: me.userId, nickname: me.nickname, emoji };
      this.addReaction(reaction);
      this.post({ t: 'reaction_add', reaction });
    }
  }

  imageUrl(image: ImageRef): string {
    return this.blobUrls.get(image.path) ?? '';
  }

  // ── 機器人用的動作（BotHost） ──────────────────────────────

  botOnline(bot: BotProfile): void {
    this.addPresence(bot, true);
    this.emit({ type: 'member_joined', member: this.presence.get(bot.userId)!.member });
  }

  botAway(userId: string): void {
    const p = this.presence.get(userId);
    if (!p) return;
    p.away = true;
    p.awaySince = Date.now();
    this.emit({ type: 'member_away_changed', userId, away: true });
  }

  botBack(userId: string): void {
    const p = this.presence.get(userId);
    if (!p) return;
    p.away = false;
    this.emit({ type: 'member_away_changed', userId, away: false });
  }

  botLeave(userId: string): void {
    const p = this.presence.get(userId);
    if (!p) return;
    this.presence.delete(userId);
    this.emit({ type: 'member_left', member: p.member });
  }

  async botSay(bot: BotProfile, text: string, withImage = false): Promise<Message | null> {
    const id = newId();
    const images: ImageRef[] = [];
    if (withImage) {
      const img = await makeDemoImage();
      const path = `${bot.userId}/${id}/0.webp`;
      this.storeBlob(path, img.blob);
      images.push({ path, width: img.width, height: img.height });
    }
    if (!text && images.length === 0) return null;
    const message: Message = {
      id,
      userId: bot.userId,
      nickname: bot.nickname,
      text,
      images,
      createdAt: new Date().toISOString(),
      editedAt: null,
      retracted: false,
    };
    this.messages.set(id, message);
    this.emit({ type: 'message_added', message });
    return message;
  }

  botEdit(messageId: string, text: string): void {
    const m = this.messages.get(messageId);
    if (m && !m.retracted) this.applyUpdate({ ...m, text, editedAt: new Date().toISOString() }, false);
  }

  botRetract(messageId: string): void {
    const m = this.messages.get(messageId);
    if (m) this.applyUpdate({ ...m, text: '', images: [], retracted: true }, false);
  }

  botReact(bot: BotProfile, messageId: string, emoji: string): void {
    const m = this.messages.get(messageId);
    if (!m || m.retracted) return;
    const dup = this.reactions.some(
      (r) => r.messageId === messageId && r.userId === bot.userId && r.emoji === emoji,
    );
    if (!dup) this.addReaction({ messageId, userId: bot.userId, nickname: bot.nickname, emoji });
  }

  recentMessages(): Message[] {
    return this.sortedMessages().slice(-20);
  }

  // ── 內部 ──────────────────────────────────────────────────

  private emit(event: ChatEvent): void {
    // 模擬斷線時收不到任何事件（世界照樣在變，重新連上時再一次補齊）
    if (this.offline && event.type !== 'connection_changed') return;
    for (const l of this.listeners) l(event);
  }

  private post(wire: Wire): void {
    if (this.offline) return;
    this.channel?.postMessage(wire);
  }

  private requireMe(): Member {
    if (this.offline) throw new ChatError('OFFLINE');
    if (!this.me) throw new ChatError('NOT_OWNER');
    return this.me;
  }

  private async loadSeed(): Promise<void> {
    const seed = buildSeed(Date.now());
    for (const m of seed.messages) {
      const count = seed.imageCounts[m.id] ?? 0;
      const images: ImageRef[] = [];
      for (let i = 0; i < count; i++) {
        const img = await makeDemoImage(i);
        const path = `${m.userId}/${m.id}/${i}.webp`;
        this.storeBlob(path, img.blob);
        images.push({ path, width: img.width, height: img.height });
      }
      this.messages.set(m.id, { ...m, images });
    }
    this.reactions = [...seed.reactions];
  }

  private storeBlob(path: string, blob: Blob): void {
    if (this.blobUrls.has(path)) return;
    this.blobs.set(path, blob);
    this.blobUrls.set(path, URL.createObjectURL(blob));
  }

  private toWire(message: Message): WireMessage {
    return { message, blobs: message.images.map((img) => this.blobs.get(img.path) ?? new Blob()) };
  }

  private acceptWireMessage(w: WireMessage): boolean {
    if (this.messages.has(w.message.id)) return false;
    w.message.images.forEach((img, i) => {
      if (w.blobs[i]) this.storeBlob(img.path, w.blobs[i]);
    });
    this.messages.set(w.message.id, w.message);
    this.humanMessageIds.add(w.message.id);
    return true;
  }

  private applyUpdate(updated: Message, share: boolean): void {
    const before = this.messages.get(updated.id);
    if (updated.retracted && before) {
      for (const img of before.images) {
        const url = this.blobUrls.get(img.path);
        if (url) URL.revokeObjectURL(url);
        this.blobUrls.delete(img.path);
        this.blobs.delete(img.path);
      }
    }
    this.messages.set(updated.id, updated);
    this.emit({ type: 'message_updated', message: updated });
    if (share) this.post({ t: 'message_update', message: updated });
  }

  private addReaction(reaction: Reaction): void {
    this.reactions.push(reaction);
    this.emit({ type: 'reaction_added', reaction });
  }

  private removeReaction(reaction: Reaction): void {
    this.reactions = this.reactions.filter(
      (r) => !(r.messageId === reaction.messageId && r.userId === reaction.userId && r.emoji === reaction.emoji),
    );
    this.emit({ type: 'reaction_removed', reaction });
  }

  private sortedMessages(): Message[] {
    return [...this.messages.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private emitHistory(): void {
    const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS).toISOString();
    const messages = this.sortedMessages()
      .filter((m) => m.createdAt > cutoff)
      .slice(-HISTORY_LIMIT);
    const ids = new Set(messages.map((m) => m.id));
    const reactions = this.reactions.filter((r) => ids.has(r.messageId));
    this.emit({ type: 'history_loaded', messages, reactions });
  }

  private emitMembers(): void {
    const members = [...this.presence.values()].map((p) => p.member);
    if (this.me) members.unshift(this.me);
    const away = [...this.presence.values()].filter((p) => p.away).map((p) => p.member.userId);
    this.emit({ type: 'members_synced', members, away });
  }

  private addPresence(who: BotProfile | Member, isBot: boolean): void {
    const member: Member =
      'onlineSince' in who ? who : { ...who, onlineSince: new Date().toISOString() };
    this.presence.set(member.userId, { member, lastSeen: Date.now(), away: false, awaySince: 0, isBot });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const beat = () => {
      if (this.me) this.post({ t: 'hello', member: this.me });
    };
    beat();
    this.heartbeat = setInterval(beat, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  /** 其他分頁：太久沒有心跳就算暫離，暫離超過 60 秒就算離開 */
  private sweep(): void {
    const now = Date.now();
    for (const p of [...this.presence.values()]) {
      if (p.isBot) continue;
      if (!p.away && now - p.lastSeen > STALE_MS) {
        p.away = true;
        p.awaySince = now;
        this.emit({ type: 'member_away_changed', userId: p.member.userId, away: true });
      } else if (p.away && now - p.awaySince > GRACE_MS) {
        this.presence.delete(p.member.userId);
        this.emit({ type: 'member_left', member: p.member });
      }
    }
  }

  private onWire(w: Wire): void {
    if (this.offline) return;
    switch (w.t) {
      case 'who':
        if (this.me) this.post({ t: 'hello', member: this.me });
        break;
      case 'hello':
        this.onHello(w.member);
        break;
      case 'bye': {
        const p = this.presence.get(w.userId);
        if (p && !p.away) {
          p.away = true;
          p.awaySince = Date.now();
          this.emit({ type: 'member_away_changed', userId: w.userId, away: true });
        }
        break;
      }
      case 'history_request': {
        const messages = [...this.humanMessageIds]
          .map((id) => this.messages.get(id))
          .filter((m): m is Message => Boolean(m))
          .map((m) => this.toWire(m));
        const ids = new Set(messages.map((m) => m.message.id));
        this.post({ t: 'history', messages, reactions: this.reactions.filter((r) => ids.has(r.messageId)) });
        break;
      }
      case 'history':
        for (const m of w.messages) {
          if (this.acceptWireMessage(m) && this.me) this.emit({ type: 'message_added', message: m.message });
        }
        for (const r of w.reactions) {
          const dup = this.reactions.some(
            (x) => x.messageId === r.messageId && x.userId === r.userId && x.emoji === r.emoji,
          );
          if (!dup) this.addReaction(r);
        }
        break;
      case 'message':
        if (this.acceptWireMessage(w.message)) this.emit({ type: 'message_added', message: w.message.message });
        break;
      case 'message_update':
        if (this.messages.has(w.message.id)) this.applyUpdate(w.message, false);
        break;
      case 'reaction_add':
        if (this.messages.has(w.reaction.messageId)) this.botReactRaw(w.reaction);
        break;
      case 'reaction_remove':
        this.removeReaction(w.reaction);
        break;
    }
  }

  private botReactRaw(r: Reaction): void {
    const dup = this.reactions.some(
      (x) => x.messageId === r.messageId && x.userId === r.userId && x.emoji === r.emoji,
    );
    if (!dup) this.addReaction(r);
  }

  private onHello(member: Member): void {
    if (this.me && member.userId === this.me.userId) return;
    const existing = this.presence.get(member.userId);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.member = member;
      if (existing.away) {
        existing.away = false;
        this.emit({ type: 'member_away_changed', userId: member.userId, away: false });
      }
    } else {
      this.presence.set(member.userId, {
        member,
        lastSeen: Date.now(),
        away: false,
        awaySince: 0,
        isBot: false,
      });
      this.emit({ type: 'member_joined', member });
    }

    // 兩個分頁幾乎同時用同一個代號：比較晚進來的那個要讓出代號
    if (
      this.me &&
      nicknameKey(member.nickname) === nicknameKey(this.me.nickname) &&
      member.onlineSince < this.me.onlineSince
    ) {
      this.kick('conflict');
    }
  }

  private kick(reason: 'conflict' | 'taken_while_away'): void {
    if (!this.me) return;
    this.post({ t: 'bye', userId: this.me.userId });
    this.stopHeartbeat();
    writeSession({ userId: this.me.userId, nickname: null });
    this.me = null;
    this.emit({ type: 'kicked_nickname_conflict', reason });
  }

  private async setOffline(offline: boolean): Promise<void> {
    if (offline === this.offline) return;
    if (offline) {
      this.offline = true;
      this.stopHeartbeat();
      this.emit({ type: 'connection_changed', status: 'reconnecting' });
      return;
    }

    // 重新連線：先等一下，像真的在重連
    await delay(800);
    this.offline = false;
    this.post({ t: 'who' });
    this.post({ t: 'history_request' });
    await delay(400);

    if (this.me) {
      const key = nicknameKey(this.me.nickname);
      const taken = [...this.presence.values()].some(
        (p) => !p.away && p.member.userId !== this.me!.userId && nicknameKey(p.member.nickname) === key,
      );
      if (taken) {
        this.emit({ type: 'connection_changed', status: 'online' });
        this.kick('taken_while_away');
        return;
      }
      this.startHeartbeat();
    }
    this.emit({ type: 'connection_changed', status: 'online' });
    this.emitMembers();
    if (this.me) this.emitHistory();
  }
}
