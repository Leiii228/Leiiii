// 清理程式（Supabase Edge Function：cleanup）
// 每小時由排程（0002_schedule.sql）呼叫一次：
//   1. 刪掉 24 小時前上傳的圖片
//   2. 刪掉 24 小時前的訊息（表情回應會跟著一起刪除）
//   3. 刪掉建立超過 7 天的匿名身分
// 呼叫時必須帶上 x-cleanup-secret，內容要和資料庫 Vault 裡的 cleanup_secret 一樣，否則拒絕。
// 部署方式：Supabase 網頁 → Edge Functions → Deploy a new function → Via Editor，
// 名稱填 cleanup，整段貼上這個檔案，部署後把 JWT 驗證關掉。

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'chat-images';

/** Supabase 會自動提供伺服器金鑰給 Edge Function，不需要手動設定（新舊版名稱不同，都試試看） */
function serverKey(): string {
  const single = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (single) return single;
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string> | string[];
      const first = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
      if (first) return first;
    } catch {
      if (keys.startsWith('sb_secret_')) return keys;
    }
  }
  // 只列出設定的「名稱」方便除錯，不會列出任何值
  const names = Object.keys(Deno.env.toObject()).filter((n) => n.startsWith('SUPABASE_'));
  throw new Error(`找不到伺服器金鑰，可用的設定名稱：${names.join(', ')}`);
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    return Response.json({ error: message }, { status: 500 });
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 確認是我們自己的排程在呼叫
  const provided = req.headers.get('x-cleanup-secret') ?? '';
  const { data: allowed, error: authError } = await admin.rpc('cleanup_check_secret', { provided });
  if (authError || allowed !== true) return new Response('Forbidden', { status: 403 });

  const result = { images: 0, messages: 0, users: 0, errors: [] as string[] };

  // 1. 圖片：每次最多 100 個，最多 10 輪
  for (let round = 0; round < 10; round++) {
    const { data: paths, error } = await admin.rpc('cleanup_old_image_paths', { max_rows: 100 });
    if (error) {
      result.errors.push(`列出舊圖片失敗：${error.message}`);
      break;
    }
    if (!paths || paths.length === 0) break;
    const { error: removeError } = await admin.storage.from(BUCKET).remove(paths as string[]);
    if (removeError) {
      result.errors.push(`刪除圖片失敗：${removeError.message}`);
      break;
    }
    result.images += paths.length;
  }

  // 2. 訊息
  const { data: deleted, error: messageError } = await admin.rpc('cleanup_old_messages');
  if (messageError) result.errors.push(`刪除訊息失敗：${messageError.message}`);
  else result.messages = Number(deleted ?? 0);

  // 3. 匿名身分
  const { data: userIds, error: userListError } = await admin.rpc('cleanup_old_anonymous_users', { max_rows: 200 });
  if (userListError) {
    result.errors.push(`列出匿名身分失敗：${userListError.message}`);
  } else {
    for (const id of (userIds ?? []) as string[]) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) result.errors.push(`刪除匿名身分失敗：${error.message}`);
      else result.users += 1;
    }
  }

  console.log(JSON.stringify(result));
  return Response.json(result, { status: result.errors.length ? 500 : 200 });
}
