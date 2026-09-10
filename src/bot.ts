// TwitchBotDO — one Durable Object instance per Twitch channel (keyed by
// lowercased login via `env.BOT.idFromName(login)`). Holds the actual live
// IRC connection to Twitch chat, runs moderation/song-request/command
// handling on every message, and fans live chat out to the OBS chat widget
// over its own WebSocket hub. Also owns the (separate) DonationAlerts
// Centrifugo connection for real-time donation events.

import type { Env, ChannelConfig, LogEntry, PendingDeletion, Track } from "./types";
import { fetchWithTimeout, helix, getBotToken, getUserByLogin } from "./twitch";

const MAX_LOG_ENTRIES = 300;

const DEFAULT_CONFIG: ChannelConfig = {
  enabled: false,
  bannedWords: [],
  linksMode: "mods-only",
  capsMode: true,
  commands: {
    "!uptime": "__uptime__",
    "!song": "__song__",
    "!discord": "Ссылка на Discord пока не настроена.",
  },
  nowPlaying: null,
  queue: [],
  timers: [],
  songRequestCooldownSeconds: 45,
  songMaxDurationMin: 6,
  songMinViews: 1000,
  songMusicCategoryOnly: true,
  songBlockedChannels: [],
  songRequestAutoDeleteSeconds: 0,
  firstViolationAction: "warn",
  warningsBeforeTimeout: 2,
  timeoutDurationMin: 10,
  banAfterViolations: 3,
};

// Auto-delete window for command replies (!uptime, !song, custom commands)
// and the viewer's own message that triggered them — keeps chat from
// filling up with bot chatter once it's served its purpose.
const COMMAND_AUTO_DELETE_SECONDS = 120;

const INSULT_WORDS = [
  "дебил",
  "дура",
  "идиот",
  "тупой",
  "тупая",
  "ублюдок",
  "мразь",
  "ничтожество",
  "уёбок",
  "хуйло",
  "retard",
  "idiot",
  "moron",
  "asshole",
  "bastard",
  "scum",
];

function parseIso8601Duration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

function isSpotifyTrackLink(url: string): boolean {
  return /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\//i.test(url);
}

function isYandexMusicLink(url: string): boolean {
  return /music\.yandex\.[a-z.]+\/(?:album\/\d+\/track\/\d+|track\/\d+)/i.test(url);
}

async function resolveSpotifyTrackTitle(url: string): Promise<string | null> {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetchWithTimeout(oembedUrl);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.title ? String(data.title) : null;
  } catch {
    return null;
  }
}

function matchAuctionOption(options: any[], rawText: string): any | null {
  const norm = (s: any) => String(s || "").trim().toLowerCase();
  const input = norm(rawText);
  if (!input) return null;
  let match = options.find((o) => norm(o.label) === input);
  if (match) return match;
  match = options.find((o) => norm(o.label).includes(input) || input.includes(norm(o.label)));
  return match || null;
}

const MAX_AUCTION_OPTIONS = 30;

function resolveOrCreateAuctionOption(auction: any, rawText: string): any | null {
  const existing = matchAuctionOption(auction.options, rawText);
  if (existing) return existing;
  if (!auction.allowCustomOptions) return null;
  const label = String(rawText || "").trim().slice(0, 60);
  if (!label) return null;
  if (auction.options.length >= MAX_AUCTION_OPTIONS) return null;
  const created = { id: crypto.randomUUID(), label, total: 0, bids: [] };
  auction.options.push(created);
  return created;
}

function weightedPick<T>(items: T[], weightFn: (item: T) => number): T {
  const weights = items.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function finalizeAuction(auction: any): void {
  auction.status = "ended";
  auction.endedAt = new Date().toISOString();
  const mode = auction.finishMode || "highest";
  const hasBids = auction.options.some((o: any) => o.total > 0);
  if (mode === "roulette") {
    auction.winnerOptionId = hasBids ? weightedPick(auction.options, (o: any) => o.total).id : null;
    auction.eliminationOrder = undefined;
  } else if (mode === "elimination") {
    if (!hasBids) {
      auction.winnerOptionId = null;
      auction.eliminationOrder = [];
    } else {
      let remaining = [...auction.options];
      const order: string[] = [];
      while (remaining.length > 1) {
        const loser: any = weightedPick(remaining, (o: any) => 1 / (o.total + 1));
        order.push(loser.id);
        remaining = remaining.filter((o: any) => o.id !== loser.id);
      }
      auction.eliminationOrder = order;
      auction.winnerOptionId = remaining[0].id;
    }
  } else {
    const top = [...auction.options].sort((a: any, b: any) => b.total - a.total)[0];
    auction.winnerOptionId = top && top.total > 0 ? top.id : null;
    auction.eliminationOrder = undefined;
  }
}

function auctionResultMessage(auction: any): string {
  const winner = auction.options.find((o: any) => o.id === auction.winnerOptionId);
  const unit = auction.currency === "points" ? "баллов" : "₽";
  return winner
    ? `Аукцион «${auction.title}» завершён! Победил вариант «${winner.label}» — ${winner.total} ${unit}.`
    : `Аукцион «${auction.title}» завершён — ставок не было.`;
}

export class TwitchBotDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  private ws: WebSocket | null = null;
  private login = "";
  private streamStart: number | null = null;
  private lastPing = 0;

  // When each timer ("Таймеры" on the dashboard) last actually sent its
  // message. Backed by Durable Object storage (see start()/persistTimerLastSent()),
  // not just kept in memory — a redeploy resets every other in-memory Map
  // on this class, but that used to also silently reset this one, and if
  // reconnects happen more often than a timer's own interval (redeploys,
  // network blips), the timer's countdown kept restarting and it could
  // never actually reach its due time. Loaded from storage once in start().
  private timerLastSent = new Map<string, number>();

  private logBuffer: LogEntry[] = [];
  private logDirty = false;
  private chatSockets = new Set<WebSocket>();
  private lastMsgByUser = new Map<string, { text: string; ts: number }>();
  // Last successful !sr/!song timestamp per viewer (lowercased login), for
  // the configurable song-request cooldown. In-memory only — resets on
  // redeploy, same tradeoff as lastMsgByUser above.
  private lastSongRequestByUser = new Map<string, number>();
  // Song-request auto-delete queue — in-memory only, same tradeoff as
  // everything else above: a redeploy in the ~30s window just means that
  // one cleanup is skipped, not a broken feature.
  private pendingDeletions: PendingDeletion[] = [];
  // Escalation state for "Предупреждения и баны" — per-viewer counts,
  // cleared on each stream start (see start()). In-memory only.
  private violationCountByUser = new Map<string, number>();
  private timeoutCountByUser = new Map<string, number>();

  // Real-time DonationAlerts connection (Centrifugo) — separate socket from
  // Twitch IRC, only opened when the streamer has actually connected their
  // DonationAlerts account (see channel:{login}:donationalerts in KV).
  private daWs: WebSocket | null = null;
  private daChannelName: string | null = null;
  private daClientId: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const login = url.searchParams.get("login") || url.searchParams.get("channel") || this.login;
    if (login) this.login = login;

    if (url.pathname.endsWith("/start")) {
      await this.start();
      return Response.json({ ok: true, status: "started" });
    }
    if (url.pathname.endsWith("/stop")) {
      await this.stop();
      return Response.json({ ok: true, status: "stopped" });
    }
    if (url.pathname.endsWith("/say") && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      if (body.message && this.ws) await this.say(body.message);
      return Response.json({ ok: true, sent: !!(body.message && this.ws) });
    }
    if (url.pathname.endsWith("/ban") && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      if (!body.username) return Response.json({ error: "username required" }, { status: 400 });
      try {
        const token = await getBotToken(this.env);
        const target = await getUserByLogin(this.env, body.username, token, this.env.BOT_CLIENT_ID);
        if (!target) return Response.json({ error: "user_not_found" }, { status: 404 });
        const reason = body.reason || "нарушение правил";
        await this.timeoutUser(target.id, body.durationSec ?? null, reason);
        this.pushLog({ user: body.username, role: "viewer", action: body.durationSec ? "timeout" : "ban", text: "", reason });
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ error: e?.message || String(e) }, { status: 500 });
      }
    }
    if (url.pathname.endsWith("/unban") && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      if (!body.username) return Response.json({ error: "username required" }, { status: 400 });
      try {
        const token = await getBotToken(this.env);
        const target = await getUserByLogin(this.env, body.username, token, this.env.BOT_CLIENT_ID);
        if (!target) return Response.json({ error: "user_not_found" }, { status: 404 });
        const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
        const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
        if (!bot || !broadcaster) return Response.json({ error: "lookup_failed" }, { status: 500 });
        const res = await helix(
          this.env,
          `/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${bot.id}&user_id=${target.id}`,
          token,
          { method: "DELETE" },
          this.env.BOT_CLIENT_ID
        );
        if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ error: e?.message || String(e) }, { status: 500 });
      }
    }
    if (url.pathname.endsWith("/clear-chat") && req.method === "POST") {
      try {
        const token = await getBotToken(this.env);
        const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
        const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
        if (!bot || !broadcaster) return Response.json({ error: "lookup_failed" }, { status: 500 });
        const res = await helix(
          this.env,
          `/moderation/chat?broadcaster_id=${broadcaster.id}&moderator_id=${bot.id}`,
          token,
          { method: "DELETE" },
          this.env.BOT_CLIENT_ID
        );
        if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
        this.pushLog({ user: this.login, role: "moderator", action: "deleted", text: "", reason: "Очистка чата" });
        return Response.json({ ok: true });
      } catch (e: any) {
        return Response.json({ error: e?.message || String(e) }, { status: 500 });
      }
    }
    if (url.pathname.endsWith("/emote-only") && req.method === "POST") {
      const body: any = await req.json().catch(() => ({}));
      try {
        const token = await getBotToken(this.env);
        const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
        const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
        if (!bot || !broadcaster) return Response.json({ error: "lookup_failed" }, { status: 500 });
        const res = await helix(
          this.env,
          `/chat/settings?broadcaster_id=${broadcaster.id}&moderator_id=${bot.id}`,
          token,
          { method: "PATCH", body: JSON.stringify({ emote_mode: !!body.enabled }) },
          this.env.BOT_CLIENT_ID
        );
        if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
        return Response.json({ ok: true, enabled: !!body.enabled });
      } catch (e: any) {
        return Response.json({ error: e?.message || String(e) }, { status: 500 });
      }
    }
    if (url.pathname.endsWith("/status")) {
      return Response.json({ connected: !!this.ws, login: this.login });
    }
    if (url.pathname.endsWith("/logs") && req.method === "POST") {
      if (this.logBuffer.length === 0) {
        const stored: any = await this.env.TOKENS.get(`channel:${this.login}:logs`, "json");
        if (stored) this.logBuffer = stored;
      }
      const idsToDelete = this.logBuffer.filter((e) => e.action === "message" && e.twitchMsgId).map((e) => e.twitchMsgId as string);
      await this.deleteMessagesBatch(idsToDelete);
      this.logBuffer = [];
      this.logDirty = false;
      await this.env.TOKENS.delete(`channel:${this.login}:logs`);
      return Response.json({ ok: true, logs: [], deletedFromChat: idsToDelete.length });
    }
    if (url.pathname.endsWith("/logs")) {
      if (this.logBuffer.length === 0) {
        const stored: any = await this.env.TOKENS.get(`channel:${this.login}:logs`, "json");
        if (stored) this.logBuffer = stored;
      }
      return Response.json({ logs: this.logBuffer });
    }
    if (url.pathname.endsWith("/config") && req.method === "POST") {
      const body: any = await req.json();
      const cfg = await this.getConfig();
      const next = { ...cfg, ...body };
      await this.env.TOKENS.put(`channel:${this.login}`, JSON.stringify(next));
      return Response.json({ ok: true, config: next });
    }
    if (url.pathname.endsWith("/chat-stream")) {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.chatSockets.add(server);
      server.addEventListener("close", () => this.chatSockets.delete(server));
      server.addEventListener("error", () => this.chatSockets.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }

  // Fans a live chat message out to every connected OBS chat-widget viewer.
  private broadcastChat(payload: any): void {
    if (this.chatSockets.size === 0) return;
    const msg = JSON.stringify(payload);
    for (const ws of this.chatSockets) {
      try {
        ws.send(msg);
      } catch {
        this.chatSockets.delete(ws);
      }
    }
  }

  private async getConfig(): Promise<ChannelConfig> {
    const stored: any = await this.env.TOKENS.get(`channel:${this.login}`, "json");
    return { ...DEFAULT_CONFIG, ...stored };
  }

  async start(): Promise<void> {
    if (this.ws) return;
    const token = await getBotToken(this.env);
    const resp = await fetch("https://irc-ws.chat.twitch.tv:443/", {
      headers: { Upgrade: "websocket" },
    });
    const ws = (resp as any).webSocket as WebSocket | null;
    if (!ws) throw new Error("Twitch IRC upgrade failed");
    ws.accept();
    this.ws = ws;
    this.streamStart = Date.now();
    ws.send(`PASS oauth:${token}`);
    ws.send(`NICK ${this.env.BOT_LOGIN}`);
    ws.send("CAP REQ :twitch.tv/commands twitch.tv/tags");
    ws.send(`JOIN #${this.login}`);
    ws.addEventListener("message", (ev: MessageEvent) => {
      this.handleIrc(String(ev.data)).catch((err) => {
        console.log(`[handleIrc] UNCAUGHT ERROR: ${err?.stack || err?.message || String(err)}`);
      });
    });
    ws.addEventListener("close", () => {
      this.ws = null;
    });
    ws.addEventListener("error", () => {
      this.ws = null;
    });

    const storedTimerLastSent: any = await this.state.storage.get("timerLastSent");
    this.timerLastSent = new Map(Object.entries(storedTimerLastSent || {}));
    this.violationCountByUser.clear();
    this.timeoutCountByUser.clear();
    this.lastPing = Date.now();
    if (this.logBuffer.length === 0) {
      const stored: any = await this.env.TOKENS.get(`channel:${this.login}:logs`, "json");
      if (stored) this.logBuffer = stored;
    }
    this.startDonationAlerts().catch((err) => {
      console.log(`[donationalerts] start failed: ${err?.stack || err?.message || String(err)}`);
    });
    await this.state.storage.setAlarm(Date.now() + 60 * 1000);
  }

  private nextAlarmDelayMs(): number {
    if (this.pendingDeletions.length === 0) return 60 * 1000;
    const soonest = Math.min(...this.pendingDeletions.map((p) => p.dueAt - Date.now()));
    return Math.max(3000, Math.min(60 * 1000, soonest));
  }

  async alarm(): Promise<void> {
    if (this.pendingDeletions.length) {
      const now = Date.now();
      const due = this.pendingDeletions.filter((p) => p.dueAt <= now);
      this.pendingDeletions = this.pendingDeletions.filter((p) => p.dueAt > now);
      for (const p of due) {
        for (const id of p.messageIds) await this.deleteMessage(id);
      }
    }
    if (!this.ws) {
      if (this.pendingDeletions.length) {
        await this.state.storage.setAlarm(Date.now() + this.nextAlarmDelayMs());
      }
      return;
    }
    if (!this.daWs) {
      this.startDonationAlerts().catch(() => {});
    }
    try {
      const auctionsKey = `channel:${this.login}:auctions`;
      const auctions: any[] | null = await this.env.TOKENS.get(auctionsKey, "json");
      const expired = auctions?.find((a) => a.status === "live" && a.endsAt && new Date(a.endsAt).getTime() <= Date.now());
      if (expired && auctions) {
        finalizeAuction(expired);
        await this.env.TOKENS.put(auctionsKey, JSON.stringify(auctions));
        await this.say(auctionResultMessage(expired));
      }
    } catch {
      // best-effort — a KV hiccup here shouldn't crash the alarm loop
    }
    if (Date.now() - this.lastPing > 4 * 60 * 1000) {
      try {
        this.ws.send("PING :keepalive");
        this.lastPing = Date.now();
      } catch {
        this.ws = null;
        return;
      }
    }
    try {
      const cfg = await this.getConfig();
      const now = Date.now();
      let timerLastSentDirty = false;
      for (const timer of cfg.timers || []) {
        if (!timer.enabled || !timer.message || timer.intervalMinutes <= 0) continue;
        const last = this.timerLastSent.get(timer.id) || this.streamStart || 0;
        if (now - last >= timer.intervalMinutes * 60 * 1000) {
          await this.say(timer.message);
          this.timerLastSent.set(timer.id, now);
          timerLastSentDirty = true;
        }
      }
      if (timerLastSentDirty) {
        await this.state.storage.put("timerLastSent", Object.fromEntries(this.timerLastSent));
      }
    } catch {
      // best-effort
    }
    if (this.logDirty) {
      this.logDirty = false;
      await this.env.TOKENS.put(`channel:${this.login}:logs`, JSON.stringify(this.logBuffer));
    }
    await this.state.storage.setAlarm(Date.now() + this.nextAlarmDelayMs());
  }

  private pushLog(entry: Omit<LogEntry, "id" | "time">): void {
    this.logBuffer.unshift({
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      ...entry,
    });
    if (this.logBuffer.length > MAX_LOG_ENTRIES) this.logBuffer.length = MAX_LOG_ENTRIES;
    this.logDirty = true;
  }

  async stop(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.daWs?.close();
    this.daWs = null;
  }

  // Real-time donation notifications via DonationAlerts' Centrifugo socket —
  // a completely separate connection from Twitch IRC, only opened when the
  // streamer has connected their DonationAlerts account (see
  // channel:{login}:donationalerts in KV, written by handleDonationAlertsCallback
  // in index.ts). Verified live against donationalerts.com/apidoc before
  // writing this — see comments below for the exact handshake this follows.
  private async startDonationAlerts(): Promise<void> {
    if (this.daWs) return;
    const daData: any = await this.env.TOKENS.get(`channel:${this.login}:donationalerts`, "json");
    if (!daData) return;
    const profileRes = await fetchWithTimeout("https://www.donationalerts.com/api/v1/user/oauth", {
      headers: { Authorization: `Bearer ${daData.access_token}` },
    });
    if (!profileRes.ok) return;
    const profileData: any = await profileRes.json();
    const socketToken = profileData.data?.socket_connection_token;
    const userId = profileData.data?.id;
    if (!socketToken || !userId) return;
    const resp = await fetch("https://centrifugo.donationalerts.com/connection/websocket", {
      headers: { Upgrade: "websocket" },
    });
    const ws = (resp as any).webSocket as WebSocket | null;
    if (!ws) return;
    ws.accept();
    this.daWs = ws;
    this.daChannelName = `$alerts:donation_${userId}`;
    this.daClientId = null;
    ws.addEventListener("message", (ev: MessageEvent) => {
      this.handleDonationAlertsMessage(String(ev.data), daData.access_token).catch((err) => {
        console.log(`[donationalerts] UNCAUGHT ERROR: ${err?.stack || err?.message || String(err)}`);
      });
    });
    ws.addEventListener("close", () => {
      this.daWs = null;
    });
    ws.addEventListener("error", () => {
      this.daWs = null;
    });
    ws.send(JSON.stringify({ params: { token: socketToken }, id: 1 }));
  }

  private async handleDonationAlertsMessage(raw: string, accessToken: string): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id === 1 && msg.result?.client) {
      this.daClientId = msg.result.client;
      if (!this.daChannelName || !this.daWs) return;
      const subRes = await fetchWithTimeout("https://www.donationalerts.com/api/v1/centrifuge/subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channels: [this.daChannelName], client: this.daClientId }),
      });
      if (!subRes.ok) return;
      const subData: any = await subRes.json();
      const chInfo = (subData.channels || []).find((c: any) => c.channel === this.daChannelName);
      if (!chInfo?.token) return;
      this.daWs.send(JSON.stringify({ params: { channel: this.daChannelName, token: chInfo.token }, method: 1, id: 2 }));
      return;
    }
    if (msg.id === 2) return;
    const data = msg.result?.data;
    if (data && data.name === "donation" && typeof data.amount === "number") {
      const cfg = await this.getConfig();
      const username = data.username || "аноним";
      const amountText = `${data.amount} ${data.currency || ""}`.trim();
      const record = {
        id: crypto.randomUUID(),
        username,
        amount: data.amount,
        currency: data.currency || "RUB",
        message: data.message || "",
        at: new Date().toISOString(),
      };
      try {
        const historyKey = `channel:${this.login}:donations`;
        const history: any[] = (await this.env.TOKENS.get(historyKey, "json")) || [];
        history.unshift(record);
        if (history.length > 200) history.length = 200;
        await this.env.TOKENS.put(historyKey, JSON.stringify(history));
        await this.env.TOKENS.put(`channel:${this.login}:lastDonation`, JSON.stringify(record));
      } catch {
        // best-effort — losing one donation from history must never break the alert/chat announce below
      }
      const auctionsKey = `channel:${this.login}:auctions`;
      const auctions: any[] | null = await this.env.TOKENS.get(auctionsKey, "json");
      const live = auctions?.find((a) => a.status === "live" && a.currency === "donation");
      let auctionMsg: string | null = null;
      if (live) {
        const isNewOption = !matchAuctionOption(live.options || [], data.message || "");
        const option = resolveOrCreateAuctionOption(live, data.message || "");
        if (option) {
          option.total += data.amount;
          option.bids = option.bids || [];
          option.bids.push({ username, amount: data.amount, at: new Date().toISOString() });
          await this.env.TOKENS.put(auctionsKey, JSON.stringify(auctions));
          auctionMsg = isNewOption
            ? `${username} предложил новый вариант «${option.label}» и поставил ${amountText} (аукцион «${live.title}»)!`
            : `${username} поставил ${amountText} на «${option.label}» (аукцион «${live.title}») — сейчас там ${option.total}.`;
        } else {
          auctionMsg = `Идёт аукцион «${live.title}» — укажите в комментарии донату один из вариантов: ${live.options.map((o: any) => o.label).join(", ")}.`;
        }
      }
      if (cfg.donationChatAnnounce !== false && data.amount >= (cfg.donationChatAnnounceMinAmount || 0)) {
        const parts = [`Новый донат от ${username}: ${amountText}`];
        if (data.message) parts.push(`— ${data.message}`);
        await this.say(parts.join(" "));
      }
      if (auctionMsg) await this.say(auctionMsg);
      this.pushLog({
        user: username,
        role: "viewer",
        action: "message",
        text: `[донат ${amountText}]${data.message ? " " + data.message : ""}`,
      });
    }
  }

  private async say(msg: string): Promise<void> {
    this.ws?.send(`PRIVMSG #${this.login} :${msg}`);
  }

  // Sends via Helix's "Send Chat Message" endpoint instead of raw IRC —
  // needed only when the caller wants the message's Twitch-assigned ID back
  // (e.g. to delete it later), since a message sent over our own IRC
  // connection is never echoed back to us with an ID. Falls back to the
  // normal IRC send (message still gets through, just without an ID) if the
  // bot's token doesn't have whatever's required for this Helix call —
  // that's a real possibility worth logging, not assuming away.
  private async sayAndGetId(msg: string): Promise<string | null> {
    try {
      const token = await getBotToken(this.env);
      const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
      const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
      if (bot && broadcaster) {
        const res = await helix(
          this.env,
          `/chat/messages`,
          token,
          { method: "POST", body: JSON.stringify({ broadcaster_id: broadcaster.id, sender_id: bot.id, message: msg }) },
          this.env.BOT_CLIENT_ID
        );
        if (res.ok) {
          const data: any = await res.json();
          const sent = data.data?.[0];
          if (sent && sent.is_sent !== false && sent.message_id) {
            return sent.message_id;
          }
          console.log(`[autodelete] Helix send reported not sent: ${JSON.stringify(sent)}`);
        } else {
          console.log(`[autodelete] Helix chat/messages failed ${res.status}: ${await res.text()}`);
        }
      }
    } catch (e) {
      console.log(`[autodelete] Helix send error: ${e}`);
    }
    await this.say(msg);
    return null;
  }

  private async deleteMessage(messageId: string): Promise<void> {
    try {
      const token = await getBotToken(this.env);
      const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
      const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
      if (!bot || !broadcaster) return;
      const res = await helix(
        this.env,
        `/moderation/chat?broadcaster_id=${broadcaster.id}&moderator_id=${bot.id}&message_id=${encodeURIComponent(messageId)}`,
        token,
        { method: "DELETE" },
        this.env.BOT_CLIENT_ID
      );
      if (!res.ok) {
        console.log(`[autodelete] failed to delete message ${messageId}: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      console.log(`[autodelete] error deleting message ${messageId}: ${e}`);
    }
  }

  // Bulk version for "Очистить журнал" — resolves the bot token and
  // broadcaster/bot IDs once instead of per message (deleteMessage() does
  // its own lookup every call, which doesn't scale to a few hundred
  // messages), and runs with limited concurrency so it doesn't hammer
  // Twitch's API all at once. Failures are logged and skipped individually
  // — an old message Twitch won't delete anymore shouldn't block the rest.
  private async deleteMessagesBatch(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    try {
      const token = await getBotToken(this.env);
      const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
      const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
      if (!bot || !broadcaster) return;
      let idx = 0;
      const worker = async () => {
        while (idx < messageIds.length) {
          const id = messageIds[idx++];
          try {
            const res = await helix(
              this.env,
              `/moderation/chat?broadcaster_id=${broadcaster.id}&moderator_id=${bot.id}&message_id=${encodeURIComponent(id)}`,
              token,
              { method: "DELETE" },
              this.env.BOT_CLIENT_ID
            );
            if (!res.ok) console.log(`[clear] failed to delete ${id}: ${res.status}`);
          } catch (e) {
            console.log(`[clear] error deleting ${id}: ${e}`);
          }
        }
      };
      const concurrency = Math.min(8, messageIds.length);
      await Promise.all(Array.from({ length: concurrency }, worker));
    } catch (e) {
      console.log(`[clear] batch delete setup failed: ${e}`);
    }
  }

  private scheduleMessageDeletion(messageIds: (string | null)[], delaySeconds: number): void {
    const ids = messageIds.filter((id): id is string => !!id);
    if (ids.length === 0 || delaySeconds <= 0) return;
    this.pendingDeletions.push({ messageIds: ids, dueAt: Date.now() + delaySeconds * 1000 });
    this.state.storage.setAlarm(Date.now() + this.nextAlarmDelayMs()).catch(() => {});
  }

  private async handleIrc(raw: string): Promise<void> {
    for (const line of raw.split("\r\n")) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        this.ws?.send("PONG :tmi.twitch.tv");
        continue;
      }
      if (!line.includes("PRIVMSG")) continue;
      try {
        await this.handlePrivmsg(line);
      } catch (err: any) {
        console.log(`[handlePrivmsg] UNCAUGHT ERROR on line "${line}": ${err?.stack || err?.message || String(err)}`);
      }
    }
  }

  private async handlePrivmsg(line: string): Promise<void> {
    const tagsPart = line.startsWith("@") ? line.slice(1, line.indexOf(" ")) : "";
    const tags: Record<string, string> = Object.fromEntries(
      tagsPart.split(";").map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i), kv.slice(i + 1)];
      })
    );
    const nickMatch = line.match(/:(\w+)!\w+@/);
    const user = nickMatch?.[1] || tags["display-name"] || "unknown";
    const msgMatch = line.match(/PRIVMSG #\S+ :(.*)$/);
    const text = msgMatch?.[1] || "";
    const isMod = tags["mod"] === "1" || tags["badges"]?.includes("broadcaster");
    const isSub = tags["subscriber"] === "1" || tags["badges"]?.includes("subscriber");
    const userId = tags["user-id"];
    const role = user.toLowerCase() === this.env.BOT_LOGIN.toLowerCase() ? "bot" : isMod ? "moderator" : isSub ? "subscriber" : "viewer";

    const cfg = await this.getConfig();
    if (!cfg.enabled) return;

    if (userId && user.toLowerCase() !== "zaka_00") {
      const blacklist: any[] = (await this.env.TOKENS.get("global:blacklist", "json")) || [];
      const hit = blacklist.find((b) => b.username.toLowerCase() === user.toLowerCase());
      if (hit) {
        this.pushLog({ user, role, action: "ban", text, reason: hit.reason || "чёрный список платформы" });
        await this.timeoutUser(userId, null, hit.reason || "чёрный список платформы");
        return;
      }
    }

    const override = (cfg.userOverrides || []).find((o) => o.username.toLowerCase() === user.toLowerCase());
    if (override?.mode === "always-ban" && userId) {
      this.pushLog({ user, role, action: "ban", text, reason: override.reason || "чёрный список канала" });
      await this.timeoutUser(userId, null, override.reason || "чёрный список канала");
      return;
    }
    const isExempt = override?.mode === "exempt";

    if (!isMod && !isExempt) {
      const hit = await this.moderate(text, cfg, user, tags);
      const ruleExempt = hit ? (cfg.ruleExemptions?.[hit.rule] || []).some((u) => u.toLowerCase() === user.toLowerCase()) : false;
      if (hit && userId && !ruleExempt) {
        this.pushLog({ user, role, action: "deleted", text, reason: hit.reason });
        const ruleAction = cfg.ruleActions?.[hit.rule] ?? (hit.rule === "banned-words" ? "ban" : "default");
        if (ruleAction && ruleAction !== "default") {
          await this.applyExplicitAction(ruleAction, hit.rule, user, userId, hit.reason, cfg, tags["id"] || null);
        } else {
          await this.applyModerationAction(user, userId, hit.reason, cfg, tags["id"] || null);
        }
        return;
      }
    }

    this.pushLog({ user, role, action: "message", text, twitchMsgId: tags["id"] });
    this.broadcastChat({
      id: crypto.randomUUID(),
      user,
      role,
      text,
      color: tags["color"] || null,
      badges: tags["badges"] || "",
      ts: Date.now(),
    });

    if (text.startsWith("!")) {
      const parts = text.trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const hasArg = parts.length > 1;
      console.log(`[cmd] "${cmd}" from ${user} on #${this.login}, full text: ${text}`);
      let customTrigger = (cfg.songRequestCommand || "").trim().toLowerCase();
      if (customTrigger && !customTrigger.startsWith("!")) customTrigger = "!" + customTrigger;
      const isRequest = cmd === "!sr" || cmd === "!songrequest" || (customTrigger && cmd === customTrigger) || (cmd === "!song" && hasArg);
      if (cmd === "!vl") {
        await this.handleVoiceLine(text, user);
      } else if (isRequest) {
        await this.handleSongRequest(text, user, !!isMod, !!isSub, cfg, tags["id"] || null);
      } else {
        await this.runCommand(cmd, user, cfg, tags["id"] || null);
      }
    }
  }

  // Returns which rule matched (`rule` is the same key the Moderation page
  // uses for its per-rule cards) alongside the human-readable reason, so the
  // caller can look up cfg.ruleActions[rule] and decide whether to escalate
  // normally or apply that rule's own explicit action.
  private async moderate(text: string, cfg: ChannelConfig, user: string, tags: Record<string, string>): Promise<{ reason: string; rule: string } | null> {
    if (user.toLowerCase() === "zaka_00") return null;
    const lower = text.toLowerCase();
    for (const word of cfg.bannedWords || []) {
      if (word && lower.includes(word.toLowerCase())) return { reason: "запрещённое слово", rule: "banned-words" };
    }
    if (cfg.linksMode !== "off" && /(https?:\/\/|www\.)\S+/i.test(text)) {
      const isAllowedLink = /(?:youtube\.com|youtu\.be|clips\.twitch\.tv)/i.test(text);
      if (!isAllowedLink) {
        if (cfg.linksMode === "mods-only") return { reason: "ссылки запрещены", rule: "links-block" };
        if (cfg.linksMode === "subs-only") {
          const isSubTag = tags["subscriber"] === "1" || tags["badges"]?.includes("subscriber");
          if (!isSubTag) return { reason: "ссылки только для подписчиков", rule: "links-subs" };
        }
      }
    }
    if (cfg.capsMode && text.length > 10) {
      const letters = text.replace(/[^a-zA-Zа-яА-Я]/g, "");
      const caps = text.replace(/[^A-ZА-Я]/g, "");
      if (letters.length > 0 && caps.length / letters.length > 0.7) return { reason: "капс", rule: "caps" };
    }
    if (cfg.isPro) {
      const last = this.lastMsgByUser.get(user.toLowerCase());
      this.lastMsgByUser.set(user.toLowerCase(), { text, ts: Date.now() });
      if (cfg.proDuplicateCheck !== false && last && last.text === text && Date.now() - last.ts < 30000) {
        return { reason: "повтор сообщения", rule: "spam" };
      }
      if (cfg.proMentionSpamCheck !== false) {
        const mentionCount = (text.match(/@\w+/g) || []).length;
        if (mentionCount >= 4) return { reason: "спам упоминаниями", rule: "mention-spam" };
      }
      if (cfg.proEmoteFloodCheck !== false) {
        const emotesTag = tags["emotes"] || "";
        const emoteCount = emotesTag ? emotesTag.split("/").reduce((n, part) => n + part.split(",").length, 0) : 0;
        if (emoteCount >= 8) return { reason: "флуд эмодзи", rule: "emote-flood" };
      }
      if (cfg.proInsultsCheck !== false) {
        let flagged = false;
        for (const word of INSULT_WORDS) {
          if (lower.includes(word)) {
            flagged = true;
            break;
          }
        }
        if (!flagged) flagged = await this.checkToxicityAI(text);
        if (flagged) return { reason: "оскорбление", rule: "insults" };
      }
    }
    return null;
  }

  // Real content-safety classification via Meta's Llama Guard 3 (Cloudflare
  // Workers AI), not a hand-written word list — genuine model inference.
  // Only ever called for Pro channels with the insults rule on, and only
  // when the instant word-list pass above found nothing, to keep both
  // latency and Workers AI usage down. Fails open (never flags) on any
  // error or timeout — a slow/unavailable model must never itself become a
  // way to freeze up chat moderation.
  private async checkToxicityAI(text: string): Promise<boolean> {
    try {
      const result: any = await Promise.race([
        this.env.AI.run("@cf/meta/llama-guard-3-8b" as any, { messages: [{ role: "user", content: text }] } as any),
        new Promise((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 4000)),
      ]);
      const raw = String(result?.response ?? "").trim().toLowerCase();
      return raw.startsWith("unsafe");
    } catch (e) {
      console.log(`[toxicity-ai] error/timeout, failing open: ${e}`);
      return false;
    }
  }

  private async runCommand(cmd: string, user: string, cfg: ChannelConfig, viewerMsgId: string | null): Promise<void> {
    const reply = (cfg.commands || {})[cmd];
    if (!reply) return;
    let text: string;
    if (reply === "__uptime__") {
      text = this.streamStart
        ? (() => {
            const mins = Math.floor((Date.now() - this.streamStart!) / 60000);
            return `Стрим идёт ${Math.floor(mins / 60)} ч ${mins % 60} мин.`;
          })()
        : "Стрим сейчас не идёт.";
    } else if (reply === "__song__") {
      const np = cfg.nowPlaying;
      text = np ? `Сейчас играет: ${np.title}` : "Сейчас ничего не играет.";
    } else {
      text = reply;
    }
    const botMsgId = await this.sayAndGetId(text);
    this.scheduleMessageDeletion([botMsgId, viewerMsgId], COMMAND_AUTO_DELETE_SECONDS);
  }

  // "!vl <текст>" — reads the text aloud through the chat widget in OBS,
  // using the browser's real built-in speech synthesis (no external TTS
  // service, no fake "AI voice" claims). Restricted to the platform
  // superadmin only, on every channel — not a per-streamer setting, so
  // this stays a hardcoded login check rather than a ChannelConfig field.
  private async handleVoiceLine(text: string, user: string): Promise<void> {
    if (user.toLowerCase() !== "zaka_00") return;
    const message = text.trim().split(/\s+/).slice(1).join(" ").trim();
    if (!message) {
      await this.say(`@${user} укажи текст: !vl <текст>`);
      return;
    }
    this.broadcastChat({ type: "speak", text: message, user });
  }

  // Real "!sr <youtube link>" chat command — viewers can queue a track
  // themselves, matching what the Music page already promises. Fetches
  // actual metadata from YouTube (no fake/guessed title), then persists
  // straight into the same queue the dashboard and OBS widget read from.
  private async handleSongRequest(
    text: string,
    user: string,
    isMod: boolean,
    isSub: boolean,
    cfg: ChannelConfig,
    viewerMsgId: string | null
  ): Promise<void> {
    console.log(`[sr] called with text: ${text}`);
    const isPrivileged = isMod || user.toLowerCase() === "zaka_00";
    if (!cfg.isPro) {
      await this.say(`@${user} заказ музыки доступен только на каналах с Pro-подпиской.`);
      return;
    }
    if (cfg.songSubsOnly && !isPrivileged && !isSub) {
      await this.say(`@${user} заказ треков доступен только подписчикам канала.`);
      return;
    }
    const cooldownSec = cfg.songRequestCooldownSeconds ?? 45;
    if (!isPrivileged && cooldownSec > 0) {
      const key = user.toLowerCase();
      const last = this.lastSongRequestByUser.get(key);
      const now = Date.now();
      if (last && now - last < cooldownSec * 1000) {
        const waitSec = Math.ceil((cooldownSec * 1000 - (now - last)) / 1000);
        await this.say(`@${user} подожди ещё ${waitSec} сек. перед следующим заказом трека.`);
        return;
      }
    }
    const m = text.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
    let videoId = m ? m[1] : null;
    if (!videoId && isYandexMusicLink(text)) {
      await this.say(`@${user} Яндекс.Музыка пока не поддерживается — пришли ссылку с YouTube или Spotify.`);
      return;
    }
    if (!videoId && isSpotifyTrackLink(text)) {
      const query = await resolveSpotifyTrackTitle(text);
      if (query) {
        try {
          const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
          searchUrl.searchParams.set("part", "snippet");
          searchUrl.searchParams.set("type", "video");
          searchUrl.searchParams.set("videoCategoryId", "10");
          searchUrl.searchParams.set("maxResults", "1");
          searchUrl.searchParams.set("q", query);
          searchUrl.searchParams.set("key", this.env.YOUTUBE_API_KEY);
          const searchRes = await fetchWithTimeout(searchUrl.toString());
          if (searchRes.ok) {
            const searchData: any = await searchRes.json();
            videoId = searchData.items?.[0]?.id?.videoId || null;
          }
        } catch {
          // fall through to the "couldn't find a link" reply below
        }
      }
      if (!videoId) {
        await this.say(`@${user} не нашёл на YouTube трек из этой ссылки Spotify.`);
        return;
      }
    }
    console.log(`[sr] extracted videoId: ${videoId}`);
    if (!videoId) {
      await this.say(`@${user} укажи ссылку на YouTube-видео или трек Spotify: !sr https://youtube.com/watch?v=...`);
      return;
    }
    try {
      const ytUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      ytUrl.searchParams.set("part", "snippet,contentDetails,statistics");
      ytUrl.searchParams.set("id", videoId);
      ytUrl.searchParams.set("key", this.env.YOUTUBE_API_KEY);
      const res = await fetchWithTimeout(ytUrl.toString());
      const data: any = await res.json();
      console.log(`[sr] youtube api response: ${JSON.stringify(data).slice(0, 300)}`);
      const v = data.items?.[0];
      if (!v) {
        await this.say(`@${user} не нашёл такое видео на YouTube.`);
        return;
      }
      const durationSec = parseIso8601Duration(v.contentDetails?.duration || "");
      if (!isPrivileged) {
        const views = Number(v.statistics?.viewCount || 0);
        const channelTitle = v.snippet.channelTitle || "";
        const maxDurationMin = cfg.songMaxDurationMin ?? 0;
        if (maxDurationMin > 0 && durationSec > maxDurationMin * 60) {
          const mins = Math.floor(durationSec / 60);
          const secs = durationSec % 60;
          await this.say(`@${user} видео длится ${mins}:${String(secs).padStart(2, "0")} — дольше лимита в ${maxDurationMin} мин.`);
          return;
        }
        const minViews = cfg.songMinViews ?? 0;
        if (minViews > 0 && views < minViews) {
          await this.say(`@${user} у видео всего ${views} просмотров — меньше порога в ${minViews}.`);
          return;
        }
        if (cfg.songMusicCategoryOnly && v.snippet.categoryId !== "10") {
          await this.say(`@${user} категория видео на YouTube не «Музыка» — запрос отклонён.`);
          return;
        }
        const blocked = (cfg.songBlockedChannels || []).find((b) => channelTitle.toLowerCase().includes(b.toLowerCase()));
        if (blocked) {
          await this.say(`@${user} канал «${channelTitle}» в чёрном списке — запрос отклонён.`);
          return;
        }
      }
      const freshCfg = await this.getConfig();
      freshCfg.queue = freshCfg.queue || [];
      const entry: Track = {
        // Real unique id — two requests for the same song (a common case,
        // e.g. a track requested twice) used to collide on url/title alone,
        // so removing/skipping one queue entry silently removed every
        // duplicate of it too. crypto.randomUUID() guarantees each queue
        // entry is distinct regardless of what was requested.
        id: crypto.randomUUID(),
        title: `${v.snippet.title} — ${v.snippet.channelTitle}`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || "",
        queuedBy: user,
        durationSec: durationSec > 0 ? durationSec : undefined,
      };
      const confirmMsg = !freshCfg.nowPlaying
        ? `@${user} включил: ${v.snippet.title}`
        : `@${user} добавил в очередь (№${freshCfg.queue.length + 1}): ${v.snippet.title}`;
      freshCfg.playbackStopped = false;
      if (!freshCfg.nowPlaying) {
        freshCfg.paused = false;
        freshCfg.pausedAt = undefined;
        freshCfg.nowPlaying = entry;
        freshCfg.nowPlayingStartedAt = new Date().toISOString();
        freshCfg.nowPlayingDurationSec = entry.durationSec;
      } else {
        freshCfg.queue.push(entry);
      }
      await this.env.TOKENS.put(`channel:${this.login}`, JSON.stringify(freshCfg));
      this.lastSongRequestByUser.set(user.toLowerCase(), Date.now());
      const autoDeleteSec = cfg.songRequestAutoDeleteSeconds ?? 0;
      if (autoDeleteSec > 0) {
        const botMsgId = await this.sayAndGetId(confirmMsg);
        this.scheduleMessageDeletion([botMsgId, viewerMsgId], autoDeleteSec);
      } else {
        await this.say(confirmMsg);
      }
    } catch {
      await this.say(`@${user} не получилось добавить трек — попробуй ещё раз позже.`);
    }
  }

  // seconds omitted/null = permanent ban (Twitch's own convention for this
  // endpoint — the same call, just without a duration).
  private async timeoutUser(userId: string, seconds: number | null, reason: string): Promise<void> {
    const token = await getBotToken(this.env);
    const bot = await getUserByLogin(this.env, this.env.BOT_LOGIN, token, this.env.BOT_CLIENT_ID);
    const broadcaster = await getUserByLogin(this.env, this.login, token, this.env.BOT_CLIENT_ID);
    if (!bot || !broadcaster) return;
    const data: any = { user_id: userId, reason };
    if (seconds != null) data.duration = seconds;
    await helix(
      this.env,
      `/moderation/bans?broadcaster_id=${broadcaster.id}&moderator_id=${bot.id}`,
      token,
      { method: "POST", body: JSON.stringify({ data }) },
      this.env.BOT_CLIENT_ID
    );
  }

  // Real escalation policy — "Предупреждения и баны" on the Moderation
  // page. Tracks two separate counters per viewer: total violations (for
  // the warning grace period) and how many times they've actually been
  // timed out (for the eventual permanent ban). An explicit non-"warn"
  // "Первое нарушение" setting overrides everything and fires immediately
  // on the very first offense — a deliberate zero-tolerance option.
  private async applyModerationAction(user: string, userId: string, reason: string, cfg: ChannelConfig, msgId: string | null): Promise<void> {
    const key = user.toLowerCase();
    const violations = (this.violationCountByUser.get(key) || 0) + 1;
    this.violationCountByUser.set(key, violations);
    const warnBefore = Math.max(0, cfg.warningsBeforeTimeout ?? 2);
    const timeoutMin = Math.max(1, cfg.timeoutDurationMin ?? 10);
    const banAfterTimeouts = Math.max(1, cfg.banAfterViolations ?? 3);
    const firstAction = cfg.firstViolationAction ?? "warn";

    if (violations === 1 && firstAction !== "warn") {
      if (firstAction === "ban") {
        await this.timeoutUser(userId, null, reason);
        this.pushLog({ user, role: "viewer", action: "ban", text: "", reason });
        await this.say(`@${user} забанен (${reason}).`);
      } else {
        await this.timeoutUser(userId, timeoutMin * 60, reason);
        this.pushLog({ user, role: "viewer", action: "timeout", text: "", reason });
        await this.say(`@${user} тайм-аут ${timeoutMin} мин. (${reason}).`);
      }
      return;
    }
    if (violations <= warnBefore) {
      if (msgId) await this.deleteMessage(msgId);
      await this.say(`@${user} предупреждение (${violations}/${warnBefore}): ${reason}.`);
      return;
    }
    const timeouts = (this.timeoutCountByUser.get(key) || 0) + 1;
    this.timeoutCountByUser.set(key, timeouts);
    if (timeouts >= banAfterTimeouts) {
      await this.timeoutUser(userId, null, reason);
      this.pushLog({ user, role: "viewer", action: "ban", text: "", reason });
      await this.say(`@${user} забанен после повторных нарушений (${reason}).`);
    } else {
      await this.timeoutUser(userId, timeoutMin * 60, reason);
      this.pushLog({ user, role: "viewer", action: "timeout", text: "", reason });
      await this.say(`@${user} тайм-аут ${timeoutMin} мин. (${reason}).`);
    }
  }

  // One-shot action for a rule with its own explicit override set (see
  // ruleActions) — no escalation, no violation counters, just exactly the
  // chosen punishment every time that specific rule matches. `rule` is used
  // to look up that rule's own timeout duration (cfg.ruleDurations, set via
  // "Настроить" on the Moderation page) — falls back to the shared
  // "Длительность тайм-аута" setting when the streamer hasn't overridden it
  // for this specific rule.
  private async applyExplicitAction(
    action: string,
    rule: string,
    user: string,
    userId: string,
    reason: string,
    cfg: ChannelConfig,
    msgId: string | null
  ): Promise<void> {
    if (action === "warn") {
      if (msgId) await this.deleteMessage(msgId);
      await this.say(`@${user} предупреждение: ${reason}.`);
      return;
    }
    if (action === "ban") {
      await this.timeoutUser(userId, null, reason);
      this.pushLog({ user, role: "viewer", action: "ban", text: "", reason });
      await this.say(`@${user} забанен (${reason}).`);
      return;
    }
    const timeoutMin = Math.max(1, cfg.ruleDurations?.[rule] ?? cfg.timeoutDurationMin ?? 10);
    await this.timeoutUser(userId, timeoutMin * 60, reason);
    this.pushLog({ user, role: "viewer", action: "timeout", text: "", reason });
    await this.say(`@${user} тайм-аут ${timeoutMin} мин. (${reason}).`);
  }
}
