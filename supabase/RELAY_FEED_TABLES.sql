-- =====================================================================
-- Relay — Threads-Style Feed Tables
-- =====================================================================
-- Replaces the public chat (messages table) with a social feed system.
-- Run this in your Supabase SQL Editor to create the new tables.
--
-- Tables created:
--   feed_posts      — main posts (text + optional image)
--   post_likes      — like toggles
--   post_favorites  — favorite/bookmark toggles
--   post_comments   — threaded comments (depth limit enforced in app)
--   post_reposts    — repost/share with attribution
--
-- All tables have RLS enabled with appropriate policies.
-- =====================================================================

-- 1. feed_posts
create table if not exists public.feed_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  username   text not null,
  avatar_url text,
  content    text not null default '',
  image_url  text,
  parent_id  uuid references public.feed_posts(id) on delete cascade,
  depth      smallint not null default 0,
  like_count   int not null default 0,
  fav_count    int not null default 0,
  comment_count int not null default 0,
  repost_count  int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.feed_posts enable row level security;

create policy "Anyone can read posts"
  on public.feed_posts for select
  using (true);

create policy "Authenticated users can insert own posts"
  on public.feed_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own posts"
  on public.feed_posts for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists idx_feed_posts_created on public.feed_posts (created_at desc);
create index if not exists idx_feed_posts_parent on public.feed_posts (parent_id) where parent_id is not null;

-- 2. post_likes
create table if not exists public.post_likes (
  id      uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

alter table public.post_likes enable row level security;

create policy "Anyone can read likes"
  on public.post_likes for select
  using (true);

create policy "Authenticated users can insert own likes"
  on public.post_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own likes"
  on public.post_likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- 3. post_favorites
create table if not exists public.post_favorites (
  id      uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

alter table public.post_favorites enable row level security;

create policy "Users can read own favorites"
  on public.post_favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can insert own favorites"
  on public.post_favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on public.post_favorites for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4. post_reposts
create table if not exists public.post_reposts (
  id             uuid primary key default gen_random_uuid(),
  original_post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  username       text not null,
  avatar_url     text,
  created_at     timestamptz not null default now(),
  unique(original_post_id, user_id)
);

alter table public.post_reposts enable row level security;

create policy "Anyone can read reposts"
  on public.post_reposts for select
  using (true);

create policy "Authenticated users can insert own reposts"
  on public.post_reposts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own reposts"
  on public.post_reposts for delete
  to authenticated
  using (auth.uid() = user_id);

-- =====================================================================
-- RPC: toggle_like
-- Atomically toggle a like and update the cached count.
-- =====================================================================
create or replace function public.toggle_like(p_post_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_existing uuid;
  v_liked boolean;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_existing
    from public.post_likes
   where post_id = p_post_id and user_id = v_caller
   limit 1;

  if v_existing is not null then
    delete from public.post_likes where id = v_existing;
    update public.feed_posts set like_count = greatest(like_count - 1, 0) where id = p_post_id;
    v_liked := false;
  else
    insert into public.post_likes (post_id, user_id) values (p_post_id, v_caller);
    update public.feed_posts set like_count = like_count + 1 where id = p_post_id;
    v_liked := true;
  end if;

  return json_build_object('liked', v_liked);
end;
$$;

revoke all on function public.toggle_like(uuid) from public;
grant execute on function public.toggle_like(uuid) to authenticated;

-- =====================================================================
-- RPC: toggle_favorite
-- =====================================================================
create or replace function public.toggle_favorite(p_post_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_existing uuid;
  v_faved boolean;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_existing
    from public.post_favorites
   where post_id = p_post_id and user_id = v_caller
   limit 1;

  if v_existing is not null then
    delete from public.post_favorites where id = v_existing;
    update public.feed_posts set fav_count = greatest(fav_count - 1, 0) where id = p_post_id;
    v_faved := false;
  else
    insert into public.post_favorites (post_id, user_id) values (p_post_id, v_caller);
    update public.feed_posts set fav_count = fav_count + 1 where id = p_post_id;
    v_faved := true;
  end if;

  return json_build_object('favorited', v_faved);
end;
$$;

revoke all on function public.toggle_favorite(uuid) from public;
grant execute on function public.toggle_favorite(uuid) to authenticated;

-- =====================================================================
-- RPC: toggle_repost
-- =====================================================================
create or replace function public.toggle_repost(p_post_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_existing uuid;
  v_reposted boolean;
  v_username text;
  v_avatar text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_existing
    from public.post_reposts
   where original_post_id = p_post_id and user_id = v_caller
   limit 1;

  if v_existing is not null then
    delete from public.post_reposts where id = v_existing;
    update public.feed_posts set repost_count = greatest(repost_count - 1, 0) where id = p_post_id;
    v_reposted := false;
  else
    select username, avatar_url into v_username, v_avatar
      from public.profiles where user_id = v_caller limit 1;
    insert into public.post_reposts (original_post_id, user_id, username, avatar_url)
      values (p_post_id, v_caller, coalesce(v_username, 'User'), v_avatar);
    update public.feed_posts set repost_count = repost_count + 1 where id = p_post_id;
    v_reposted := true;
  end if;

  return json_build_object('reposted', v_reposted);
end;
$$;

revoke all on function public.toggle_repost(uuid) from public;
grant execute on function public.toggle_repost(uuid) to authenticated;

-- =====================================================================
-- RPC: add_comment
-- Insert a comment (reply) to a post with depth enforcement.
-- =====================================================================
create or replace function public.add_comment(
  p_parent_id uuid,
  p_content text,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_username text;
  v_avatar text;
  v_parent_depth smallint;
  v_new_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_content is null or length(trim(p_content)) = 0 then
    raise exception 'comment cannot be empty' using errcode = '22023';
  end if;

  select depth into v_parent_depth from public.feed_posts where id = p_parent_id;
  if v_parent_depth is null then
    raise exception 'parent post not found' using errcode = 'P0002';
  end if;
  if v_parent_depth >= 2 then
    raise exception 'maximum reply depth reached' using errcode = '22023';
  end if;

  select username, avatar_url into v_username, v_avatar
    from public.profiles where user_id = v_caller limit 1;

  insert into public.feed_posts (user_id, username, avatar_url, content, image_url, parent_id, depth)
    values (v_caller, coalesce(v_username, 'User'), v_avatar, trim(p_content), p_image_url, p_parent_id, v_parent_depth + 1)
    returning id into v_new_id;

  -- Increment comment count on the root-level ancestor
  -- (walk up to depth=0 for accurate counting on the top-level post)
  if v_parent_depth = 0 then
    update public.feed_posts set comment_count = comment_count + 1 where id = p_parent_id;
  else
    -- parent is depth 1 → its parent_id is the root
    update public.feed_posts set comment_count = comment_count + 1
     where id = (select parent_id from public.feed_posts where id = p_parent_id);
  end if;

  return v_new_id;
end;
$$;

revoke all on function public.add_comment(uuid, text, text) from public;
grant execute on function public.add_comment(uuid, text, text) to authenticated;

-- =====================================================================
-- Enable Realtime on feed_posts for live updates
-- =====================================================================
alter publication supabase_realtime add table public.feed_posts;
alter publication supabase_realtime add table public.post_likes;
alter publication supabase_realtime add table public.post_reposts;
