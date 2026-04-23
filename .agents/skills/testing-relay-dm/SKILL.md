# Testing Relay — DM read receipts + friend-request RPC

Generic recipe for testing anything in Relay that's scoped to DMs (read-receipt UI, Delivered/Seen labels, friend-request RPC, blocking, etc.) against the live deployment. Extend this file for new DM-scoped features; don't create a new skill per fix.

## Where the app runs

- **Production URL:** `https://relay.com.de/` (GitHub Pages, configured via repo `CNAME`).
- **Entry points:** `/` (marketing), `/auth.html` (sign in / sign up), `/app.html` (the actual app).
- **Asset pipeline:** `index.html` / `app.html` load `assets/{js,css}/app.min.{js,css}`. After any source change under `assets/js/app.js` or `assets/css/app.css` you MUST rebuild the minified assets (terser + cleancss) and commit them — otherwise GH Pages will serve the old behavior.
- **Supabase project:** `tkarylpzztjwgrphbwun.supabase.co`. Anon key is embedded in `assets/js/app.js` (search for `SUPABASE_ANON_KEY`) — you can reuse it for REST probes.

## Devin secrets needed

None strictly required — the Supabase anon key is embedded in the client bundle and that's enough for every REST probe described here. If you need to write to the DB beyond what authenticated users can do, ask the user for a `SUPABASE_SERVICE_ROLE_KEY` (and be aware that the Supabase SQL pooler is unreachable from Devin's sandbox — see "SQL migrations" below).

## Setting up test users

Prefer two long-lived test accounts created via `auth/v1/signup` with `+suffix@example.com` addresses (Supabase auto-confirms them on this project):

```
curl -X POST "$URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"devin-friend-a+NNN@example.com","password":"TestPass123Aaa"}'
```

After signup you also need a **profile** row (the app's onboarding flow writes one). The simplest way is to log in through `/auth.html` once per user and complete onboarding manually (pick a username). Save the username — you'll need it because the profile lookup is username-based, not email-based.

Useful session-level credentials shape:
- `devin-friend-a+NNN@example.com` / `TestPass123Aaa` → User A (tester / sender)
- `devin-friend-b+NNN@example.com` / `TestPass123Aaa` → User B (peer / receiver)

## Sign-in flow

`/auth.html` is `Sign In` / `Sign Up` tabs + email + password + two checkboxes ("Remember me", "I agree to Terms"). The second checkbox is required to enable the submit button. After sign-in the SPA redirects to `/app.html`.

## Test-data seeding (no UI for the peer)

You rarely want to run two browsers side-by-side. Instead, do User A through the UI and simulate User B via the Supabase REST API with B's access token:

```
TOKEN_B=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"…B…","password":"…"}' | jq -r .access_token)
```

Then:
- **Post a public message as B** (so A can click B's username in public chat):
  `POST /rest/v1/messages` with `{user_id, username, content}`.
- **Find B's username:** `GET /rest/v1/profiles?user_id=eq.<uuid>&select=*` (columns: `username`, `avatar_url`, `banner_color`, `bio`; note: no `display_name` column).
- **Mark a DM as read (flip Delivered → Seen):** `PATCH /rest/v1/dm_messages?id=eq.<id>` with `{"read_at":"<iso>"}` using B's token. This triggers the Realtime UPDATE that A's client listens to.
- **Friend-request state lookup:** `GET /rest/v1/friend_requests?or=(and(sender_id.eq.A,receiver_id.eq.B),and(sender_id.eq.B,receiver_id.eq.A))`. RLS blocks deletes from either side; don't rely on being able to reset this row.

## Key schema notes

- `dm_rooms(id, user_one, user_two, is_request, requester_id)` — the thread container.
- `dm_messages(id, room_id, sender_id, content, read_at, …)` — **no `receiver_id` column**; receiver is derived from `dm_rooms.user_one / user_two`.
- `friend_requests(id, sender_id, receiver_id, status, created_at)` — status is `pending`/`accepted`/`rejected`. RLS blocks direct deletes.
- `messages(id, user_id, username, avatar_url, content, …)` — public chat.

## DM read-receipt DOM (for assertions)

The DM renderer wraps read-receipt UI in a single meta element:

```
.bubble
  .msg-text                              ← message text
  .dm-bubble-meta[data-state=sent|seen]  ← flex row, right-justified, last child
    .dm-read-receipt[data-state=sent|seen]
      svg.tick-1   svg.tick-2            ← 2nd tick hidden when state=sent
    .dm-status-text                      ← "Delivered" or "Seen"
```

Assertions that are worth making:
- `getComputedStyle(meta).display === 'flex'`
- `getComputedStyle(meta).justifyContent === 'flex-end'`
- On state=seen: `getComputedStyle(meta).color` becomes the accent blue (`rgb(10,132,255)` on the iOS theme, or `#7ecbff` on other themes — match by "not muted" rather than exact hex).
- `status.textContent` is exactly `"Delivered"` or `"Seen"`.
- **Scope:** no `.dm-bubble-meta` element should ever appear inside a public-chat or group-chat bubble. Public-chat bubbles are built by `buildChatRow()`, DM bubbles by `buildDmRow()`.

The client exposes the Supabase library (`window.supabase`) but NOT the authenticated client (`sb` is closure-scoped in `app.js`). So drive the app through the UI and use REST for background writes.

## Friend-request RPC

`public.send_friend_request(p_receiver uuid)` — `SECURITY DEFINER`, granted to `authenticated`. Returns void on happy path, raises `unique_violation` (23505) on pending duplicate, reuses rejected rows, and auto-accepts counter-requests.

The "operator does not exist: text = uuid" error is triggered if any equality compares a `text`-typed column against a `uuid` local. The defensive fix is to declare every local as `uuid` and cast both operands with `::uuid` on every equality; the repo's `db/RELAY_FRIEND_REQUEST_FIX.sql` has the reference implementation.

### Testing it without polluting real users

- If A↔B already have a pending row, the "Add Friend" button on B's profile renders as a disabled **"Friend Request Pending"** pill. That alone is strong evidence the RPC returned cleanly previously. Don't try to delete the row — RLS blocks it from both sides.
- To get a clean "click Add Friend" test, need a third user whose email has been confirmed and has an onboarded profile. Spinning one up costs an onboarding round-trip through the UI; bias toward using the disabled-pending state as proof unless the fix is specifically about the click path.

## SQL migrations

**Do NOT try to apply SQL migrations from the Devin sandbox.**
- Direct Postgres host is IPv6-only and unreachable.
- Every Supabase pooler region responds `FATAL: Tenant or user not found` for this project.

Migrations under `db/*.sql` must be applied manually via the Supabase SQL Editor (project `tkarylpzztjwgrphbwun`). Always call this out in the PR description so the user knows they still need to run it.

## Recording tips

- Maximize Chrome before `record_start` — on this VM use `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` (install via `sudo apt-get install -y wmctrl` if missing; `Super+Up` tiles to half-screen only).
- Annotate with `type="setup"` before signing in, `test_start` per assertion, `assertion` with `test_result="passed"|"failed"|"untested"`.
- Mark group-chat regression as `untested` if the test user has no groups — don't block the run on it.

## Clean-up

Remind the user to delete (or tell them it's safe to leave):
- The public test message from User B.
- The DM thread A↔B and its messages.
- The `friend_requests` A→B row (if any).
