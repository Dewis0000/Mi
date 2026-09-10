// Shared type declarations for the StreOps Worker.
//
// This source tree was reconstructed from the deployed Worker bundle (the
// original TypeScript source was never committed anywhere and only existed
// as a `wrangler deploy` output + whatever's on the author's machine).
// esbuild erases type annotations at compile time, so they don't survive in
// a bundle — the interfaces below are reconstructed from how each value is
// actually used at runtime, not recovered verbatim. Where the original
// shape was genuinely dynamic/uncertain (ChannelConfig and friends), this
// stays loosely typed rather than guessing a stricter shape that might not
// match what's actually stored in KV.

export interface Env {
  // KV — a single namespace holding everything: OAuth tokens, per-channel
  // config, logs, donations, auctions, media blobs, the platform blacklist,
  // announce slots, notifications. There's no separate schema doc — the
  // `channel:${login}...` key literals throughout bot.ts/index.ts are the
  // schema.
  TOKENS: KVNamespace;
  // One Durable Object per Twitch channel (keyed by lowercased login via
  // idFromName) — the actual running chat bot for that channel.
  BOT: DurableObjectNamespace;
  // Static assets binding — serves the built dashboard SPA for anything
  // fetch() doesn't recognize as an API/widget route.
  ASSETS: Fetcher;
  // Workers AI — backs the Pro "оскорбления" rule's toxicity fallback.
  AI: Ai;

  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  // The bot's own Twitch account — a separate app registration from the
  // main TWITCH_CLIENT_ID/SECRET pair above, so the bot's token can carry
  // its own chat-specific scopes independently of whatever a streamer
  // authorizes at login.
  BOT_LOGIN: string;
  BOT_CLIENT_ID: string;
  BOT_ACCESS_TOKEN: string;
  BOT_REFRESH_TOKEN: string;
  // HMAC key for the streops_session cookie (see signSession/verifySession
  // in twitch.ts) — a minimal signed-cookie scheme, not a JWT library.
  SESSION_SECRET: string;

  DONATIONALERTS_CLIENT_ID: string;
  DONATIONALERTS_CLIENT_SECRET: string;
  YOUTUBE_API_KEY: string;
  // Verifies Twitch-Eventsub-Message-Signature on the channel-points
  // redemption webhook (see handleTwitchEventSubWebhook in index.ts).
  TWITCH_EVENTSUB_SECRET: string;

  // /admin-login — the password-based superadmin entry point, bypassing
  // Twitch OAuth entirely (see MASTER_PROMPT-adjacent functionality doc:
  // "вход по паролю в обход Twitch"). ADMIN_LOGIN_EMAIL has a sensible
  // default and can stay a plain var; ADMIN_LOGIN_PASSWORD has none and
  // must be set explicitly — it used to be a literal string in source,
  // which meant it sat in plain text in the deployed bundle for anyone who
  // pulled the Worker script back down (as happened during this recovery).
  ADMIN_LOGIN_EMAIL: string;
  ADMIN_LOGIN_PASSWORD: string;
}

/** Payload signed into the `streops_session` cookie. */
export interface Session {
  login: string;
  displayName: string;
  id: string;
  avatar: string;
}

/** A single queued/playing/playlisted track. */
export interface Track {
  id?: string;
  title: string;
  url: string;
  thumbnail?: string | null;
  queuedBy?: string;
  durationSec?: number;
}

/** A viewer override — full exemption from moderation, or an instant ban on sight. */
export interface UserOverride {
  username: string;
  mode: "exempt" | "always-ban";
  reason?: string;
}

/** One periodic chat announcement ("Таймеры"). */
export interface ChatTimer {
  id: string;
  enabled: boolean;
  message: string;
  intervalMinutes: number;
}

export type ModerationAction = "warn" | "timeout" | "ban" | "default";

/** One entry in a channel's moderation/chat log (the dashboard's "Журнал"). */
export interface LogEntry {
  id: string;
  time: string;
  user: string;
  role: "bot" | "moderator" | "subscriber" | "viewer";
  action: "message" | "deleted" | "timeout" | "ban";
  text: string;
  reason?: string;
  twitchMsgId?: string;
}

/** A pending scheduled deletion of one or more chat messages (auto-delete for command replies / song-request confirmations). */
export interface PendingDeletion {
  messageIds: string[];
  dueAt: number;
}

/**
 * The per-channel config blob stored at `channel:${login}` in KV. Loosely
 * typed on purpose — this object has grown one optional field at a time
 * over the life of the project (see DEFAULT_CONFIG in bot.ts for the actual
 * defaults), and every reader already treats every field as optional via
 * `??`/`||` fallbacks. A stricter type here would just be a guess.
 */
export interface ChannelConfig {
  enabled?: boolean;
  banned?: boolean;
  bannedReason?: string | null;
  isAdmin?: boolean;
  isPro?: boolean;
  tier?: "free" | "pro" | "pro-plus" | "ultimate";
  proSince?: string | null;

  bannedWords?: string[];
  linksMode?: "off" | "mods-only" | "subs-only";
  capsMode?: boolean;
  userOverrides?: UserOverride[];
  ruleExemptions?: Record<string, string[]>;
  ruleActions?: Record<string, ModerationAction>;
  ruleDurations?: Record<string, number>;
  firstViolationAction?: "warn" | "timeout" | "ban";
  warningsBeforeTimeout?: number;
  timeoutDurationMin?: number;
  banAfterViolations?: number;

  proDuplicateCheck?: boolean;
  proMentionSpamCheck?: boolean;
  proEmoteFloodCheck?: boolean;
  proInsultsCheck?: boolean;

  commands?: Record<string, string>;
  timers?: ChatTimer[];

  songRequestCommand?: string;
  songSubsOnly?: boolean;
  songRequestCooldownSeconds?: number;
  songMaxDurationMin?: number;
  songMinViews?: number;
  songMusicCategoryOnly?: boolean;
  songBlockedChannels?: string[];
  songRequestAutoDeleteSeconds?: number;

  nowPlaying?: Track | null;
  nowPlayingStartedAt?: string;
  nowPlayingDurationSec?: number;
  paused?: boolean;
  pausedAt?: string;
  playbackStopped?: boolean;
  queue?: Track[];
  playlist?: Track[];
  playlistIndex?: number;
  playlistShuffle?: boolean;

  widgetSettings?: Record<string, any>;

  donationChatAnnounce?: boolean;
  donationChatAnnounceMinAmount?: number;

  [key: string]: any;
}
