import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 建立 Supabase 連線（docs/architecture.md 第 3.2、8.3 節）
// - 網址和公開金鑰從環境變數讀取（本機是 .env.local，部署時是 GitHub 的 Actions Variables）
// - 匿名身分存在 sessionStorage：同一個分頁重新整理還是同一個人，關掉分頁就作廢

export function hasSupabaseConfig(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
}

export function createSupabase(): SupabaseClient {
  return createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storage: window.sessionStorage,
      storageKey: 'leiiii.auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
