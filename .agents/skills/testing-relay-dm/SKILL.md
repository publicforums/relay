---
name: testing-relay-dm
description: Test Relay features scoped to DMs, friend system, profile preview UI, Settings, and the Threads-style feed. Use when verifying friend-request flows, profile modal changes, read receipts, Settings overlay, or feed post/engagement features.
---

# Testing Relay — DM read receipts + friend-request RPC + Profile Preview + Settings + Feed

Generic recipe for testing anything in Relay that's scoped to DMs (read-receipt UI, Delivered/Seen labels, friend-request RPC, blocking, etc.), the profile preview modal (friend indicator, action buttons, overlay), the Settings overlay (Appearance, Opt Preferences), or the Threads-style feed (posts, engagement, comments, images) against the live deployment or a local server of the PR branch. Extend this file for new features; don't create a new skill per fix.

## Where the app runs

- **Production URL:** `https://relay.com.de/` (GitHub Pages, configured via repo `CNAME`).
- **Entry points:** `/` (marketing), `/auth.html` (sign in / sign up), `/app.html` (the actual app).
- **Asset pipeline:** `index.html` / `app.html` load `assets/{js,css}/app.min.{js,css}`. After any source change under `assets/js/app.js` or `assets/css/app.css` you MUST rebuild the minified assets (terser + cleancss) and commit them — otherwise GH Pages will serve the old behavior.
- **Testing a PR branch:** GH Pages only serves `main`, so for PR-branch testing run a local server with no-cache headers and open `http://localhost:8765/auth.html`. The Supabase backend is the same prod project — so all accounts and data are shared with production.
- **Browser caching:** This is a static site with no build step. Browser caching is aggressive. When testing locally, always use no-cache response headers (e.g. `Cache-Control: no-store`) or append `?v=xxx` query params. Clear Chrome cache if you suspect stale JS/CSS is being served.
- **Supabase project:** `tkarylpzztjwgrphbwun.supabase.co`. Anon key is embedded in `assets/js/app.js` (search for `SUPABASE_ANON_KEY`) — you can reuse it for REST probes.

## Devin secrets needed

- `SERVICE_ROLE` — Supabase service-role key (uppercase env var name). Needed for (1) admin-confirming emails on fresh signups, (2) patching `dm_messages.read_at` to simulate the peer opening a chat, (3) inserting/deleting `friend_requests` rows to set up friend states for testing, (4) any RLS-bypassing probe.
- No user-level secret needed — for normal user flows the embedded anon key is enough.

## Setting up test users

Create two accounts via `auth/v1/signup`. **Signups are NOT auto-confirmed on this project** — despite what older notes said. After signup you must either (a) click the confirmation email, or (b) flip `email_confirmed_at` with the admin API using the service role:

```
URL=${PROJECT_URL}; SRK=$SERVICE_ROLE
# 1. Signup (returns 200 even without confirmation)
curl -X POST "$URL/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"devin-foo+NNN@example.com","password":"TestPass123Aaa"}'

# 2. Look up the uid (admin API ignores `?filter=email=...`, so list and grep):
curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  "$URL/auth/v1/admin/users?per_page=200" | \
  jq -r '.users[] | select(.email|test("devin-foo\\+NNN")) | "\(.email)\t\(.id)"'

# 3. Confirm the email:
curl -X PUT -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  "$URL/auth/v1/admin/users/$UID" -d '{"email_confirm":true}'
```

After confirmation, sign in via `/auth.html` and complete the 7-step onboarding manually (profile photo, username, bio, pronouns, region, password — steps are all Skip-able EXCEPT the username step; you also have to re-enter the password on step 6 even though signup already created one — Finish then redirects to `/app.html`). The onboarding writes the `profiles` row.

Useful credential shape:
- `devin-X+NNN@example.com` / `TestPass123Aaa` — pick NNN to be a timestamp to avoid collisions with prior sessions

## Sign-in flow

`/auth.html` is `Sign In` / `Sign Up` tabs + email + password + two checkboxes ("Remember me", "I agree to Terms"). The second checkbox is required to enable the submit button. After sign-in the SPA redirects to `/app.html`.

If sign-in says "Please confirm your email", go back to the service-role admin confirm step above.

## Test-data seeding (no UI for the peer)

You rarely want to run two browsers side-by-side. Drive User A through the UI and simulate User B via REST with either B's access token OR the service_role key:

```
TOKEN_B=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"…B…","password":"…"}' | jq -r .access_token)
```

Then:
- **Post a public message as B** (so A can click B's username in public chat): `POST /rest/v1/messages` with `{user_id, username, content}`.
- **Find B's username:** `GET /rest/v1/profiles?user_id=eq.<uuid>&select=*` (columns: `username`, `avatar_url`, `banner_color`, `bio`; no `display_name` column).
- **Mark a DM as read (flip Delivered → Seen):** `PATCH /rest/v1/dm_messages?id=eq.<id>` with `{"read_at":"<iso>"}`. Easiest with the service-role key; triggers the Realtime UPDATE that A's client already subscribes to, so the UI flips without reload.
- **Friend-request state lookup:** `GET /rest/v1/friend_requests?or=(and(sender_id.eq.A,receiver_id.eq.B),and(sender_id.eq.B,receiver_id.eq.A))`.
- **Insert accepted friend request (for testing friend state):** `POST /rest/v1/friend_requests` with `{sender_id, receiver_id, status: "accepted"}` using SERVICE_ROLE.
- **Delete friend request (cleanup):** `DELETE /rest/v1/friend_requests?or=(and(sender_id.eq.A,receiver_id.eq.B),and(sender_id.eq.B,receiver_id.eq.A))` using SERVICE_ROLE.

## Profile preview modal testing

The profile modal opens when clicking a username in public chat. The modal has different UI based on friend state:

### Friend states and expected UI

| State | Indicator | Action buttons | 3-dot menu items |
|---|---|---|---|
| `none` | Hidden | Message only | Copy User ID, Copy Username, **Add Friend**, Report User |
| `outgoing_pending` | Hidden | Message only | Copy User ID, Copy Username, **Cancel Request** (red), Report User |
| `accepted` | Visible (person+checkmark) | Message, Voice Call, Video Call | Copy User ID, Copy Username, Report User |

### Friend indicator overlay (accepted state)

- The checkmark icon at top-left of banner is **clickable** (`cursor: pointer`)
- Clicking it opens a mini overlay popover with "Unadd Friend" in red text
- The overlay has fade-in animation and positioned at `top: 44px; left: 48px`
- Click outside overlay → closes it
- Click "Unadd Friend" → opens remove-friend confirmation dialog
- After removal, state returns to "none" (indicator hidden, "Add Friend" reappears in menu)

### Testing the full friend lifecycle

1. **State=none**: Click username → profile opens → verify no indicator, Add Friend in menu
2. **State=accepted**: Insert via API → close/reopen profile → verify indicator visible, overlay works
3. **State returned to none**: After removal → verify indicator gone, Add Friend back
4. **Layout check**: Verify X button, indicator, overlay, and 3-dot menu don't overlap

### Common pitfalls

- **Dangling JS references after HTML refactors**: When HTML elements are removed or renamed (e.g., moving a menu item to an overlay), check that ALL JavaScript references to the old element are also cleaned up. A missing `const foo = document.getElementById('foo')` line will result in `ReferenceError` that silently breaks the entire function. Always search for the old ID/variable name across all JS files.
- **Profile modal won't open silently**: If clicking a username does nothing (no error visible), it's likely an unhandled `ReferenceError` in `openProfileFor()`. Add a global `window.addEventListener('unhandledrejection', ...)` to catch it, or check the browser console.
- **Minified JS not rebuilt**: After editing `app.js`, you MUST run `npx terser assets/js/app.js -o assets/js/app.min.js --compress --mangle` and commit the result. The HTML loads `app.min.js`, so changes to `app.js` alone have no effect.

## Key schema notes

- `dm_rooms(id, user_one, user_two, is_request, requester_id)` — the thread container.
- `dm_messages(id, room_id, sender_id, content, read_at, …)` — **no `receiver_id` column**; receiver is derived from `dm_rooms.user_one / user_two`.
- `friend_requests(id, sender_id, receiver_id, status, created_at)` — status is `pending`/`accepted`/`rejected`. RLS blocks direct deletes from authenticated users; use SERVICE_ROLE for cleanup.
- `messages(id, user_id, username, avatar_url, content, …)` — public chat.

## DM read-receipt DOM (for assertions)

The DM renderer wraps read-receipt UI in a single meta element that lives INSIDE the bubble, bottom-right under the text:

```
.bubble
  .msg-text                              ← message text
  .dm-bubble-meta[data-state=sent|seen]  ← flex row, right-justified, last child
    .dm-read-receipt[data-state=sent|seen]
      svg.tick-1   svg.tick-2            ← 2nd tick hidden when state=sent
    .dm-status-text                      ← "Delivered" or "Seen"
```

Assertions worth making:
- `getComputedStyle(meta).display === 'flex'` and `justifyContent === 'flex-end'`.
- Sent/Delivered state: `.dm-bubble-meta` color is `color-mix(var(--accent) 78%, transparent)`. Read `getComputedStyle(meta).color` — browsers expose this as `color(srgb r g b / 0.78)` where `r,g,b` each ≈ component/255 of `--accent`. Assert "blue dominated" (`b > r + 40 AND b > 0.5`) rather than exact RGB, since `--accent` varies by theme.
- Seen state: `.dm-bubble-meta` color is `var(--accent)` exactly. On the iOS-light theme that's `rgb(40, 115, 206)`. On other themes it tracks the theme's primary. Match by "not muted" or by the literal `--accent` value pulled via `getComputedStyle(document.documentElement).getPropertyValue('--accent')`.
- `.dm-status-text.textContent` is exactly `"Delivered"` or `"Seen"`.
- **Own bubble background:** `.row.me .bubble` uses `var(--bubble-other)` (i.e. the same gray as incoming bubbles) and `color: var(--text)` — NOT the old `--bubble-me` blue. On iOS-light that's `rgb(233, 233, 235)` background, `rgb(11, 11, 15)` text.
- **Scope:** no `.dm-bubble-meta` should ever appear inside a public-chat or group-chat bubble. Public-chat bubbles are built by `buildChatRow()`, DM bubbles by `buildDmRow()`.

The client exposes the Supabase library (`window.supabase`) but NOT the authenticated client (`sb` is closure-scoped in `app.js`). So drive the app through the UI and use REST for background writes.

## Settings overlay (Appearance + Opt Preferences)

Open: header **More ⋮** → **Settings**. The overlay is a two-pane layout (left sidebar nav, right content panel) with sections switched via `.settings-nav-item[data-section]`.

DOM shape to assert against:
```
aside
  nav[aria-label="Settings sections"]
    button.settings-nav-item[data-section="appearance"].active
    button.settings-nav-item[data-section="opt-preferences"]
main
  div[data-section-panel="appearance"]           ← visible when appearance active
  div[data-section-panel="opt-preferences"][hidden] ← toggled via .hidden
```

Clicking a nav item toggles `.active` on the nav and flips the `hidden` attribute on the matching panel.

### Appearance

Preset cards are `[aria-label="Theme presets"] button`. Clicking one:
- Sets `.active` class on the clicked card.
- Updates `--accent` (and other theme vars) on `document.documentElement`.
- Persists `localStorage['relay-appearance']` = `{"theme": "<id>", "custom": null, "font": null, "fontSize": 15}`.

### Opt Preferences

Renders 5 iOS-style toggles under `.opt-list` → `.opt-item`. Each item has `.opt-item-title`, `.opt-item-desc`, and an `<input data-opt-pref="<key>">` inside `.opt-toggle`.

Expected keys in order: `update_emails`, `downtime_uptime`, `deals_discounts`, `news_letter`, `breach_alerts`. All default ON.

Persistence is **localStorage only** (no Supabase schema change). Key pattern: `relay-opt-preferences:<user_id>`. Shape: `{"update_emails":bool, "downtime_uptime":bool, "deals_discounts":bool, "news_letter":bool, "breach_alerts":bool}`. Each account has its own key per device — signing out + in as a different account starts from defaults.

To test persistence: flip toggles in UI, verify the localStorage JSON round-trips, then **Ctrl+Shift+R** hard reload, reopen Settings → Opt Preferences, verify the same toggles are still OFF. The UI reads from storage on panel open.

## Friend-request RPC

`public.send_friend_request(p_receiver uuid)` — `SECURITY DEFINER`, granted to `authenticated`. Returns void on happy path, raises `unique_violation` (23505) on pending duplicate, reuses rejected rows, and auto-accepts counter-requests.

The "operator does not exist: text = uuid" error is triggered if any equality compares a `text`-typed column against a `uuid` local. The defensive fix is to declare every local as `uuid` and cast both operands with `::uuid` on every equality; the repo's `supabase/RELAY_FRIEND_REQUEST_FIX.sql` has the reference implementation.

### Cancel friend request RPC

`public.cancel_friend_request(p_receiver uuid)` — `SECURITY DEFINER`, granted to `authenticated`. Deletes the pending friend request where the caller is the sender. Defined in `supabase/RELAY_CANCEL_FRIEND_REQUEST.sql`. Must be deployed to Supabase SQL Editor before the Cancel Request menu action will work.

### Testing it without polluting real users

- If A↔B already have a pending row, the "Add Friend" button on B's profile renders as a disabled **"Friend Request Pending"** pill. That alone is strong evidence the RPC returned cleanly previously. Don't try to delete the row — RLS blocks it from both sides.
- To get a clean "click Add Friend" test, need a third user whose email has been confirmed and has an onboarded profile. Spinning one up costs an onboarding round-trip through the UI; bias toward using the disabled-pending state as proof unless the fix is specifically about the click path.
- To reset friend state for testing, use SERVICE_ROLE to DELETE the friend_requests row directly (bypasses RLS).

## Message-request chats (A→B pre-friendship)

When A sends a DM to B and they aren't friends yet, the chat goes into a **message request** state — textarea placeholder reads "Message request sent" but messages DO still render normally and `.dm-bubble-meta` still flips Delivered → Seen when B opens it. This means you can fully exercise the bubble/tick styling without needing B to first accept a friend request — just use an unrelated test account pair and service_role the `read_at` flip.

## SQL migrations

**Do NOT try to apply SQL migrations from the Devin sandbox.**
- Direct Postgres host is IPv6-only and unreachable.
- Every Supabase pooler region responds `FATAL: Tenant or user not found` for this project.

Migrations under `supabase/*.sql` must be applied manually via the Supabase SQL Editor (project `tkarylpzztjwgrphbwun`). Always call this out in the PR description so the user knows they still need to run it.

## Local dev server with no-cache headers

When testing PR branches locally, use a Python server with no-cache headers to avoid stale content:

```python
# nocache_server.py
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate')
        self.send_header('Pragma','no-cache')
        self.send_header('Expires','0')
        super().end_headers()
http.server.HTTPServer(('',8765), functools.partial(H, directory='.')).serve_forever()
```

Run from repo root: `python3 nocache_server.py &`

## Recording tips

- Maximize Chrome before `record_start` — on this VM use `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz` (install via `sudo apt-get install -y wmctrl` if missing; `Super+Up` tiles to half-screen only).
- Annotate with `type="setup"` before signing in, `test_start` per assertion, `assertion` with `test_result="passed"|"failed"|"untested"`.
- Mark group-chat regression as `untested` if the test user has no groups — don't block the run on it.

## Threads-style feed testing

The public chat was replaced with a Threads-style social feed (PR #34). The feed uses Supabase tables `feed_posts`, `post_likes`, `post_favorites`, `post_reposts` — all created by `supabase/RELAY_FEED_TABLES.sql`. This migration must be deployed before the feed will work.

### Feed DOM structure

```
.feed-composer
  img.feed-avatar
  textarea#feed-input[placeholder="Message..."]
  img#feed-preview              ← image preview (hidden until file selected)
  button#feed-remove-preview    ← × to remove preview
  input#feed-file-input[type=file][accept="image/jpeg,image/png,image/webp"]
  button#feed-post-btn          ← disabled when textarea empty AND no image

#feed[aria-label="Posts"]       ← scrollable feed area
  article.fp-card               ← each post card
    .fp-header                  ← avatar + username + timestamp + delete btn
    .fp-body                    ← text content
    .fp-img                     ← optional image (from Supabase Storage)
    .fp-engage                  ← engagement bar (4 buttons)
      button[data-action=like]
      button[data-action=comment]
      button[data-action=repost]
      button[data-action=fav]
    .fp-comments                ← comment section (expanded on comment click)
```

### Key test flows

1. **Post creation**: Type text → Post button enables → click Post → post appears at top with avatar, @username, "just now", text, engagement bar. Textarea clears, button disables.
2. **Image post**: Use JS to set file on `#feed-file-input` (file picker can't be driven via computer tool). Canvas-generated PNG works well. Preview appears with × button. Post button enables even without text.
3. **Like/Favorite/Repost toggles**: Click icon → count increments to 1, icon changes style. Click again → count disappears, icon reverts. Each persisted via Supabase RPC (`toggle_like`, `toggle_favorite`, `toggle_repost`).
4. **Comments**: Click comment icon → section expands with input + Reply button. Type text → Reply enables → submit → reply appears indented with avatar/username/text. Comment count updates on parent.
5. **XSS**: Post `<script>alert('xss')</script>` → renders as escaped text, no execution. `escapeHtml()` sanitizes all user input.
6. **Rate limiting**: 5s cooldown between posts (`POST_COOLDOWN_MS = 5000`). Shows toast "Please wait a few seconds before posting again". Hard to trigger via UI (typing takes >5s); verify via code inspection at `app.js` line ~3872.

### Auth form workaround

The Terms checkbox on `/auth.html` may not reliably sync its `checked` property with JS when clicked via computer tool. Workaround: use the browser console to sign in programmatically:

```js
const client = window.supabase.createClient(
  'https://tkarylpzztjwgrphbwun.supabase.co',
  '<ANON_KEY from app.js>'
);
const { data, error } = await client.auth.signInWithPassword({
  email: '...', password: '...'
});
if (!error) window.location.href = '/app.html';
```

This creates a second GoTrueClient instance (harmless warning) but properly sets the auth session.

### Image upload via JS (no file picker)

```js
const canvas = document.createElement('canvas');
canvas.width = 200; canvas.height = 200;
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'blue'; ctx.fillRect(0,0,200,200);
ctx.fillStyle = 'white'; ctx.font = '24px sans-serif';
ctx.fillText('Test', 50, 110);
canvas.toBlob(blob => {
  const file = new File([blob], 'test.png', {type:'image/png'});
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.getElementById('feed-file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', {bubbles:true}));
}, 'image/png');
```

### Supabase Realtime

Feed subscribes to `postgres_changes` on `feed_posts` table for INSERT/DELETE/UPDATE. Console log `[Realtime] Connected (feed)` confirms subscription. Testing real-time cross-user updates requires a second browser session or REST-based inserts with another user's token.

### Feed + DM coexistence

The feed replaced only the public chat panel. DMs sidebar (`aside[aria-label="Direct messages"]`) coexists on the right. All three tabs (All, Requests, Groups) should remain functional. Verify tab switching as a regression check.

## Clean-up

Remind the user to delete (or tell them it's safe to leave):
- Public test messages from User B.
- DM threads A↔B and their messages.
- `friend_requests` A→B rows (if any).
- Orphan `auth.users` rows created for one-off test users (use the service-role admin API).
