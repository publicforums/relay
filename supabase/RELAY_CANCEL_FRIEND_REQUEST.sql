-- =====================================================================
-- Relay — Cancel outgoing friend request RPC
-- =====================================================================
-- The existing `respond_friend_request` RPC only allows the *receiver*
-- to accept/reject.  When the UI moved the cancel-request action into
-- the 3-dot menu, it needs an RPC the *sender* can call to cancel
-- their own outgoing pending request.
--
-- This function:
--   1. Checks auth.uid() matches the sender_id of the request.
--   2. Only allows cancellation of requests with status = 'pending'.
--   3. Deletes the row (so `send_friend_request` can cleanly re-insert
--      later if the user sends again).
--   4. Is SECURITY DEFINER to bypass RLS.
--   5. Returns void (matches existing client patterns).
-- =====================================================================

create or replace function public.cancel_friend_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.friend_requests%rowtype;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_request is null then
    raise exception 'p_request is required' using errcode = '22004';
  end if;

  select *
    into v_row
    from public.friend_requests
   where id::uuid = p_request::uuid
   limit 1;

  if v_row.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_row.sender_id::uuid <> v_caller::uuid then
    raise exception 'only the sender can cancel a request' using errcode = '42501';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'can only cancel pending requests' using errcode = '22023';
  end if;

  delete from public.friend_requests
   where id::uuid = p_request::uuid;
end;
$$;

revoke all on function public.cancel_friend_request(uuid) from public;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
