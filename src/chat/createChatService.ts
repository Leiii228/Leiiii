import type { ChatService } from './ChatService';
import { MockChatService } from './mock/MockChatService';
import { hasSupabaseConfig } from './supabase/client';
import { SupabaseChatService } from './supabase/SupabaseChatService';

/**
 * 依照設定決定用假的還是真的伺服器。
 * - 網址加上 ?mock=1：一定用示範模式
 * - 有 Supabase 的網址和公開金鑰：連到 Supabase
 * - 其他情況：示範模式
 */
export function createChatService(): ChatService {
  const forceMock = new URLSearchParams(window.location.search).has('mock');
  if (hasSupabaseConfig() && !forceMock) return new SupabaseChatService();
  return new MockChatService();
}
