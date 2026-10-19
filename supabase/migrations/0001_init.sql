-- ============================================================
-- 0001_init.sql：聊天室的資料表、權限規則、速度限制、即時通知、圖片空間
-- 用法：Supabase 網頁 → SQL Editor → New query → 整段貼上 → Run
-- 這個檔案可以重複執行，不會重複建立東西。
-- 規則來源：docs/architecture.md 第 5.4、8.1、9.1 節
-- ============================================================

create schema if not exists private;

-- ── 資料表：訊息 ─────────────────────────────────────────────
create table if not exists public.messages (
  id           uuid primary key,                      -- 由前端產生
  user_id      uuid not null references auth.users (id) on delete cascade,
  nickname     text not null,
  body         text not null default '',
  images       jsonb not null default '[]'::jsonb,    -- [{ path, width, height }]
  created_at   timestamptz not null default now(),    -- 一律由伺服器決定
  edited_at    timestamptz,
  retracted_at timestamptz,
  constraint messages_nickname_len check (char_length(btrim(nickname)) between 1 and 20),
  constraint messages_nickname_visible check (nickname !~ '[[:cntrl:]]'),
  constraint messages_body_len check (char_length(body) <= 20000),
  constraint messages_images_array check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 9),
  constraint messages_not_empty check (
    retracted_at is not null or char_length(btrim(body)) > 0 or jsonb_array_length(images) > 0
  )
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_user_recent_idx on public.messages (user_id, created_at desc);

-- ── 資料表：表情回應 ─────────────────────────────────────────
create table if not exists public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  nickname   text not null,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),            -- 同一人、同一則、同一個表情只能一次
  constraint reactions_nickname_len check (char_length(btrim(nickname)) between 1 and 20),
  constraint reactions_emoji_len check (char_length(emoji) between 1 and 16)
);

create index if not exists reactions_user_recent_idx on public.reactions (user_id, created_at desc);

-- ── 檢查圖片位置：只能指向「作者自己的資料夾/這則訊息/第幾張」 ──
create or replace function private.valid_images(imgs jsonb, uid uuid, mid uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(
    jsonb_typeof(e) = 'object'
    and (e ->> 'path') ~ ('^' || uid::text || '/' || mid::text || '/[0-8]\.(webp|jpg|png|gif)$')
    and jsonb_typeof(e -> 'width') = 'number'
    and jsonb_typeof(e -> 'height') = 'number'
    and (e ->> 'width')::numeric between 1 and 10000
    and (e ->> 'height')::numeric between 1 and 10000
  ), true)
  from jsonb_array_elements(imgs) as e
$$;

-- ── 新增訊息前：時間由伺服器決定、檢查圖片、10 秒最多 5 則 ──
create or replace function private.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent int;
begin
  new.created_at := now();
  new.edited_at := null;
  new.retracted_at := null;
  new.nickname := btrim(new.nickname);

  if not private.valid_images(new.images, new.user_id, new.id) then
    raise exception 'INVALID_IMAGES' using errcode = 'P0001';
  end if;

  select count(*) into recent
  from public.messages
  where user_id = new.user_id
    and created_at > now() - interval '10 seconds';
  if recent >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── 修改訊息前：只能改文字或收回，不能改作者、代號、時間、圖片 ──
create or replace function private.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.retracted_at is not null then
    raise exception 'ALREADY_RETRACTED' using errcode = 'P0001';
  end if;

  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.nickname <> old.nickname
     or new.created_at <> old.created_at then
    raise exception 'IMMUTABLE_FIELDS' using errcode = 'P0001';
  end if;

  if new.retracted_at is not null then
    -- 收回：清空文字和圖片
    new.retracted_at := now();
    new.body := '';
    new.images := '[]'::jsonb;
    new.edited_at := old.edited_at;
  else
    if new.images <> old.images then
      raise exception 'IMMUTABLE_FIELDS' using errcode = 'P0001';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;

  return new;
end;
$$;

-- ── 新增表情前：時間由伺服器決定、10 秒最多 20 次 ──────────────
create or replace function private.reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent int;
begin
  new.created_at := now();
  new.nickname := btrim(new.nickname);

  select count(*) into recent
  from public.reactions
  where user_id = new.user_id
    and created_at > now() - interval '10 seconds';
  if recent >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

drop trigger if exists messages_before_update on public.messages;
create trigger messages_before_update
  before update on public.messages
  for each row execute function private.messages_before_update();

drop trigger if exists reactions_before_insert on public.reactions;
create trigger reactions_before_insert
  before insert on public.reactions
  for each row execute function private.reactions_before_insert();

-- ── 權限：只有「已經取得匿名身分」的人能用，而且只能動自己的東西 ──
revoke all on public.messages from anon, authenticated;
revoke all on public.reactions from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (body, retracted_at) on public.messages to authenticated;  -- 只能改這兩欄
grant select, insert, delete on public.reactions to authenticated;

alter table public.messages enable row level security;
alter table public.reactions enable row level security;

drop policy if exists "讀取 24 小時內的訊息" on public.messages;
create policy "讀取 24 小時內的訊息" on public.messages
  for select to authenticated
  using (created_at > now() - interval '24 hours');

drop policy if exists "只能用自己的身分發訊息" on public.messages;
create policy "只能用自己的身分發訊息" on public.messages
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "只能修改自己的訊息" on public.messages;
create policy "只能修改自己的訊息" on public.messages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- 沒有 delete 的規則 → 任何人都不能刪訊息（只有清理程式可以）

drop policy if exists "讀取表情回應" on public.reactions;
create policy "讀取表情回應" on public.reactions
  for select to authenticated
  using (true);

drop policy if exists "只能用自己的身分按表情" on public.reactions;
create policy "只能用自己的身分按表情" on public.reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.retracted_at is null
    )
  );

drop policy if exists "只能取消自己的表情" on public.reactions;
create policy "只能取消自己的表情" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── 即時通知：訊息和表情有變動時，推給所有連著的人 ─────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;
end;
$$;

-- ── 圖片空間：單檔最大 5 MB，只收 WebP／JPEG／PNG／GIF（不收 SVG） ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 5242880,
        array['image/webp', 'image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat-images：只能上傳到自己的資料夾" on storage.objects;
create policy "chat-images：只能上傳到自己的資料夾" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "chat-images：可以看自己資料夾的檔案" on storage.objects;
create policy "chat-images：可以看自己資料夾的檔案" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "chat-images：只能刪自己資料夾的檔案" on storage.objects;
create policy "chat-images：只能刪自己資料夾的檔案" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
