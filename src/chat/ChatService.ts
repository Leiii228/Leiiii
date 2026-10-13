import type { ChatEvent, ImageRef, Member, OutgoingMessage } from './types';

// 連線介面（docs/architecture.md 第 4.1、5.2 節）。
// 畫面層和狀態層只認得這份介面；階段一用 MockChatService，階段二換成 SupabaseChatService。

export type ChatListener = (event: ChatEvent) => void;

/** 只有示範模式才有的開關，用來測試斷線和傳送失敗的畫面 */
export interface DemoControls {
  setOffline(offline: boolean): void;
  setFailNext(fail: boolean): void;
}

export interface ChatService {
  /** 示範模式時是 DemoControls，正式模式時是 null */
  readonly demo: DemoControls | null;

  /** 開始連線。完成後會發出 connection_changed 和 members_synced（用來在代號畫面顯示人數） */
  connect(): Promise<void>;

  /** 這個分頁之前用過的代號（重新整理後直接回到聊天室用）。沒有的話是 null */
  storedNickname(): string | null;

  /** 用這個代號進入聊天室。失敗時丟出 ChatError：NICKNAME_TAKEN、NICKNAME_INVALID、OFFLINE */
  join(nickname: string): Promise<Member>;

  /** 用這個分頁原本的身分和代號回到聊天室。失敗時丟出 NICKNAME_TAKEN_WHILE_AWAY */
  resume(): Promise<Member | null>;

  /** 主動離開，這個分頁的身分作廢 */
  leave(): Promise<void>;

  /** 送出訊息。失敗時丟出 ChatError */
  sendMessage(message: OutgoingMessage, onProgress?: (fraction: number) => void): Promise<void>;

  /** 編輯自己的訊息（只能改文字） */
  editMessage(id: string, text: string): Promise<void>;

  /** 收回自己的訊息 */
  retractMessage(id: string): Promise<void>;

  /** 加上或取消表情回應 */
  toggleReaction(messageId: string, emoji: string): Promise<void>;

  /** 把圖片的儲存位置換算成可以顯示的網址 */
  imageUrl(image: ImageRef): string;

  subscribe(listener: ChatListener): () => void;
}
