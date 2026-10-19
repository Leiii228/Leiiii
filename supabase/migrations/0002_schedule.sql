-- ============================================================
-- 0002_schedule.sql：每小時清理一次（24 小時前的訊息和圖片、7 天前的匿名身分）
-- 用法：先執行 0001_init.sql、部署好 cleanup 清理程式，
--      再到 Supabase 網頁 → SQL Editor → New query → 整段貼上 → Run
-- 這個檔案可以重複執行。
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── 清理用的密碼：由資料庫自己隨機產生，存在 Vault，沒有任何人看過 ──
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cleanup_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'cleanup_secret',
      '每小時清理程式用的密碼（由資料庫產生）'
    );
  end if;
end;
$$;

-- ── 給清理程式用的小工具（只有伺服器金鑰能呼叫，一般使用者不行） ──

-- 確認呼叫的人帶的密碼對不對
create or replace function public.cleanup_check_secret(provided text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cleanup_secret' and decrypted_secret = provided
  );
$$;

-- 列出 24 小時前上傳的圖片（包括上傳了但訊息沒送成功的）
create or replace function public.cleanup_old_image_paths(max_rows int)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select name from storage.objects
  where bucket_id = 'chat-images'
    and created_at < now() - interval '24 hours'
  order by created_at
  limit max_rows;
$$;

-- 刪掉 24 小時前的訊息，回傳刪了幾則（表情回應會跟著刪除）
create or replace function public.cleanup_old_messages()
returns bigint
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.messages
    where created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*) from deleted;
$$;

-- 列出建立超過 7 天的匿名身分
create or replace function public.cleanup_old_anonymous_users(max_rows int)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users
  where is_anonymous
    and created_at < now() - interval '7 days'
  order by created_at
  limit max_rows;
$$;

revoke execute on function public.cleanup_check_secret(text) from public, anon, authenticated;
revoke execute on function public.cleanup_old_image_paths(int) from public, anon, authenticated;
revoke execute on function public.cleanup_old_messages() from public, anon, authenticated;
revoke execute on function public.cleanup_old_anonymous_users(int) from public, anon, authenticated;
grant execute on function public.cleanup_check_secret(text) to service_role;
grant execute on function public.cleanup_old_image_paths(int) to service_role;
grant execute on function public.cleanup_old_messages() to service_role;
grant execute on function public.cleanup_old_anonymous_users(int) to service_role;

-- ── 排程：每小時的第 7 分鐘呼叫清理程式 ──────────────────────────
select cron.schedule(
  'leiiii-cleanup',
  '7 * * * *',
  $job$
  select net.http_post(
    url := 'https://chuiwkcwznetmifzyeba.supabase.co/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- 新版 Supabase 的入口要求每個呼叫都帶 apikey。執行前把下面換成你的 Publishable key
      -- （Project Settings → API Keys）。repo 裡不放金鑰的值，見 CLAUDE.md。
      'apikey', 'YOUR_PUBLISHABLE_KEY',
      'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
