// 通訊約定的資料格式（docs/architecture.md 第 5.1 節）。
// 假伺服器和 Supabase 版本都必須使用這裡的格式。

/** 在線上的人 */
export interface Member {
  /** 匿名身分的編號，同一個分頁不會變 */
  userId: string;
  nickname: string;
  /** 這次進來的時間（ISO 格式，世界標準時間） */
  onlineSince: string;
}

/** 訊息裡的一張圖片。path 是儲存位置，實際網址由 ChatService.imageUrl() 換算 */
export interface ImageRef {
  path: string;
  width: number;
  height: number;
}

export interface Message {
  id: string;
  userId: string;
  /** 送出當下的代號 */
  nickname: string;
  /** 可以是空字串（只傳圖片的時候） */
  text: string;
  /** 0～9 張 */
  images: ImageRef[];
  /** 由伺服器決定 */
  createdAt: string;
  editedAt: string | null;
  /** true 時文字和圖片已清空 */
  retracted: boolean;
}

export interface Reaction {
  messageId: string;
  userId: string;
  nickname: string;
  emoji: string;
}

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export type ChatErrorCode =
  | 'NICKNAME_TAKEN'
  | 'NICKNAME_TAKEN_WHILE_AWAY'
  | 'NICKNAME_INVALID'
  | 'RATE_LIMITED'
  | 'TOO_LONG'
  | 'EMPTY'
  | 'TOO_MANY_IMAGES'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_UNSUPPORTED'
  | 'UPLOAD_FAILED'
  | 'SEND_FAILED'
  | 'NOT_OWNER'
  | 'OFFLINE';

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  constructor(code: ChatErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'ChatError';
  }
}

export function isChatError(e: unknown): e is ChatError {
  return e instanceof ChatError;
}

/** 前端收到的事件（docs/architecture.md 第 5.3 節） */
export type ChatEvent =
  | { type: 'connection_changed'; status: ConnectionStatus }
  | { type: 'history_loaded'; messages: Message[]; reactions: Reaction[] }
  | { type: 'members_synced'; members: Member[]; away: string[] }
  | { type: 'member_joined'; member: Member }
  | { type: 'member_left'; member: Member }
  /** 斷線未滿 60 秒（暫離）或回來了 */
  | { type: 'member_away_changed'; userId: string; away: boolean }
  | { type: 'message_added'; message: Message }
  | { type: 'message_updated'; message: Message }
  | { type: 'reaction_added'; reaction: Reaction }
  | { type: 'reaction_removed'; reaction: Reaction }
  /** 代號和別人重複，被請回代號輸入畫面 */
  | { type: 'kicked_nickname_conflict'; reason: 'conflict' | 'taken_while_away' };

/** 已經在瀏覽器裡壓縮好、準備上傳的圖片 */
export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface OutgoingMessage {
  /** 由前端產生，伺服器確認後的訊息會用同一個編號，畫面才知道「傳送中」的是哪一則 */
  id: string;
  text: string;
  images: PreparedImage[];
}
