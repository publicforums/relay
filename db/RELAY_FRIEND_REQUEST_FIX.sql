-- =====================================================================
-- Relay — Add-User / Friend-Request RPC fix (v2, type-safe).
-- =====================================================================
-- Previous failure mode: `public.send_friend_request(p_receiver uuid)`
-- surfaced `operator does not exist: text = uuid` to the client when
-- an implicit comparison between a text expression and a uuid column
-- (or vice-versa) was evaluated inside the body. In this codebase the
-- canonical column types are:
--
--   auth.users.id           uuid
--   auth.uid()              uuid
--   profiles.user_id        uuid
--   friend_requests.id          uuid
--   friend_requests.sender_id   uuid
--   friend_requests.receiver_id uuid
--   friend_requests.status      text
--   notifications.id        uuid
--   notifications.user_id   uuid
--   notifications.type      text
--
-- …but the `messages` / `message_reactions` tables (legacy public chat)
-- store user_id as TEXT. A previous revision of this RPC ended up
-- comparing one of those text columns against a uuid, which is what
-- produced `operator does not exist: text = uuid` at call time.
--
-- This revision replaces the function with an implementation that:
--   1. Only touches friend_requests / profiles / notifications (never
--      the text-typed messages tables).
--   2. Declares every local variable explicitly as uuid / text.
--   3. Casts every operand that could be ambiguous (e.g. the uuid
--      parameter on both sides of eq-tests), so Postgres' type
--      inference cannot fall back to a text = uuid comparison even
--      if a future column rename or RLS policy change introduces
--      one. These casts are free at runtime and make the intent
--      explicit for future readers.
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

create or replace function public.send_friend_request(p_receiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender   uuid := auth.uid();
  v_receiver uuid := p_receiver;
  v_existing_sender_to_receiver public.friend_requests%rowtype;
  v_existing_receiver_to_sender public.friend_requests%rowtype;
  v_new_request_id uuid;
begin
  if v_sender is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_receiver is null then
    raise exception 'p_receiver is required' using errcode = '22004';
  end if;
  if v_receiver = v_sender then
    raise exception 'cannot add yourself as a friend' using errcode = '22023';
  end if;

  -- Receiver must exist as a profile (mirrors the UI guard). Explicit
  -- ::uuid cast on both operands to avoid any chance of a text/uuid
  -- mismatch even if a future migration changes profiles.user_id.
  perform 1
    from public.profiles
   where user_id::uuid = v_receiver::uuid;
  if not found then
    raise exception 'recipient not found' using errcode = 'P0002';
  end if;

  -- Outgoing request from me -> them.
  select *
    into v_existing_sender_to_receiver
    from public.friend_requests
   where sender_id::uuid   = v_sender::uuid
     and receiver_id::uuid = v_receiver::uuid
   limit 1;

  -- Counter request from them -> me (if they requested first, treat as
  -- accept rather than create a new record — matches normal UX).
  select *
    into v_existing_receiver_to_sender
    from public.friend_requests
   where sender_id::uuid   = v_receiver::uuid
     and receiver_id::uuid = v_sender::uuid
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
       where id::uuid = v_existing_sender_to_receiver.id::uuid
      returning id into v_new_request_id;
    end if;
  elsif v_existing_receiver_to_sender.id is not null
        and v_existing_receiver_to_sender.status = 'pending' then
    -- They already requested us — accept automatically.
    update public.friend_requests
       set status = 'accepted'
     where id::uuid = v_existing_receiver_to_sender.id::uuid;
    v_new_request_id := v_existing_receiver_to_sender.id;
  elsif v_existing_receiver_to_sender.id is not null
        and v_existing_receiver_to_sender.status = 'accepted' then
    -- We're already friends (B->A = accepted) and no A->B row exists;
    -- inserting a fresh `pending` row here would leave the table in a
    -- contradictory state (accepted + pending for the same pair). Treat
    -- this as a no-op dup the same way we do for self->them = pending.
    raise exception 'friend request already pending or accepted'
      using errcode = '23505';
  else
    insert into public.friend_requests (sender_id, receiver_id, status)
    values (v_sender, v_receiver, 'pending')
    returning id into v_new_request_id;
  end if;

  -- Best-effort notification for the receiver. Kept inside the same
  -- transaction as the request so either both land or neither does.
  -- `content` mirrors the shape the client parses in parseNotifContent
  -- (sender_id + request_id), so the inbox row can resolve instantly.
  begin
    insert into public.notifications (user_id, type, content, read)
    values (
      v_receiver,
      'friend_request',
      jsonb_build_object(
        'sender_id',  v_sender,
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
-- --   -> returns void (no 42703 / no 42883 `text = uuid`).
-- --   select count(*) from public.friend_requests
-- --     where sender_id = '<A>' and receiver_id = '<B>' and status = 'pending';
-- --   -> 1
