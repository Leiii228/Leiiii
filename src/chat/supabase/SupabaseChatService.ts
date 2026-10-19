import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { ChatListener, ChatService } from '../ChatService';
import {
  ChatError,
  type ChatErrorCode,
  type ChatEvent,
  type ConnectionStatus,
  type ImageRef,
  type Member,
  type Message,
  type OutgoingMessage,
  type Reaction,
} from '../types';
import { cleanNickname, isValidNickname, nicknameKey } from '../../lib/validation';
import { createSupabase } from './client';

// 階段二：真的連到 Supabase（docs/architecture.md 第 4.3、5.4、6 節）。
// 畫面層和狀態層只認得 ChatService 介面，這個檔案是唯一知道 Supabase 長什麼樣子的地方。

const LOBBY = 'room:lobby';
const BUCKET = 'chat-images';
const HISTORY_LIMIT = 50;
const GRACE_MS = 60_000;
const CONFLICT_RECHECK_MS = 1500;
const SESSION_KEY = 'leiiii.session';

interface MessageRow {
  id: string;
  user_id: string;
  nickname: string;
  body: string;
  images: ImageRef[] | string;
  created_at: string;
  edited_at: string | null;
  retracted_at: string | null;
}

interface ReactionRow {
  message_id: string;
  user_id: string;
  nickname?: string;
  emoji: string;
}

/** 資料庫和即時通知的時間格式不完全一樣，統一成 ISO 格式，排序才不會亂 */
function toIso(value: string | null): string | null {
  if (!value) return value;
  let t = value.replace(' ', 'T');
  if (/[+-]\d\d$/.test(t)) t += ':00';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

function fromRow(r: MessageRow): Message {
  const images = typeof r.images === 'string' ? (JSON.parse(r.images) as ImageRef[]) : r.images ?? [];
  return {
    id: r.id,
    userId: r.user_id,
    nickname: r.nickname,
    text: r.body,
    images,
    createdAt: toIso(r.created_at)!,
    editedAt: toIso(r.edited_at),
    retracted: r.retracted_at !== null,
  };
}

function fromReactionRow(r: ReactionRow): Reaction {
  return { messageId: r.message_id, userId: r.user_id, nickname: r.nickname ?? '', emoji: r.emoji };
}

/** 資料庫回傳的錯誤 → 通訊約定的錯誤代碼 */
function toCode(error: { message?: string; code?: string } | null, fallback: ChatErrorCode): ChatErrorCode {
  const msg = error?.message ?? '';
  if (msg.includes('RATE_LIMITED')) return 'RATE_LIMITED';
  if (msg.includes('messages_body_len')) return 'TOO_LONG';
  if (msg.includes('messages_images_array')) return 'TOO_MANY_IMAGES';
  if (msg.includes('messages_not_empty')) return 'EMPTY';
  if (msg.includes('ALREADY_RETRACTED') || msg.includes('IMMUTABLE_FIELDS')) return 'NOT_OWNER';
  if (error?.code === 'PGRST116' || error?.code === '42501') return 'NOT_OWNER';
  return fallback;
}

function extensionOf(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/gif') return 'gif';
  return 'webp';
}

function readNickname(): string | null {
  try {
    return (JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as { nickname?: string } | null)?.nickname ?? null;
  } catch {
    return null;
  }
}

function writeNickname(nickname: string | null): void {
  try {
    if (nickname) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ nickname }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 不能存的話，重新整理後要重新輸入代號
  }
}

const reactionKey = (r: { messageId: string; userId: string; emoji: string }) =>
  `${r.messageId}|${r.userId}|${r.emoji}`;

export class SupabaseChatService implements ChatService {
  readonly demo = null;

  private readonly client: SupabaseClient = createSupabase();
  private listeners = new Set<ChatListener>();
  private lobby: RealtimeChannel | null = null;
  private db: RealtimeChannel | null = null;
  private me: Member | null = null;
  private status: ConnectionStatus = 'connecting';
  private lobbyReady = false;
  private everSubscribed = false;

  /** Presence 上目前看得到的人 */
  private present = new Map<string, Member>();
  /** 斷線未滿 60 秒的人 */
  private away = new Map<string, { member: Member; timer: ReturnType<typeof setTimeout> }>();
  private firstSync = true;

  /** 收回時要知道有哪些圖片 */
  private knownMessages = new Map<string, Message>();
  private myReactions = new Set<string>();

  // ── 連線 ──────────────────────────────────────────────────

  subscribe(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');

    this.lobby = this.client.channel(LOBBY, { config: { presence: { enabled: true } } });
    this.lobby.on('presence', { event: 'sync' }, () => this.onPresenceSync());

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      this.lobby!.subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          this.lobbyReady = true;
          const reconnected = this.everSubscribed;
          this.everSubscribed = true;
          this.setStatus('online');
          if (reconnected) void this.onReconnected();
          done();
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          this.lobbyReady = false;
          this.setStatus(this.everSubscribed ? 'reconnecting' : 'offline');
          done();
        }
      });
      setTimeout(done, 10_000);
    });

    // 手機切回前景時，主動補一次訊息
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.me && this.lobbyReady) void this.loadHistory();
    });
  }

  storedNickname(): string | null {
    return readNickname();
  }

  async join(nickname: string): Promise<Member> {
    const cleaned = cleanNickname(nickname);
    if (!isValidNickname(cleaned)) throw new ChatError('NICKNAME_INVALID');
    if (!this.lobbyReady) throw new ChatError('OFFLINE');

    // 第一次才需要取得匿名身分；同一個分頁重新整理會沿用 sessionStorage 裡的身分
    let { data } = await this.client.auth.getSession();
    if (!data.session) {
      const res = await this.client.auth.signInAnonymously();
      if (res.error || !res.data.session) throw new ChatError('OFFLINE', res.error?.message);
      data = { session: res.data.session };
    }
    const userId = data.session!.user.id;

    if (this.isTaken(cleaned, userId)) throw new ChatError('NICKNAME_TAKEN');

    this.me = { userId, nickname: cleaned, onlineSince: new Date().toISOString() };
    writeNickname(cleaned);

    await this.subscribeDb();
    const tracked = await this.lobby!.track(this.me);
    if (tracked !== 'ok') {
      this.me = null;
      throw new ChatError('OFFLINE');
    }

    this.emitMembers();
    await this.loadHistory();

    // 兩個人幾乎同時用同一個代號：過一下再檢查一次
    setTimeout(() => this.checkConflict('conflict'), CONFLICT_RECHECK_MS);
    return this.me;
  }

  async resume(): Promise<Member | null> {
    const nickname = readNickname();
    if (!nickname) return null;
    try {
      return await this.join(nickname);
    } catch (e) {
      if (e instanceof ChatError && e.code === 'NICKNAME_TAKEN') {
        writeNickname(null);
        throw new ChatError('NICKNAME_TAKEN_WHILE_AWAY');
      }
      throw e;
    }
  }

  async leave(): Promise<void> {
    await this.lobby?.untrack();
    if (this.db) await this.client.removeChannel(this.db);
    this.db = null;
    this.me = null;
    this.knownMessages.clear();
    this.myReactions.clear();
    writeNickname(null);
    // 身分作廢：下次進來會拿到新的匿名身分
    await this.client.auth.signOut({ scope: 'local' });
  }

  // ── 訊息 ──────────────────────────────────────────────────

  async sendMessage(out: OutgoingMessage, onProgress?: (fraction: number) => void): Promise<void> {
    const me = this.requireMe();

    const images: ImageRef[] = [];
    for (let i = 0; i < out.images.length; i++) {
      const img = out.images[i];
      const path = `${me.userId}/${out.id}/${i}.${extensionOf(img.blob.type)}`;
      const { error } = await this.client.storage
        .from(BUCKET)
        .upload(path, img.blob, { contentType: img.blob.type || 'image/webp', upsert: false });
      // 重試時圖片可能已經傳上去了，那就沿用
      if (error && !/exists|duplicate/i.test(error.message)) {
        throw new ChatError(/size|large/i.test(error.message) ? 'IMAGE_TOO_LARGE' : 'UPLOAD_FAILED', error.message);
      }
      images.push({ path, width: img.width, height: img.height });
      onProgress?.((i + 1) / out.images.length);
    }

    const { data, error } = await this.client
      .from('messages')
      .insert({ id: out.id, user_id: me.userId, nickname: me.nickname, body: out.text, images })
      .select()
      .single();

    if (error) {
      // 上一次其實已經存進去了（例如回應在路上斷掉）：直接拿那一筆
      if (error.code === '23505') {
        const existing = await this.client.from('messages').select().eq('id', out.id).single();
        if (existing.data) {
          this.onMessage(fromRow(existing.data as MessageRow), 'message_added');
          return;
        }
      }
      throw new ChatError(toCode(error, 'SEND_FAILED'), error.message);
    }
    this.onMessage(fromRow(data as MessageRow), 'message_added');
  }

  async editMessage(id: string, text: string): Promise<void> {
    this.requireMe();
    const { data, error } = await this.client.from('messages').update({ body: text }).eq('id', id).select().single();
    if (error) throw new ChatError(toCode(error, 'SEND_FAILED'), error.message);
    this.onMessage(fromRow(data as MessageRow), 'message_updated');
  }

  async retractMessage(id: string): Promise<void> {
    const me = this.requireMe();
    const before = this.knownMessages.get(id);
    const { data, error } = await this.client
      .from('messages')
      .update({ retracted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new ChatError(toCode(error, 'SEND_FAILED'), error.message);
    this.onMessage(fromRow(data as MessageRow), 'message_updated');

    // 收回時，圖片也一起從 Storage 刪掉（刪不掉的話，清理程式 24 小時後也會刪）
    const paths = (before?.images ?? []).map((img) => img.path).filter((p) => p.startsWith(`${me.userId}/`));
    if (paths.length) await this.client.storage.from(BUCKET).remove(paths);
  }

  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const me = this.requireMe();
    const reaction: Reaction = { messageId, userId: me.userId, nickname: me.nickname, emoji };
    const key = reactionKey(reaction);

    if (this.myReactions.has(key)) {
      const { error } = await this.client
        .from('reactions')
        .delete()
        .match({ message_id: messageId, user_id: me.userId, emoji });
      if (error) throw new ChatError(toCode(error, 'SEND_FAILED'), error.message);
      this.myReactions.delete(key);
      this.emit({ type: 'reaction_removed', reaction });
    } else {
      const { error } = await this.client
        .from('reactions')
        .insert({ message_id: messageId, user_id: me.userId, nickname: me.nickname, emoji });
      if (error && error.code !== '23505') throw new ChatError(toCode(error, 'SEND_FAILED'), error.message);
      this.myReactions.add(key);
      this.emit({ type: 'reaction_added', reaction });
    }
  }

  imageUrl(image: ImageRef): string {
    return this.client.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
  }

  // ── 內部 ──────────────────────────────────────────────────

  private emit(event: ChatEvent): void {
    for (const l of this.listeners) l(event);
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.emit({ type: 'connection_changed', status });
  }

  private requireMe(): Member {
    if (!this.me) throw new ChatError('NOT_OWNER');
    if (this.status !== 'online') throw new ChatError('OFFLINE');
    return this.me;
  }

  /** 訂閱資料表的變動（要在取得匿名身分之後，權限規則才會把我當成已登入的人） */
  private subscribeDb(): Promise<void> {
    if (this.db) return Promise.resolve();
    // wait: true → 等伺服器確認訂閱真的建立好才算連上，剛進來的頭幾秒才不會漏訊息
    this.db = this.client
      .channel(`${LOBBY}:db`, { config: { postgres_changes_options: { wait: true } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) =>
        this.onMessage(fromRow(p.new as MessageRow), 'message_added'),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) =>
        this.onMessage(fromRow(p.new as MessageRow), 'message_updated'),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (p) => {
        const r = fromReactionRow(p.new as ReactionRow);
        if (r.userId === this.me?.userId) this.myReactions.add(reactionKey(r));
        this.emit({ type: 'reaction_added', reaction: r });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (p) => {
        const r = fromReactionRow(p.old as ReactionRow);
        if (r.userId === this.me?.userId) this.myReactions.delete(reactionKey(r));
        this.emit({ type: 'reaction_removed', reaction: r });
      });

    return new Promise((resolve) => {
      let settled = false;
      this.db!.subscribe((state) => {
        if (!settled && (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT')) {
          settled = true;
          resolve();
        }
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      }, 10_000);
    });
  }

  private onMessage(message: Message, type: 'message_added' | 'message_updated'): void {
    this.knownMessages.set(message.id, message);
    this.emit({ type, message });
  }

  private async loadHistory(): Promise<void> {
    const { data: rows, error } = await this.client
      .from('messages')
      .select()
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error || !rows) return;

    const messages = (rows as MessageRow[]).map(fromRow).reverse();
    messages.forEach((m) => this.knownMessages.set(m.id, m));

    let reactions: Reaction[] = [];
    if (messages.length) {
      const { data: rRows } = await this.client
        .from('reactions')
        .select('message_id, user_id, nickname, emoji')
        .in(
          'message_id',
          messages.map((m) => m.id),
        );
      reactions = ((rRows ?? []) as ReactionRow[]).map(fromReactionRow);
    }
    this.myReactions = new Set(reactions.filter((r) => r.userId === this.me?.userId).map(reactionKey));
    this.emit({ type: 'history_loaded', messages, reactions });
  }

  private async onReconnected(): Promise<void> {
    if (!this.me) {
      this.emitMembers();
      return;
    }
    if (this.isTaken(this.me.nickname, this.me.userId)) {
      this.kick('taken_while_away');
      return;
    }
    await this.lobby?.track(this.me);
    this.emitMembers();
    await this.loadHistory();
  }

  /** 代號是不是被別人（不是這個身分）用走了；暫離的人 Presence 看不到，不算 */
  private isTaken(nickname: string, userId: string): boolean {
    const key = nicknameKey(nickname);
    for (const m of this.present.values()) {
      if (m.userId !== userId && nicknameKey(m.nickname) === key) return true;
    }
    return false;
  }

  private checkConflict(reason: 'conflict' | 'taken_while_away'): void {
    const me = this.me;
    if (!me) return;
    const key = nicknameKey(me.nickname);
    for (const m of this.present.values()) {
      if (m.userId !== me.userId && nicknameKey(m.nickname) === key && m.onlineSince < me.onlineSince) {
        this.kick(reason);
        return;
      }
    }
  }

  private kick(reason: 'conflict' | 'taken_while_away'): void {
    void this.lobby?.untrack();
    this.me = null;
    writeNickname(null);
    this.emit({ type: 'kicked_nickname_conflict', reason });
  }

  /** Presence 每次變動都重新比對：誰新進來、誰斷線（先算暫離，60 秒後才算離開） */
  private onPresenceSync(): void {
    const state = this.lobby!.presenceState<Member>();
    const now = new Map<string, Member>();
    for (const metas of Object.values(state)) {
      for (const meta of metas) {
        if (meta.userId && meta.nickname) {
          now.set(meta.userId, { userId: meta.userId, nickname: meta.nickname, onlineSince: meta.onlineSince });
        }
      }
    }

    const before = this.present;
    this.present = now;
    const myId = this.me?.userId;

    if (this.firstSync) {
      this.firstSync = false;
      this.emitMembers();
      return;
    }

    for (const [id, member] of now) {
      if (before.has(id) || id === myId) continue;
      const waiting = this.away.get(id);
      if (waiting) {
        clearTimeout(waiting.timer);
        this.away.delete(id);
        this.emit({ type: 'member_away_changed', userId: id, away: false });
      } else {
        this.emit({ type: 'member_joined', member });
      }
    }

    for (const [id, member] of before) {
      if (now.has(id) || id === myId || this.away.has(id)) continue;
      const timer = setTimeout(() => {
        this.away.delete(id);
        this.emit({ type: 'member_left', member });
      }, GRACE_MS);
      this.away.set(id, { member, timer });
      this.emit({ type: 'member_away_changed', userId: id, away: true });
    }

    this.checkConflict('conflict');
  }

  private emitMembers(): void {
    const members = new Map(this.present);
    for (const [id, a] of this.away) members.set(id, a.member);
    if (this.me) members.set(this.me.userId, this.me);
    this.emit({ type: 'members_synced', members: [...members.values()], away: [...this.away.keys()] });
  }
}
