# StreOps — `zaka-bot` Worker

Backend for StreOps, a platform for Twitch streamers: chat bot, moderation,
music requests, OBS widgets, donations (DonationAlerts), Channel-Points
auctions, and an admin panel. Runs on a single Cloudflare Worker
(`zaka-bot`) with one Durable Object per channel and one KV namespace.

## How this repo came to exist

This session found that `zaka-bot` was **already live** in the connected
Cloudflare account (created well before this repo had any code in it) —
the source had never been committed anywhere and only existed as a
deployed Worker bundle. This repo is that bundle **reconstructed back into
readable, multi-file TypeScript** (`src/twitch.ts`, `src/bot.ts`,
`src/index.ts` — the same three files and module boundaries the original
build used, recovered from esbuild's per-module comments and its
`--keep-names` output).

A few things follow from that:

- **Logic and behavior are faithful to what's deployed.** Every route,
  every moderation rule, every widget's HTML/CSS/JS was transcribed from
  the actual bundle, not reinvented.
- **Type annotations are not.** TypeScript's types are erased at compile
  time, so they don't survive in a bundle. Function signatures and
  interfaces here (see `src/types.ts`) are reconstructed from how each
  value is actually used, not recovered verbatim — loosely typed
  (`any`/broad interfaces) wherever the original shape was genuinely
  uncertain, rather than guessing a stricter type that might not match
  what's really stored in KV.
- **One deliberate behavior change**, described below.
- **The dashboard frontend is not in this repo.** See "Known gap" below.

### Security fix made during recovery

The deployed bundle had:

```js
var ADMIN_LOGIN_EMAIL = "admin@gmail.com";
var ADMIN_LOGIN_PASSWORD = "<the real password, in plain text>";
```

hardcoded directly in the Worker source — meaning the `/admin-login`
password sat in **plain text** inside the compiled script (anyone who
could read the deployed script back, e.g. via the Cloudflare API, could
read it). Both now come from `Env` (`src/types.ts`): `ADMIN_LOGIN_EMAIL`
stays a plain, non-secret var; `ADMIN_LOGIN_PASSWORD` must be set as a
Wrangler secret and has no default. **The old password value should be
treated as compromised** (it was also pasted into this chat session as
part of the account's other credentials, so it's doubly exposed) — it is
deliberately not repeated anywhere in this repo, including this README.
Set a fresh one (see below) rather than reusing it.

No other hardcoded secrets were found — everything else already read from
`env.*`.

### Known gap: the dashboard frontend

The user-facing dashboard (streamer control panel + `/admin`) is a
**separate static build**, served via the Worker's `ASSETS` binding — it
is not part of the Worker script, so it could not be recovered the way
`src/*.ts` was. `public/index.html` here is only a placeholder so the
`[assets]` binding has something valid to serve locally; **it is not the
real dashboard**. Do not point this repo's `wrangler.toml` at the live
`zaka-bot` Worker and deploy over it — that would take the real dashboard
offline while leaving the backend otherwise unchanged.

If you have the dashboard source elsewhere (most likely on whichever
machine originally ran `wrangler deploy`), drop its build output into
`public/` and it should work as-is against the API routes in `src/index.ts`
— all of it matches what's already live. Otherwise, it needs to be rebuilt
from scratch against the API contract this backend exposes (see the route
list in `src/index.ts`'s `fetch()` for the full surface).

### Comparison against the feature spec

`docs/streops-functionality-spec.md` (provided alongside this recovery)
describes the intended full feature set. Backend-wise, everything in it is
implemented, with a few notable deltas:

- **`!vl <text>`** (speak text through the chat widget) is hardcoded to
  the superadmin account (`zaka_00`) only — the spec doesn't say this
  command is superadmin-restricted, but the deployed code is (with a
  comment confirming this is deliberate, not an oversight).
- **Auctions** support a third finish mode, "elimination" (a
  down-to-one-loser-at-a-time wheel), beyond the spec's two
  (highest-bid / wheel).
- **Donation-alert media** (images/sounds) is stored as base64 inside KV,
  not a dedicated file store — this Cloudflare account doesn't have R2
  enabled. Capped at 5 MB/file, 40 files/channel.
- A **"Таймеры" (periodic chat announcements)** feature exists in the bot
  config (`cfg.timers`) that isn't mentioned in the spec at all — send a
  message automatically every N minutes.
- Section 9 of the spec ("Прочее": `/terms`, `/blocked`, the visible JS
  error reporter, the maintenance banner) is entirely dashboard-frontend
  functionality — nothing in the Worker backend to compare it against.

## Architecture

- **`src/twitch.ts`** — Helix API calls, OAuth token refresh/caching (app,
  bot, and per-broadcaster tokens), the signed-cookie session scheme
  (`streops_session`).
- **`src/bot.ts`** — `TwitchBotDO`, the Durable Object: one instance per
  channel (keyed by lowercased login). Holds the live Twitch IRC
  connection (via the `fetch()`-with-`Upgrade`-header trick, not a
  library), runs moderation + song-request + command handling on every
  chat message, fans chat out to the OBS chat-widget WebSocket hub, and
  runs a separate DonationAlerts Centrifugo connection per channel.
- **`src/index.ts`** — the HTTP Worker: ~70 routes (dashboard API, OAuth,
  the Twitch EventSub webhook, admin panel, the six `/widget/*` OBS
  overlay pages), plus a cron trigger (`sweepChannels`, every 2 minutes)
  that starts/stops each channel's Durable Object based on real Twitch
  live status.
- **KV (`TOKENS`, one namespace)** — literally everything: OAuth tokens,
  per-channel config/logs/donations/auctions/media, the platform
  blacklist, admin-created TTS announce slots. There's no separate schema
  doc; the `channel:${login}...` key literals throughout the code are the
  schema.

No Durable Object migration to a different architecture was made — the
Worker name, KV namespace ID, and Durable Object binding here match the
real deployed resources in the connected Cloudflare account exactly.

## Setup

```bash
npm install
```

### Local development

Secrets for `wrangler dev` go in `.dev.vars` (gitignored, never committed).
A `.dev.vars` was created during this recovery with the real Twitch/
YouTube/DonationAlerts-secret values that were provided, plus freshly
generated dev-only values for `SESSION_SECRET`, `TWITCH_EVENTSUB_SECRET`
and `ADMIN_LOGIN_PASSWORD` (**not** the real ones — a value more sensitive
than the others, so it wasn't reused even for local dev). Fill in
`DONATIONALERTS_CLIENT_ID`, which wasn't provided.

```bash
npm run dev
```

Verified during this recovery: `tsc --noEmit` passes clean; `wrangler dev`
boots, serves the placeholder page, all six `/widget/*` pages render, the
Twitch OAuth redirect builds correctly with the real `TWITCH_CLIENT_ID`
and scopes, and the full `/admin-login` → signed-cookie → `/api/me` →
`/api/admin/users` (superadmin-gated) flow works end-to-end against local
KV.

### Deploying

**Do not run `npm run deploy` against the real `zaka-bot` Worker until
`public/` has the actual dashboard build** (see "Known gap" above) — the
`[assets]` binding would otherwise serve the placeholder page instead of
the real dashboard to every visitor.

Once that's sorted:

```bash
npm run deploy
```

Required secrets on the real Worker (already set there today — this is
only needed if setting up a new environment):

```
wrangler secret put TWITCH_CLIENT_ID
wrangler secret put TWITCH_CLIENT_SECRET
wrangler secret put BOT_CLIENT_ID
wrangler secret put BOT_ACCESS_TOKEN
wrangler secret put BOT_REFRESH_TOKEN
wrangler secret put SESSION_SECRET
wrangler secret put DONATIONALERTS_CLIENT_ID
wrangler secret put DONATIONALERTS_CLIENT_SECRET
wrangler secret put YOUTUBE_API_KEY
wrangler secret put TWITCH_EVENTSUB_SECRET
wrangler secret put ADMIN_LOGIN_PASSWORD
```

`BOT_LOGIN` and `ADMIN_LOGIN_EMAIL` are plain (non-secret) vars, already in
`wrangler.toml`.

## Suggested next steps

1. **Rotate `ADMIN_LOGIN_PASSWORD`** and set the new value as a secret —
   don't reuse the old hardcoded one.
2. **Recover or rebuild the dashboard frontend** — the biggest actual gap.
3. Consider deduplicating the auction helper functions (`matchAuctionOption`,
   `finalizeAuction`, etc.), which exist verbatim in both `bot.ts` and
   `index.ts` in the real deployed code — kept that way here for fidelity,
   worth factoring into a shared module in a follow-up.
4. Consider whether `!vl` should stay superadmin-only or become available
   to broadcasters/mods per-channel, per the spec's more general phrasing.
5. Get this repo's `wrangler.toml`/KV namespace ID into whatever CI/deploy
   process is used going forward, so the Worker is never again running in
   production without its source under version control.
