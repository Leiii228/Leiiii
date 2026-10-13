import type { ChatService } from './ChatService';
import { MockChatService } from './mock/MockChatService';

/**
 * 依照設定決定用假的還是真的伺服器。
 * - 網址加上 ?mock=1：一定用示範模式
 * - 有 Supabase 的網址和公開金鑰：階段二會在這裡改成回傳 SupabaseChatService
 * - 其他情況：示範模式
 */
export function createChatService(): ChatService {
  const forceMock = new URLSearchParams(window.location.search).has('mock');
  const hasSupabase = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  if (hasSupabase && !forceMock) {
    // 階段二：return new SupabaseChatService(...)
    console.warn('已設定 Supabase，但目前是階段一，仍然使用示範模式。');
  }

  return new MockChatService();
}
