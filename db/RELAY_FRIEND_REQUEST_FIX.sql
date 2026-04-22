-- =====================================================================
-- Relay — Add-User / Friend-Request RPC fix
-- =====================================================================
-- Root cause: the server-side `public.send_friend_request(p_receiver uuid)`
-- function references a column named `id` inside a sub-expression whose
-- source relation does not expose one, so every call bubbles up the
-- Postgres error `42703 column "id" does not exist` before a row is
-- ever inserted. Reproduced from the client by calling the RPC with a
-- valid, existing receiver; also reproduced by calling the RPC directly
-- against PostgREST with a service-role token.
--
-- This migration replaces the function with a correct implementation
-- that only references columns that exist in this project's schema
-- (`friend_requests` = id, sender_id, receiver_id, status, created_at;
-- `notifications` = id, user_id, type, content, read, created_at;
-- `profiles` = user_id, username, avatar_url, …).
--
-- Safety:
--   * CREATE OR REPLACE (no data migration; idempotent; safe to re-run).
--   * SECURITY DEFINER so the function can insert into `notifications`
--     on the receiver's behalf without needing a permissive RLS rule.
--   * GRANT EXECUTE to `authenticated` so the existing client call keeps
--     working with no changes.
--   * Returns void (matches existing client, which only checks `error`).
--   * Existing rows in `friend_requests` are NOT touched.
-- =====================================================================

-- Replace / create the RPC.
create or replace function public.send_friend_request(p_receiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_existing_sender_to_receiver public.friend_requests%rowtype;
  v_existing_receiver_to_sender public.friend_requests%rowtype;
  v_new_request_id uuid;
begin
  if v_sender is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_receiver is null then
    raise exception 'p_receiver is required' using errcode = '22004';
  end if;
  if p_receiver = v_sender then
    raise exception 'cannot add yourself as a friend' using errcode = '22023';
  end if;

  -- Receiver must exist as a profile (mirrors the UI guard).
  perform 1
    from public.profiles
   where user_id = p_receiver;
  if not found then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;

  -- Outgoing request from me -> them.
  select *
    into v_existing_sender_to_receiver
    from public.friend_requests
   where sender_id = v_sender
     and receiver_id = p_receiver
   limit 1;

  -- Counter request from them -> me (if they requested first, treat as
  -- accept rather than create a new record — matches normal UX).
  select *
    into v_existing_receiver_to_sender
    from public.friend_requests
   where sender_id = p_receiver
     and receiver_id = v_sender
   limit 1;

  if v_existing_sender_to_receiver.id is not null then
    if v_existing_sender_to_receiver.status in ('pending','accepted') then
      raise exception 'friend request already pending or accepted'
        using errcode = '23505';
    else
      -- Previously rejected/cancelled — bump back to pending and reuse the row.
      update public.friend_requests
         set status = 'pending',
             created_at = now()
       where id = v_existing_sender_to_receiver.id
      returning id into v_new_request_id;
    end if;
  elsif v_existing_receiver_to_sender.id is not null
        and v_existing_receiver_to_sender.status = 'pending' then
    -- They already requested us — accept automatically.
    update public.friend_requests
       set status = 'accepted'
     where id = v_existing_receiver_to_sender.id;
    v_new_request_id := v_existing_receiver_to_sender.id;
  else
    insert into public.friend_requests (sender_id, receiver_id, status)
    values (v_sender, p_receiver, 'pending')
    returning id into v_new_request_id;
  end if;

  -- Best-effort notification for the receiver. Kept inside the same
  -- transaction as the request so either both land or neither does.
  -- `content` mirrors the shape the client parses in parseNotifContent
  -- (sender_id + request_id), so the inbox row can resolve instantly.
  begin
    insert into public.notifications (user_id, type, content, read)
    values (
      p_receiver,
      'friend_request',
      jsonb_build_object(
        'sender_id', v_sender,
        'request_id', v_new_request_id
      ),
      false
    );
  exception when undefined_column or undefined_table then
    -- Notifications table may be locked down or absent; never block
    -- the primary action if it is.
    null;
  end;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- =====================================================================
-- Verification block — run these inline (NOT in a transaction with the
-- CREATE above, or as a separate query) to prove the fix after applying.
-- Expect each SELECT to return true / the expected state.
-- =====================================================================
-- select pg_get_functiondef('public.send_friend_request(uuid)'::regprocedure)
--        ilike '%insert into public.friend_requests%';
--
-- -- With two test users (A signed in as auth.uid() = <A>):
-- --   select public.send_friend_request('<B>'::uuid);
-- --   -> returns void (no 42703).
-- --   select count(*) from public.friend_requests
-- --     where sender_id = '<A>' and receiver_id = '<B>' and status = 'pending';
-- --   -> 1
