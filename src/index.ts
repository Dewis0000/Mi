// Main Worker entry point: HTTP routing for the dashboard API, the six OBS
// widget pages, Twitch/DonationAlerts OAuth, the Twitch EventSub webhook,
// and the admin panel. Falls through to the static assets binding (the
// built dashboard SPA) for anything not recognized as an API/widget route.
// Also re-exports TwitchBotDO so wrangler can resolve the BOT Durable
// Object binding from this module.

import type { Env, Session, Track } from "./types";
import { fetchWithTimeout, helix, getBotToken, getBroadcasterToken, getAppAccessToken, getUserByLogin, signSession, verifySession, getCookie } from "./twitch";
import { TwitchBotDO } from "./bot";

export { TwitchBotDO };

const SCOPES = [
  "user:read:email",
  "channel:manage:broadcast",
  "channel:manage:moderators",
  "moderator:manage:banned_users",
  "channel:read:subscriptions",
  "moderator:read:followers",
  // For pointauc-style auctions: creating/reading the "Ставка на аукционе"
  // Channel Points reward and its redemptions. Only applies going forward —
  // an account that logged in before this was added needs to log in again
  // (force_verify already does this) before points-currency auctions work
  // for them; there is no way to add a scope to an already-issued token.
  "channel:manage:redemptions",
  "channel:read:redemptions",
  // For the real "Очистить чат" / "Только эмодзи" controls on the
  // dashboard — requires the BOT's own token to carry these (granted via
  // the superadmin bot-reauth flow, which requests `${SCOPES} chat:read
  // chat:edit`); until that's re-run, Twitch will 401 on those calls and
  // that's surfaced honestly rather than silently doing nothing.
  "moderator:manage:chat_messages",
  "moderator:manage:chat_settings",
].join(" ");

function botStub(env: Env, login: string): DurableObjectStub {
  const id = env.BOT.idFromName(login.toLowerCase());
  return env.BOT.get(id);
}

async function requireSession(req: Request, env: Env): Promise<Session | null> {
  const token = getCookie(req, "streops_session");
  if (!token) return null;
  return verifySession(env, token);
}

async function requireActiveSession(req: Request, env: Env): Promise<Session | null> {
  const session = await requireSession(req, env);
  if (!session) return null;
  const cfg: any = await env.TOKENS.get(`channel:${session.login}`, "json");
  if (cfg?.banned) return null;
  return session;
}

const SUPERADMIN_LOGIN = "zaka_00";

async function requireAdmin(req: Request, env: Env): Promise<Session | null> {
  const session = await requireSession(req, env);
  if (!session) return null;
  if (session.login?.toLowerCase() === SUPERADMIN_LOGIN) return session;
  const cfg: any = await env.TOKENS.get(`channel:${session.login}`, "json");
  if (cfg?.isAdmin) return session;
  return null;
}

async function requireSuperAdmin(req: Request, env: Env): Promise<Session | null> {
  const session = await requireSession(req, env);
  if (!session || session.login?.toLowerCase() !== SUPERADMIN_LOGIN) return null;
  return session;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// /admin-login — the password-based superadmin entry point (bypasses Twitch
// OAuth entirely). SECURITY NOTE: the deployed version of this code had
// ADMIN_LOGIN_EMAIL/ADMIN_LOGIN_PASSWORD as hardcoded string literals right
// here, which meant the password sat in plain text in the compiled Worker
// bundle (`wrangler` deploys the built script itself, and anyone who can
// read that script back — e.g. via the Cloudflare API/dashboard — could
// read it in cleartext). Both now come from Env: ADMIN_LOGIN_EMAIL is fine
// as a plain var, ADMIN_LOGIN_PASSWORD must be set as a secret
// (`wrangler secret put ADMIN_LOGIN_PASSWORD`) and has no default.
async function handleAdminPasswordLogin(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const lockKey = `admin-login-fails:${ip}`;
  const fails: number = (await env.TOKENS.get(lockKey, "json")) || 0;
  if (fails >= 5) {
    return Response.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const body: any = await req.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const ok = timingSafeEqual(email, env.ADMIN_LOGIN_EMAIL) && timingSafeEqual(password, env.ADMIN_LOGIN_PASSWORD);
  if (!ok) {
    await env.TOKENS.put(lockKey, JSON.stringify(fails + 1), { expirationTtl: 15 * 60 });
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }
  await env.TOKENS.delete(lockKey);
  const session = await signSession(env, {
    login: SUPERADMIN_LOGIN,
    displayName: "Admin",
    id: "admin-login",
    avatar: "",
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Set-Cookie": `streops_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    try {
      if (p === "/api/auth/twitch/login") {
        console.log("[login] hit");
        return handleLogin(req, env, url);
      }
      if (p === "/api/auth/twitch/callback") return handleCallback(req, env, url);
      if (p === "/api/auth/admin-login" && req.method === "POST") return handleAdminPasswordLogin(req, env);
      if (p === "/api/admin/bot-reauth/start") return handleBotReauthStart(req, env, url);
      if (p === "/api/admin/bot-reauth/callback") return handleBotReauthCallback(req, env, url);
      if (p === "/api/auth/donationalerts/login") return handleDonationAlertsLogin(req, env, url);
      if (p === "/api/auth/donationalerts/callback") return handleDonationAlertsCallback(req, env, url);
      if (p === "/api/donationalerts/disconnect" && req.method === "POST") return handleDonationAlertsDisconnect(req, env);
      if (p === "/api/donationalerts/status") return handleDonationAlertsStatus(req, env);
      if (p === "/api/donationalerts/stats") return handleDonationAlertsStats(req, env);
      if (p === "/api/donationalerts/latest") return handleDonationAlertsLatest(req, env);
      if (p === "/api/donationalerts/media" && req.method === "POST") return handleMediaUpload(req, env);
      if (p === "/api/donationalerts/media") return handleMediaList(req, env);
      if (p === "/api/donationalerts/media/delete" && req.method === "POST") return handleMediaDelete(req, env);
      if (p === "/api/donationalerts/goal" && req.method === "POST") return handleDonationGoalSave(req, env);
      if (p === "/api/donationalerts/goal") return handleDonationGoalGet(req, env);
      if (p === "/api/donationalerts/goal-public") return handleDonationGoalPublic(req, env);
      if (p.startsWith("/media/")) return handleMediaServe(req, env, p.slice("/media/".length));
      if (p === "/api/auctions" && req.method === "POST") return handleAuctionCreate(req, env);
      if (p === "/api/auctions") return handleAuctionsList(req, env);
      if (p === "/api/auctions/start" && req.method === "POST") return handleAuctionStart(req, env);
      if (p === "/api/auctions/end" && req.method === "POST") return handleAuctionEnd(req, env);
      if (p === "/api/auctions/delete" && req.method === "POST") return handleAuctionDelete(req, env);
      if (p === "/api/auctions/option" && req.method === "POST") return handleAuctionOptionOp(req, env);
      if (p === "/api/auctions/public") return handleAuctionPublicStatus(req, env);
      if (p === "/api/auctions/reward-status") return handleAuctionRewardStatus(req, env);
      if (p === "/api/auctions/reward-setup" && req.method === "POST") return handleAuctionRewardSetup(req, env);
      if (p === "/webhooks/twitch/eventsub" && req.method === "POST") return handleTwitchEventSubWebhook(req, env);
      if (p === "/api/auth/logout") return handleLogout();
      if (p === "/api/me") return handleMe(req, env);
      if (p === "/api/bot/start" && req.method === "POST") return handleBotAction(req, env, "start");
      if (p === "/api/bot/stop" && req.method === "POST") return handleBotAction(req, env, "stop");
      if (p === "/api/bot/clear-chat" && req.method === "POST") return handleClearChat(req, env);
      if (p === "/api/bot/ban-user" && req.method === "POST") return handleBotBanUser(req, env);
      if (p === "/api/bot/unban-user" && req.method === "POST") return handleBotUnbanUser(req, env);
      if (p === "/api/bot/emote-only" && req.method === "POST") return handleEmoteOnly(req, env);
      if (p === "/api/bot/status") return handleBotStatus(req, env);
      if (p === "/api/bot/config" && req.method === "POST") return handleBotConfig(req, env);
      if (p === "/api/bot/logs") return handleBotLogs(req, env);
      if (p === "/api/bot/logs/clear" && req.method === "POST") return handleBotLogsClear(req, env);
      if (p === "/api/channel/stats") return handleChannelStats(req, env);
      if (p === "/api/admin/users") return handleAdminUsers(req, env);
      if (p === "/api/admin/pro" && req.method === "POST") return handleAdminSetPro(req, env);
      if (p === "/api/admin/tier" && req.method === "POST") return handleAdminSetTier(req, env);
      if (p === "/api/admin/grant-admin" && req.method === "POST") return handleAdminGrantAdmin(req, env);
      if (p === "/api/admin/ban" && req.method === "POST") return handleAdminBan(req, env);
      if (p === "/api/admin/reconnect" && req.method === "POST") return handleAdminReconnect(req, env);
      if (p === "/api/admin/test-message" && req.method === "POST") return handleAdminTestMessage(req, env);
      if (p === "/api/admin/unlink" && req.method === "POST") return handleAdminUnlink(req, env);
      if (p === "/api/admin/ban-chat-user" && req.method === "POST") return handleAdminBanChatUser(req, env);
      if (p === "/api/admin/unban-chat-user" && req.method === "POST") return handleAdminUnbanChatUser(req, env);
      if (p === "/api/admin/blacklist" && req.method === "POST") return handleAdminBlacklistAdd(req, env);
      if (p === "/api/admin/blacklist" && req.method === "DELETE") return handleAdminBlacklistRemove(req, env);
      if (p === "/api/admin/blacklist") return handleAdminBlacklistList(req, env);
      if (p === "/api/admin/notify" && req.method === "POST") return handleAdminNotify(req, env);
      if (p === "/api/admin/announce/list") return handleAnnounceList(req, env);
      if (p === "/api/admin/announce/create" && req.method === "POST") return handleAnnounceCreate(req, env);
      if (p === "/api/admin/announce/delete" && req.method === "POST") return handleAnnounceDelete(req, env);
      if (p === "/api/admin/announce/send" && req.method === "POST") return handleAnnounceSend(req, env);
      if (p === "/api/notifications") return handleNotificationsGet(req, env);
      if (p === "/api/notifications/read" && req.method === "POST") return handleNotificationsRead(req, env);
      if (p === "/api/youtube/search") return handleYoutubeSearch(req, env);
      if (p === "/api/youtube/video") return handleYoutubeVideo(req, env);
      if (p === "/api/youtube/resolve-link") return handleYoutubeResolveLink(req, env);
      if (p === "/api/queue" && req.method === "POST") return handleQueueAdd(req, env);
      if (p === "/api/queue/advance" && req.method === "POST") return handleQueueAdvance(req, env);
      if (p === "/api/queue/stop" && req.method === "POST") return handleQueueStop(req, env);
      if (p === "/api/queue/pause" && req.method === "POST") return handleQueuePause(req, env);
      if (p === "/api/queue/observed-duration" && req.method === "POST") return handleQueueObservedDuration(req, env);
      if (p === "/api/queue") return handleQueueGet(req, env);
      if (p === "/api/playlist" && req.method === "POST") return handlePlaylistAdd(req, env);
      if (p === "/api/playlist" && req.method === "DELETE") return handlePlaylistRemove(req, env);
      if (p === "/api/playlist/settings" && req.method === "POST") return handlePlaylistSettings(req, env);
      if (p === "/api/widget-settings" && req.method === "POST") return handleWidgetSettingsSave(req, env);
      if (p === "/api/widget-settings") return handleWidgetSettingsGet(req, env);
      if (p === "/api/announce/get") return handleAnnounceGet(req, env);
      if (p === "/widget/chat-stream") {
        const login = url.searchParams.get("channel") || "";
        if (!login) return new Response("channel required", { status: 400 });
        const stub = botStub(env, login);
        return stub.fetch(req);
      }
      if (p.startsWith("/widget/")) return handleWidget(req, env, p);
    } catch (err: any) {
      console.log("[fetch] UNCAUGHT ERROR on", p, ":", err.stack || err.message || String(err));
      return Response.json({ error: err.message || String(err) }, { status: 500 });
    }
    return env.ASSETS.fetch(req);
  },

  // Every 2 minutes: for every channel with the bot enabled, check live
  // status via Helix and start/stop the Durable Object accordingly.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sweepChannels(env));
  },
};

async function sweepChannels(env: Env): Promise<void> {
  const list = await env.TOKENS.list({ prefix: "channel:" });
  if (list.keys.length === 0) return;
  const logins: string[] = [];
  for (const key of list.keys) {
    const login = key.name.replace("channel:", "");
    if (login.includes(":")) continue;
    const cfg: any = await env.TOKENS.get(key.name, "json");
    if (cfg?.enabled) logins.push(login);
  }
  if (logins.length === 0) return;
  const liveLogins = new Set<string>();
  let liveCheckOk = false;
  try {
    const token = await getBotToken(env);
    const qs = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
    const res = await helix(env, `/streams?${qs}`, token, {}, env.BOT_CLIENT_ID);
    if (res.ok) {
      const data: any = await res.json();
      for (const s of data.data || []) liveLogins.add(String(s.user_login).toLowerCase());
      liveCheckOk = true;
    } else {
      console.log(`[sweep] helix /streams failed: ${res.status} ${await res.text()}`);
    }
  } catch (err: any) {
    console.log(`[sweep] helix /streams threw: ${err?.stack || err?.message || String(err)}`);
  }
  if (!liveCheckOk) return;
  for (const login of logins) {
    const stub = botStub(env, login);
    if (liveLogins.has(login.toLowerCase())) {
      await stub.fetch(`https://do/start?login=${encodeURIComponent(login)}`);
    } else {
      await stub.fetch(`https://do/stop?login=${encodeURIComponent(login)}`);
    }
  }
}

function handleLogin(req: Request, env: Env, url: URL): Response {
  const redirectUri = `${url.origin}/api/auth/twitch/callback`;
  const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authUrl.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("force_verify", "true");
  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(req: Request, env: Env, url: URL): Promise<Response> {
  console.log("[callback] hit, full url:", url.toString());
  const code = url.searchParams.get("code");
  const errParam = url.searchParams.get("error");
  console.log("[callback] code present:", !!code, "error param:", errParam);
  const failRedirect = () => Response.redirect(`${url.origin}/auth/complete?ok=0`, 302);
  if (!code) {
    console.log("[callback] FAIL: no code, bailing");
    return failRedirect();
  }
  const redirectUri = `${url.origin}/api/auth/twitch/callback`;
  const tokenRes = await fetchWithTimeout("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  console.log("[callback] token exchange status:", tokenRes.status);
  if (!tokenRes.ok) {
    console.log("[callback] FAIL: token exchange body:", await tokenRes.text());
    return failRedirect();
  }
  const tokenData: any = await tokenRes.json();
  console.log("[callback] got access_token:", !!tokenData.access_token);
  const userRes = await helix(env, "/users", tokenData.access_token);
  const userData: any = await userRes.json();
  const user = userData.data?.[0];
  console.log("[callback] user resolved:", user ? user.login : "NONE", "helix status:", userRes.status);
  if (!user) {
    console.log("[callback] FAIL: no user, raw userData:", JSON.stringify(userData));
    return failRedirect();
  }
  await env.TOKENS.put(
    `user:${user.login}`,
    JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token }),
    { expirationTtl: 60 * 60 * 24 * 90 }
  );
  console.log("[callback] KV user: written for", user.login);
  const existing = await env.TOKENS.get(`channel:${user.login}`);
  if (!existing) {
    await env.TOKENS.put(
      `channel:${user.login}`,
      JSON.stringify({
        enabled: true,
        bannedWords: [],
        linksMode: "mods-only",
        capsMode: true,
        commands: { "!uptime": "__uptime__", "!song": "__song__" },
        nowPlaying: null,
        queue: [],
      })
    );
  }
  try {
    const botToken = await getBotToken(env);
    const botUser = await getUserByLogin(env, env.BOT_LOGIN, botToken, env.BOT_CLIENT_ID);
    if (botUser) {
      await helix(env, `/moderation/moderators?broadcaster_id=${user.id}&user_id=${botUser.id}`, tokenData.access_token, { method: "POST" });
    }
  } catch {
    // best-effort — the streamer can always /mod the bot manually if this fails
  }
  try {
    const stub = botStub(env, user.login);
    await stub.fetch(`https://do/start?login=${encodeURIComponent(user.login)}`);
  } catch {
    // best-effort — the periodic sweepChannels() sweep will pick it up if the stream is live
  }
  const session = await signSession(env, {
    login: user.login,
    displayName: user.display_name,
    id: user.id,
    avatar: user.profile_image_url,
  });
  console.log("[callback] SUCCESS: redirecting to /auth/complete?ok=1 for", user.login);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/auth/complete?ok=1",
      "Set-Cookie": `streops_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
}

// Superadmin-only: re-authenticates the BOT's own Twitch account (not a
// streamer's), requesting the extra chat:read/chat:edit scopes the bot
// needs for real chat moderation. Twitch tokens can't gain scopes after
// the fact, so this is the only way to widen what the bot's token can do.
async function handleBotReauthStart(req: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireSuperAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const redirectUri = `${url.origin}/api/admin/bot-reauth/callback`;
  const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  authUrl.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", `${SCOPES} chat:read chat:edit`);
  authUrl.searchParams.set("force_verify", "true");
  return Response.redirect(authUrl.toString(), 302);
}

async function handleBotReauthCallback(req: Request, env: Env, url: URL): Promise<Response> {
  const admin = await requireSuperAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const code = url.searchParams.get("code");
  if (!code) return Response.json({ error: "no code from Twitch" }, { status: 400 });
  const redirectUri = `${url.origin}/api/admin/bot-reauth/callback`;
  const tokenRes = await fetchWithTimeout("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return Response.json({ error: "token exchange failed", detail: await tokenRes.text() }, { status: 502 });
  }
  const tokenData: any = await tokenRes.json();
  const userRes = await helix(env, "/users", tokenData.access_token);
  const userData: any = await userRes.json();
  const user = userData.data?.[0];
  if (!user || user.login.toLowerCase() !== env.BOT_LOGIN.toLowerCase()) {
    return Response.json(
      {
        error: "wrong_account",
        message: `Вошли как "${user?.login || "неизвестно"}", а нужен аккаунт бота "${env.BOT_LOGIN}". Выйдите из этого аккаунта на twitch.tv и попробуйте снова.`,
      },
      { status: 400 }
    );
  }
  await env.TOKENS.put("bot:token", JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token }));
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0b0b0f;color:#fff;padding:40px;max-width:640px;margin:0 auto;line-height:1.6"><h1 style="color:#34d399">Готово — бот переподключён под наше приложение</h1><p>Токен для <b>${user.login}</b> сохранён и теперь будет обновляться автоматически.</p><p><b>Остался один ручной шаг:</b> обновите секрет <code>BOT_CLIENT_ID</code>, установив в него значение <code>TWITCH_CLIENT_ID</code> (<code>wrangler secret put BOT_CLIENT_ID</code>) — иначе Helix-запросы бота продолжат уходить со старым Client-Id и будут отклоняться.</p></body>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

const DONATIONALERTS_SCOPES = "oauth-user-show oauth-donation-subscribe oauth-donation-index";

async function handleDonationAlertsLogin(req: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.redirect(`${url.origin}/auth`, 302);
  const redirectUri = `${url.origin}/api/auth/donationalerts/callback`;
  const authUrl = new URL("https://www.donationalerts.com/oauth/authorize");
  authUrl.searchParams.set("client_id", env.DONATIONALERTS_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DONATIONALERTS_SCOPES);
  authUrl.searchParams.set("state", session.login);
  return Response.redirect(authUrl.toString(), 302);
}

async function handleDonationAlertsCallback(req: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.redirect(`${url.origin}/auth`, 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const failRedirect = (reason: string) => Response.redirect(`${url.origin}/dashboard/profile?donationalerts=error&reason=${encodeURIComponent(reason)}`, 302);
  if (!code) return failRedirect("no_code");
  if (state !== session.login) return failRedirect("state_mismatch");
  const redirectUri = `${url.origin}/api/auth/donationalerts/callback`;
  const tokenRes = await fetchWithTimeout("https://www.donationalerts.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.DONATIONALERTS_CLIENT_ID,
      client_secret: env.DONATIONALERTS_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!tokenRes.ok) {
    console.log("[da-callback] token exchange failed:", await tokenRes.text());
    return failRedirect("token_exchange_failed");
  }
  const tokenData: any = await tokenRes.json();
  const userRes = await fetchWithTimeout("https://www.donationalerts.com/api/v1/user/oauth", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) return failRedirect("profile_fetch_failed");
  const userData: any = await userRes.json();
  const daUser = userData.data;
  if (!daUser) return failRedirect("profile_fetch_failed");
  const key = `channel:${session.login}:donationalerts`;
  await env.TOKENS.put(
    key,
    JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      daUserId: daUser.id,
      daName: daUser.name,
      daAvatar: daUser.avatar,
      connectedAt: new Date().toISOString(),
    })
  );
  return Response.redirect(`${url.origin}/dashboard/profile?donationalerts=ok`, 302);
}

async function handleDonationAlertsStatus(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const data: any = await env.TOKENS.get(`channel:${session.login}:donationalerts`, "json");
  if (!data) return Response.json({ connected: false });
  return Response.json({ connected: true, daName: data.daName, daAvatar: data.daAvatar, connectedAt: data.connectedAt });
}

async function handleDonationAlertsDisconnect(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  await env.TOKENS.delete(`channel:${session.login}:donationalerts`);
  return Response.json({ ok: true });
}

async function handleDonationAlertsStats(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const history: any[] = (await env.TOKENS.get(`channel:${session.login}:donations`, "json")) || [];
  const byCurrency: Record<string, { total: number; count: number }> = {};
  const byDonor: Record<string, number> = {};
  for (const d of history) {
    const cur = d.currency || "RUB";
    byCurrency[cur] = byCurrency[cur] || { total: 0, count: 0 };
    byCurrency[cur].total += d.amount;
    byCurrency[cur].count += 1;
    byDonor[d.username] = (byDonor[d.username] || 0) + d.amount;
  }
  const topDonors = Object.entries(byDonor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([username, total]) => ({ username, total }));
  const now = Date.now();
  const weekMs = 7 * 86400000;
  let weekTotal = 0;
  let prevWeekTotal = 0;
  for (const d of history) {
    const t = new Date(d.at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= now - weekMs) weekTotal += d.amount;
    else if (t >= now - 2 * weekMs) prevWeekTotal += d.amount;
  }
  const weekDeltaPct = prevWeekTotal > 0 ? Math.round(((weekTotal - prevWeekTotal) / prevWeekTotal) * 1000) / 10 : null;
  return Response.json({ totals: byCurrency, count: history.length, topDonors, recent: history.slice(0, 50), weekTotal, weekDeltaPct });
}

async function handleDonationAlertsLatest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const channel = (url.searchParams.get("channel") || "").toLowerCase().trim();
  if (!channel) return Response.json({ donation: null });
  const record = await env.TOKENS.get(`channel:${channel}:lastDonation`, "json");
  return Response.json({ donation: record || null });
}

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 40;

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Media (donation-alert images/sounds) is stored as base64 inside KV rather
// than R2 — this Cloudflare account doesn't have R2 enabled. MAX_MEDIA_BYTES
// keeps individual values well under KV's per-value limit even after
// base64's ~33% size inflation.
async function handleMediaUpload(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file: any = form?.get("file");
  // FormDataEntryValue is File | string — "not a string" is enough to know
  // it's a File, and avoids relying on `instanceof File` typing correctly
  // across every Workers-runtime lib configuration.
  if (!file || typeof file === "string") {
    return Response.json({ error: "file_required", message: "Файл не получен." }, { status: 400 });
  }
  const kind = String(file.type || "").startsWith("audio/") ? "sound" : "image";
  const isAllowed = kind === "sound" ? /^audio\//.test(file.type) : /^image\/(png|jpeg|gif|webp)$/.test(file.type);
  if (!isAllowed) {
    return Response.json({ error: "unsupported_type", message: "Поддерживаются только изображения (png/jpeg/gif/webp) и аудио." }, { status: 400 });
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return Response.json({ error: "too_large", message: "Файл больше 5 МБ — уменьшите размер и попробуйте снова." }, { status: 400 });
  }
  const indexKey = `channel:${session.login}:media`;
  const index: any[] = (await env.TOKENS.get(indexKey, "json")) || [];
  if (index.length >= MAX_MEDIA_ITEMS) {
    return Response.json({ error: "too_many", message: `Достигнут лимит в ${MAX_MEDIA_ITEMS} файлов — удалите что-то ненужное.` }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const buf = await file.arrayBuffer();
  await env.TOKENS.put(`media:${id}`, JSON.stringify({ contentType: file.type, dataBase64: bufToBase64(buf), login: session.login }));
  const meta = { id, kind, name: file.name || kind, contentType: file.type, size: file.size, createdAt: new Date().toISOString() };
  index.unshift(meta);
  await env.TOKENS.put(indexKey, JSON.stringify(index));
  return Response.json({ ok: true, media: meta });
}

async function handleMediaList(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const index = (await env.TOKENS.get(`channel:${session.login}:media`, "json")) || [];
  return Response.json({ media: index });
}

async function handleMediaDelete(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await req.json<any>();
  const indexKey = `channel:${session.login}:media`;
  const index: any[] = (await env.TOKENS.get(indexKey, "json")) || [];
  if (!index.some((m) => m.id === id)) return Response.json({ error: "not_found" }, { status: 404 });
  await env.TOKENS.delete(`media:${id}`);
  await env.TOKENS.put(indexKey, JSON.stringify(index.filter((m) => m.id !== id)));
  return Response.json({ ok: true });
}

async function handleMediaServe(req: Request, env: Env, id: string): Promise<Response> {
  const record: any = await env.TOKENS.get(`media:${id}`, "json");
  if (!record) return new Response("Not found", { status: 404 });
  const bytes = base64ToBytes(record.dataBase64);
  return new Response(bytes, {
    headers: { "content-type": record.contentType || "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
  });
}

async function handleDonationGoalGet(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const goal = await env.TOKENS.get(`channel:${session.login}:donationGoal`, "json");
  return Response.json({ goal: goal || null });
}

async function handleDonationGoalSave(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json();
  const key = `channel:${session.login}:donationGoal`;
  const existing: any = await env.TOKENS.get(key, "json");
  const title = String(body.title || "").trim().slice(0, 80) || "Сбор на донаты";
  const targetAmount = Math.max(1, Number(body.targetAmount) || 1000);
  const currency = String(body.currency || "RUB").toUpperCase().slice(0, 8);
  const enabled = !!body.enabled;
  const reset = !!body.reset || !existing;
  const startAt = reset ? new Date().toISOString() : existing.startAt;
  const goal = { title, targetAmount, currency, enabled, startAt };
  await env.TOKENS.put(key, JSON.stringify(goal));
  return Response.json({ ok: true, goal });
}

async function handleDonationGoalPublic(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const channel = (url.searchParams.get("channel") || "").toLowerCase().trim();
  if (!channel) return Response.json({ goal: null });
  const goal: any = await env.TOKENS.get(`channel:${channel}:donationGoal`, "json");
  if (!goal || !goal.enabled) return Response.json({ goal: null });
  const history: any[] = (await env.TOKENS.get(`channel:${channel}:donations`, "json")) || [];
  const startMs = goal.startAt ? new Date(goal.startAt).getTime() : 0;
  const current = history
    .filter((d) => (d.currency || "RUB") === goal.currency && new Date(d.at).getTime() >= startMs)
    .reduce((sum, d) => sum + d.amount, 0);
  return Response.json({ goal: { ...goal, currentAmount: current } });
}

// --- Auction helpers ---------------------------------------------------
// Deliberately re-implemented here rather than imported from bot.ts: the
// two copies evolved independently (the dashboard-facing HTTP handlers
// below vs. the DO's own donation/points event handling) and the original
// deployed bundle carries both verbatim. Kept that way in this recovery
// rather than merged into a shared module, to stay faithful to what's
// actually running — worth factoring out in a follow-up cleanup.

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

async function announceInChat(env: Env, login: string, message: string): Promise<void> {
  try {
    const stub = botStub(env, login);
    await stub.fetch(`https://do/say`, { method: "POST", body: JSON.stringify({ message }) });
  } catch {
    // best-effort — a dashboard action succeeding shouldn't hinge on the bot being connected right now
  }
}

async function handleAuctionsList(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const list = (await env.TOKENS.get(`channel:${session.login}:auctions`, "json")) || [];
  return Response.json({ auctions: list });
}

async function handleAuctionPublicStatus(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const channel = (url.searchParams.get("channel") || "").toLowerCase().trim();
  if (!channel) return Response.json({ auction: null });
  const list: any[] = (await env.TOKENS.get(`channel:${channel}:auctions`, "json")) || [];
  const auction = list.find((a) => a.status === "live") || list.find((a) => a.status === "ended") || null;
  return Response.json({ auction });
}

async function handleAuctionCreate(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const cfg: any = (await env.TOKENS.get(`channel:${session.login}`, "json")) || {};
  if (!cfg.isPro) {
    return Response.json({ error: "pro_required", message: "Аукционы доступны только с Pro-подпиской." }, { status: 403 });
  }
  const body: any = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return Response.json({ error: "title_required", message: "Укажите название аукциона." }, { status: 400 });
  const rawOptions: string[] = Array.isArray(body.options) ? body.options.map((s: any) => String(s || "").trim()).filter(Boolean) : [];
  const currency = body.currency === "points" ? "points" : "donation";
  const durationSec = Math.max(30, Math.min(3600 * 6, Number(body.durationSec) || 300));
  const finishMode = ["roulette", "elimination"].includes(body.finishMode) ? body.finishMode : "highest";
  const allowCustomOptions = !!body.allowCustomOptions;
  const exchangeRate = Math.max(0.01, Math.min(10000, Number(body.exchangeRate) || 1));
  const key = `channel:${session.login}:auctions`;
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const auction = {
    id: crypto.randomUUID(),
    title,
    description: String(body.description || "").trim() || undefined,
    currency,
    status: "draft",
    durationSec,
    finishMode,
    allowCustomOptions,
    exchangeRate,
    endsAt: null,
    options: rawOptions.map((label) => ({ id: crypto.randomUUID(), label, total: 0, bids: [] })),
    winnerOptionId: null,
    eliminationOrder: undefined,
    createdAt: new Date().toISOString(),
  };
  list.unshift(auction);
  await env.TOKENS.put(key, JSON.stringify(list));
  return Response.json({ ok: true, auction });
}

async function handleAuctionStart(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await req.json<any>();
  const key = `channel:${session.login}:auctions`;
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const auction = list.find((a) => a.id === id);
  if (!auction) return Response.json({ error: "not_found" }, { status: 404 });
  if (auction.status !== "draft") return Response.json({ error: "invalid_state" }, { status: 400 });
  if (auction.options.length < 2) {
    return Response.json(
      {
        error: "need_options",
        message: auction.allowCustomOptions
          ? "Добавьте хотя бы 2 варианта — свои варианты появятся только когда уже есть с чем сравнивать."
          : "Добавьте минимум 2 варианта, за которые можно ставить.",
      },
      { status: 400 }
    );
  }
  if (list.some((a) => a.status === "live")) {
    return Response.json({ error: "another_live", message: "Уже есть активный аукцион — сначала завершите его." }, { status: 400 });
  }
  if (auction.currency === "points") {
    const reward = await env.TOKENS.get(`channel:${session.login}:auctionReward`, "json");
    if (!reward) {
      return Response.json({ error: "reward_not_setup", message: "Сначала настройте награду за баллы канала — кнопка «Настроить награду» ниже." }, { status: 400 });
    }
  }
  auction.status = "live";
  auction.startedAt = new Date().toISOString();
  auction.endsAt = new Date(Date.now() + auction.durationSec * 1000).toISOString();
  await env.TOKENS.put(key, JSON.stringify(list));
  const how = auction.currency === "points" ? `баллами канала (награда «Ставка на аукционе»)` : `донатом, указав вариант в комментарии`;
  const customNote = auction.allowCustomOptions ? ` Можно предложить и свой вариант — он появится в списке.` : "";
  await announceInChat(
    env,
    session.login,
    `Начался аукцион «${auction.title}»! Варианты: ${auction.options.map((o: any) => o.label).join(", ")}.${customNote} Ставьте ${how}. Время: ${Math.round(auction.durationSec / 60)} мин.`
  );
  return Response.json({ ok: true, auction });
}

async function handleAuctionEnd(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await req.json<any>();
  const key = `channel:${session.login}:auctions`;
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const auction = list.find((a) => a.id === id);
  if (!auction) return Response.json({ error: "not_found" }, { status: 404 });
  if (auction.status !== "live") return Response.json({ error: "invalid_state" }, { status: 400 });
  finalizeAuction(auction);
  await env.TOKENS.put(key, JSON.stringify(list));
  await announceInChat(env, session.login, auctionResultMessage(auction));
  return Response.json({ ok: true, auction });
}

async function handleAuctionDelete(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await req.json<any>();
  const key = `channel:${session.login}:auctions`;
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const target = list.find((a) => a.id === id);
  if (target && target.status === "live") {
    return Response.json({ error: "invalid_state", message: "Нельзя удалить активный аукцион — сначала завершите его." }, { status: 400 });
  }
  const next = list.filter((a) => a.id !== id);
  await env.TOKENS.put(key, JSON.stringify(next));
  return Response.json({ ok: true });
}

async function handleAuctionOptionOp(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json();
  const { auctionId, op, optionId } = body;
  const key = `channel:${session.login}:auctions`;
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const auction = list.find((a) => a.id === auctionId);
  if (!auction) return Response.json({ error: "not_found" }, { status: 404 });
  if (auction.status === "ended") {
    return Response.json({ error: "invalid_state", message: "Аукцион уже завершён — итог менять нельзя." }, { status: 400 });
  }
  if (op === "add") {
    const label = String(body.label || "").trim().slice(0, 60);
    if (!label) return Response.json({ error: "label_required", message: "Укажите название варианта." }, { status: 400 });
    if (auction.options.length >= MAX_AUCTION_OPTIONS) {
      return Response.json({ error: "too_many", message: "Достигнут лимит вариантов." }, { status: 400 });
    }
    auction.options.push({ id: crypto.randomUUID(), label, total: 0, bids: [] });
  } else {
    const option = auction.options.find((o: any) => o.id === optionId);
    if (!option) return Response.json({ error: "option_not_found" }, { status: 404 });
    if (op === "credit") {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        return Response.json({ error: "amount_required", message: "Укажите сумму для начисления." }, { status: 400 });
      }
      option.total = Math.max(0, option.total + amount);
      option.bids = option.bids || [];
      option.bids.push({ username: `${session.login} (вручную)`, amount, at: new Date().toISOString() });
    } else if (op === "rename") {
      const label = String(body.label || "").trim().slice(0, 60);
      if (!label) return Response.json({ error: "label_required", message: "Укажите новое название." }, { status: 400 });
      option.label = label;
    } else if (op === "delete") {
      if (auction.options.length <= 2) {
        return Response.json({ error: "min_options", message: "В аукционе должно остаться минимум 2 варианта." }, { status: 400 });
      }
      auction.options = auction.options.filter((o: any) => o.id !== optionId);
    } else if (op === "move") {
      const targetId = body.targetOptionId;
      const target = auction.options.find((o: any) => o.id === targetId);
      if (!target || target.id === option.id) {
        return Response.json({ error: "target_required", message: "Выберите вариант, куда переносить." }, { status: 400 });
      }
      target.total += option.total;
      target.bids = (target.bids || []).concat(option.bids || []);
      auction.options = auction.options.filter((o: any) => o.id !== optionId);
    } else {
      return Response.json({ error: "unknown_op" }, { status: 400 });
    }
  }
  await env.TOKENS.put(key, JSON.stringify(list));
  return Response.json({ ok: true, auction });
}

async function handleAuctionRewardStatus(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const data: any = await env.TOKENS.get(`channel:${session.login}:auctionReward`, "json");
  return Response.json({ configured: !!data, cost: data?.cost || null });
}

async function handleAuctionRewardSetup(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const cfg: any = (await env.TOKENS.get(`channel:${session.login}`, "json")) || {};
  if (!cfg.isPro) return Response.json({ error: "pro_required" }, { status: 403 });
  const token = await getBroadcasterToken(env, session.login);
  if (!token) {
    return Response.json({ error: "reauth_required", message: "Нужно заново войти через Twitch, чтобы выдать права на управление баллами канала." }, { status: 400 });
  }
  const user = await getUserByLogin(env, session.login, token);
  if (!user) return Response.json({ error: "user_lookup_failed" }, { status: 502 });
  const body: any = await req.json().catch(() => ({}));
  const cost = Math.max(1, Math.min(1000000, Number(body.cost) || 100));
  const existing: any = await env.TOKENS.get(`channel:${session.login}:auctionReward`, "json");
  let rewardId = existing?.rewardId;
  if (rewardId) {
    const patchRes = await helix(env, `/channel_points/custom_rewards?broadcaster_id=${user.id}&id=${rewardId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ cost }),
    });
    if (!patchRes.ok) rewardId = undefined;
  }
  if (!rewardId) {
    const createRes = await helix(env, `/channel_points/custom_rewards?broadcaster_id=${user.id}`, token, {
      method: "POST",
      body: JSON.stringify({
        title: "Ставка на аукционе",
        cost,
        is_enabled: true,
        is_user_input_required: true,
        prompt: "Напишите вариант, за который ставите",
      }),
    });
    if (!createRes.ok) {
      const raw = await createRes.text();
      const friendly = raw.includes("partner or affiliate")
        ? "Награды за баллы канала доступны только для аффилиатов и партнёров Twitch. Как только канал получит этот статус, здесь можно будет настроить ставки баллами — а пока доступны аукционы за донаты."
        : "Не удалось создать награду за баллы канала. Попробуйте ещё раз чуть позже.";
      return Response.json({ error: "reward_create_failed", message: friendly }, { status: 502 });
    }
    const createData: any = await createRes.json();
    rewardId = createData.data?.[0]?.id;
    if (!rewardId) return Response.json({ error: "reward_create_failed" }, { status: 502 });
  }
  const appToken = await getAppAccessToken(env);
  const existingSubs = await helix(env, `/eventsub/subscriptions?type=channel.channel_points_custom_reward_redemption.add&user_id=${user.id}`, appToken, {});
  let hasSub = false;
  if (existingSubs.ok) {
    const subsData: any = await existingSubs.json();
    hasSub = (subsData.data || []).some((s: any) => s.condition?.broadcaster_user_id === user.id && s.status === "enabled");
  }
  if (!hasSub) {
    const subRes = await helix(env, `/eventsub/subscriptions`, appToken, {
      method: "POST",
      body: JSON.stringify({
        type: "channel.channel_points_custom_reward_redemption.add",
        version: "1",
        condition: { broadcaster_user_id: user.id },
        transport: { method: "webhook", callback: `${new URL(req.url).origin}/webhooks/twitch/eventsub`, secret: env.TWITCH_EVENTSUB_SECRET },
      }),
    });
    if (!subRes.ok) {
      return Response.json({ error: "eventsub_subscribe_failed", message: await subRes.text() }, { status: 502 });
    }
  }
  await env.TOKENS.put(`channel:${session.login}:auctionReward`, JSON.stringify({ rewardId, cost, broadcasterId: user.id, updatedAt: new Date().toISOString() }));
  return Response.json({ ok: true, rewardId, cost });
}

async function handleTwitchEventSubWebhook(req: Request, env: Env): Promise<Response> {
  const messageId = req.headers.get("Twitch-Eventsub-Message-Id") || "";
  const timestamp = req.headers.get("Twitch-Eventsub-Message-Timestamp") || "";
  const signature = req.headers.get("Twitch-Eventsub-Message-Signature") || "";
  const messageType = req.headers.get("Twitch-Eventsub-Message-Type") || "";
  const rawBody = await req.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.TWITCH_EVENTSUB_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(messageId + timestamp + rawBody));
  const expected = "sha256=" + Array.from(new Uint8Array(sigBytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected !== signature) return new Response("signature mismatch", { status: 403 });
  const body: any = JSON.parse(rawBody);
  if (messageType === "webhook_callback_verification") {
    return new Response(body.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (messageType === "revocation") {
    console.log("[eventsub] subscription revoked:", JSON.stringify(body.subscription));
    return new Response(null, { status: 204 });
  }
  if (messageType !== "notification") return new Response(null, { status: 204 });
  if (body.subscription?.type === "channel.channel_points_custom_reward_redemption.add") {
    await handlePointsRedemption(env, body.event);
  }
  return new Response(null, { status: 204 });
}

async function handlePointsRedemption(env: Env, event: any): Promise<void> {
  const login = String(event.broadcaster_user_login || "").toLowerCase();
  if (!login) return;
  const key = `channel:${login}:auctions`;
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const live = list.find((a) => a.status === "live" && a.currency === "points");
  if (!live) return;
  const option = resolveOrCreateAuctionOption(live, event.user_input || "");
  const amount = Number(event.reward?.cost) || 0;
  if (!option || amount <= 0) return;
  option.total += amount;
  option.bids.push({ username: event.user_name || "аноним", amount, at: new Date().toISOString() });
  await env.TOKENS.put(key, JSON.stringify(list));
  await announceInChat(env, login, `${event.user_name || "Аноним"} поставил ${amount} баллов на «${option.label}» (аукцион «${live.title}») — сейчас там ${option.total}.`);
}

function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": "streops_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" },
  });
}

async function handleMe(req: Request, env: Env): Promise<Response> {
  const session = await requireSession(req, env);
  if (!session) return Response.json({ authenticated: false });
  const cfg: any = (await env.TOKENS.get(`channel:${session.login}`, "json")) || {};
  if (cfg.banned) {
    return Response.json({ authenticated: true, banned: true, bannedReason: cfg.bannedReason || null, user: session });
  }
  return Response.json({ authenticated: true, banned: false, user: session, isPro: !!cfg.isPro, proSince: cfg.proSince || null });
}

async function handleBotAction(req: Request, env: Env, action: "start" | "stop"): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const cfgKey = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(cfgKey, "json")) || {};
  cfg.enabled = action === "start";
  await env.TOKENS.put(cfgKey, JSON.stringify(cfg));
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/${action}?login=${encodeURIComponent(session.login)}`);
  return Response.json(await res.json());
}

async function handleClearChat(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/clear-chat`, { method: "POST" });
  const data: any = await res.json();
  if (!res.ok || data.error) {
    return Response.json({ error: data.error || "failed", message: "Не удалось очистить чат — возможно, у бота нет нужных прав. Попробуйте переавторизовать бота." }, { status: res.status || 502 });
  }
  return Response.json(data);
}

async function handleBotBanUser(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  if (!body.username) return Response.json({ error: "username required" }, { status: 400 });
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/ban`, { method: "POST", body: JSON.stringify(body) });
  const data: any = await res.json();
  if (!res.ok || data.error) {
    return Response.json({ error: data.error || "failed", message: "Не удалось выполнить действие — проверьте ник или права бота." }, { status: res.status || 502 });
  }
  return Response.json(data);
}

async function handleBotUnbanUser(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  if (!body.username) return Response.json({ error: "username required" }, { status: 400 });
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/unban`, { method: "POST", body: JSON.stringify(body) });
  const data: any = await res.json();
  if (!res.ok || data.error) {
    return Response.json({ error: data.error || "failed", message: "Не удалось разбанить — проверьте ник." }, { status: res.status || 502 });
  }
  return Response.json(data);
}

async function handleEmoteOnly(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/emote-only`, { method: "POST", body: JSON.stringify({ enabled: !!body.enabled }) });
  const data: any = await res.json();
  if (!res.ok || data.error) {
    return Response.json({ error: data.error || "failed", message: "Не удалось переключить режим — возможно, у бота нет нужных прав. Попробуйте переавторизовать бота." }, { status: res.status || 502 });
  }
  return Response.json(data);
}

async function handleBotStatus(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/status?login=${encodeURIComponent(session.login)}`);
  const status: any = await res.json();
  const cfg = (await env.TOKENS.get(`channel:${session.login}`, "json")) || {};
  let stream: any = null;
  try {
    const token = await getBotToken(env);
    const streamRes = await helix(env, `/streams?user_login=${encodeURIComponent(session.login)}`, token, {}, env.BOT_CLIENT_ID);
    if (streamRes.ok) {
      const data: any = await streamRes.json();
      const s = data.data?.[0];
      if (s) {
        stream = { live: true, title: s.title, game: s.game_name, viewerCount: s.viewer_count, startedAt: s.started_at };
      }
    }
  } catch {
    // best-effort — bot status still returns without live stream details
  }
  return Response.json({ ...status, config: cfg, stream: stream || { live: false } });
}

async function handleChannelStats(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getBroadcasterToken(env, session.login);
  if (!token) {
    return Response.json({ error: "no_broadcaster_token", message: "Нужно заново войти через Twitch, чтобы выдать доступ к статистике." });
  }
  const result: any = { followers: null, subscribers: null, subPoints: null, subscribersWeekDeltaPct: null, subscribersWeekDelta: null };
  const followersRes = await helix(env, `/channels/followers?broadcaster_id=${session.id}&first=1`, token);
  if (followersRes.ok) {
    const data: any = await followersRes.json();
    result.followers = typeof data.total === "number" ? data.total : null;
  }
  const subsRes = await helix(env, `/subscriptions?broadcaster_id=${session.id}&first=1`, token);
  if (subsRes.ok) {
    const data: any = await subsRes.json();
    result.subscribers = typeof data.total === "number" ? data.total : null;
    result.subPoints = typeof data.points === "number" ? data.points : null;
  }
  if (typeof result.subscribers === "number") {
    try {
      const snapKey = `channel:${session.login}:subSnapshots`;
      const today = new Date().toISOString().slice(0, 10);
      const snaps: any[] = (await env.TOKENS.get(snapKey, "json")) || [];
      if (!snaps.length || snaps[snaps.length - 1].date !== today) {
        snaps.push({ date: today, subscribers: result.subscribers });
        if (snaps.length > 60) snaps.splice(0, snaps.length - 60);
        await env.TOKENS.put(snapKey, JSON.stringify(snaps));
      }
      const weekAgoMs = Date.now() - 7 * 86400000;
      let closest: any = null;
      for (const s of snaps) {
        const t = new Date(s.date).getTime();
        if (t <= weekAgoMs && (!closest || t > new Date(closest.date).getTime())) closest = s;
      }
      if (closest) {
        result.subscribersWeekDelta = result.subscribers - closest.subscribers;
        if (closest.subscribers > 0) {
          result.subscribersWeekDeltaPct = Math.round(((result.subscribers - closest.subscribers) / closest.subscribers) * 1000) / 10;
        }
      }
    } catch {
      // best-effort — weekly delta is a nice-to-have, not core to the stats response
    }
  }
  return Response.json(result);
}

async function handleAdminUsers(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  let botToken: string | null = null;
  try {
    botToken = await getBotToken(env);
  } catch {
    botToken = null;
  }
  const list = await env.TOKENS.list({ prefix: "channel:" });
  const users: any[] = [];
  for (const key of list.keys) {
    if (key.name.endsWith(":logs")) continue;
    const login = key.name.replace("channel:", "");
    const cfg: any = (await env.TOKENS.get(key.name, "json")) || {};
    const hasToken = !!(await env.TOKENS.get(`user:${login}`));
    let twitch: any = null;
    if (botToken) {
      try {
        const u = await getUserByLogin(env, login, botToken, env.BOT_CLIENT_ID);
        if (u) {
          twitch = {
            id: u.id,
            displayName: u.display_name,
            profileImageUrl: u.profile_image_url,
            broadcasterType: u.broadcaster_type || null,
            description: u.description || "",
            createdAt: u.created_at,
          };
        }
      } catch {
        // best-effort — one channel's Twitch lookup failing shouldn't drop it from the admin list
      }
    }
    users.push({
      login,
      linked: hasToken,
      enabled: !!cfg.enabled,
      isPro: !!cfg.isPro,
      // Cosmetic tier label on top of the same underlying isPro unlock —
      // "free" | "pro" | "pro-plus" | "ultimate". All paid tiers unlock the
      // exact same Pro features; there is no hidden extra behind the fancier
      // names. Falls back to deriving from isPro for accounts granted Pro
      // before tiers existed.
      tier: cfg.tier || (cfg.isPro ? "pro" : "free"),
      proSince: cfg.proSince || null,
      isAdmin: !!cfg.isAdmin,
      banned: !!cfg.banned,
      bannedReason: cfg.bannedReason || null,
      queueLength: Array.isArray(cfg.queue) ? cfg.queue.length : 0,
      timersCount: Array.isArray(cfg.timers) ? cfg.timers.length : 0,
      bannedWordsCount: Array.isArray(cfg.bannedWords) ? cfg.bannedWords.length : 0,
      twitch,
      // Full config detail for the admin panel's user view — the entire raw
      // stored config, same as what the streamer sees on their own
      // dashboard. Intentionally the whole object (not a hand-picked
      // subset) so nothing new added to ChannelConfig later silently goes
      // missing from here. Never includes the Twitch OAuth token itself —
      // that lives under a separate `user:${login}` KV key, never in cfg.
      detail: cfg,
    });
  }
  return Response.json({ users });
}

async function handleAdminSetPro(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  const key = `channel:${body.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  cfg.isPro = !!body.isPro;
  cfg.tier = cfg.isPro ? cfg.tier || "pro" : "free";
  if (cfg.isPro && !cfg.proSince) cfg.proSince = new Date().toISOString();
  if (!cfg.isPro) cfg.proSince = null;
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, login: body.login, isPro: cfg.isPro, tier: cfg.tier, proSince: cfg.proSince });
}

const VALID_TIERS = ["free", "pro", "pro-plus", "ultimate"];

async function handleAdminSetTier(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  if (!VALID_TIERS.includes(body.tier)) {
    return Response.json({ error: "invalid tier" }, { status: 400 });
  }
  const key = `channel:${body.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  cfg.tier = body.tier;
  cfg.isPro = body.tier !== "free";
  if (cfg.isPro && !cfg.proSince) cfg.proSince = new Date().toISOString();
  if (!cfg.isPro) cfg.proSince = null;
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, login: body.login, tier: cfg.tier, isPro: cfg.isPro, proSince: cfg.proSince });
}

async function handleAdminGrantAdmin(req: Request, env: Env): Promise<Response> {
  const admin = await requireSuperAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  if (body.login.toLowerCase() === SUPERADMIN_LOGIN) {
    return Response.json({ error: "superadmin_always_has_access" }, { status: 400 });
  }
  const key = `channel:${body.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  cfg.isAdmin = !!body.isAdmin;
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, login: body.login, isAdmin: cfg.isAdmin });
}

async function handleAdminBan(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  if (body.login.toLowerCase() === SUPERADMIN_LOGIN) {
    return Response.json({ error: "cannot_ban_superadmin" }, { status: 400 });
  }
  const key = `channel:${body.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  cfg.banned = !!body.banned;
  cfg.bannedReason = cfg.banned ? body.reason || null : null;
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, login: body.login, banned: cfg.banned, bannedReason: cfg.bannedReason });
}

async function handleAdminReconnect(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  const stub = botStub(env, body.login);
  await stub.fetch(`https://do/say?login=${encodeURIComponent(body.login)}`, {
    method: "POST",
    body: JSON.stringify({ message: "🔄 Бот переподключается по запросу администратора..." }),
  });
  await stub.fetch(`https://do/stop?login=${encodeURIComponent(body.login)}`);
  const res = await stub.fetch(`https://do/start?login=${encodeURIComponent(body.login)}`);
  const status = await res.json();
  return Response.json({ ok: true, login: body.login, status });
}

async function handleAdminTestMessage(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  const stub = botStub(env, body.login);
  const res = await stub.fetch(`https://do/say?login=${encodeURIComponent(body.login)}`, {
    method: "POST",
    body: JSON.stringify({ message: "✅ Проверка связи — бот подключён и работает." }),
  });
  const data: any = await res.json();
  return Response.json({ ok: true, sent: !!data.sent });
}

async function handleAdminBanChatUser(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.channel || !body.username) {
    return Response.json({ error: "channel and username required" }, { status: 400 });
  }
  const cfg = await env.TOKENS.get(`channel:${body.channel}`, "json");
  if (!cfg) return Response.json({ error: "unknown_channel" }, { status: 404 });
  const stub = botStub(env, body.channel);
  const res = await stub.fetch(`https://do/ban?login=${encodeURIComponent(body.channel)}`, {
    method: "POST",
    body: JSON.stringify({ username: body.username, reason: body.reason, durationSec: body.durationSec ?? null }),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

async function handleAdminUnbanChatUser(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.channel || !body.username) {
    return Response.json({ error: "channel and username required" }, { status: 400 });
  }
  const cfg = await env.TOKENS.get(`channel:${body.channel}`, "json");
  if (!cfg) return Response.json({ error: "unknown_channel" }, { status: 404 });
  const stub = botStub(env, body.channel);
  const res = await stub.fetch(`https://do/unban?login=${encodeURIComponent(body.channel)}`, {
    method: "POST",
    body: JSON.stringify({ username: body.username }),
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}

const BLACKLIST_KEY = "global:blacklist";
const MAX_NOTIFICATIONS = 50;

function notificationsKey(login: string): string {
  return `channel:${login}:notifications`;
}

async function pushNotification(env: Env, login: string, text: string, from: string): Promise<void> {
  const key = notificationsKey(login);
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  list.unshift({ id: crypto.randomUUID(), text, from, createdAt: new Date().toISOString(), read: false });
  if (list.length > MAX_NOTIFICATIONS) list.length = MAX_NOTIFICATIONS;
  await env.TOKENS.put(key, JSON.stringify(list));
}

async function handleAdminNotify(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  const message = (body.message || "").trim();
  if (!message) return Response.json({ error: "message required" }, { status: 400 });
  if (!body.target) return Response.json({ error: "target required" }, { status: 400 });
  if (body.target === "all") {
    const list = await env.TOKENS.list({ prefix: "channel:" });
    let sent = 0;
    for (const key of list.keys) {
      if (key.name.endsWith(":logs") || key.name.endsWith(":notifications")) continue;
      const login2 = key.name.replace("channel:", "");
      await pushNotification(env, login2, message, admin.login);
      sent++;
    }
    return Response.json({ ok: true, sent });
  }
  const login = body.target.toLowerCase();
  const exists = await env.TOKENS.get(`channel:${login}`);
  if (!exists) return Response.json({ error: "user_not_found" }, { status: 404 });
  await pushNotification(env, login, message, admin.login);
  return Response.json({ ok: true, sent: 1 });
}

// --- Admin-created TTS overlay slots ("Оповещения для OBS") ------------
// Platform-level, not per-channel — the superadmin creates named slots here
// and manually pushes text into one; the /widget/announce page (see below)
// polls for it and speaks it via the browser's speech synthesis. Separate
// mechanism from the per-channel "!vl" command in bot.ts, which speaks
// through the chat widget instead.

const ANNOUNCE_INDEX_KEY = "announce:index";

async function handleAnnounceList(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const links = (await env.TOKENS.get(ANNOUNCE_INDEX_KEY, "json")) || [];
  return Response.json({ links });
}

async function handleAnnounceCreate(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json().catch(() => ({}));
  const links: any[] = (await env.TOKENS.get(ANNOUNCE_INDEX_KEY, "json")) || [];
  const id = crypto.randomUUID();
  const name = (body.name || "").trim() || `Оповещение ${links.length + 1}`;
  links.push({ id, name, createdAt: new Date().toISOString() });
  await env.TOKENS.put(ANNOUNCE_INDEX_KEY, JSON.stringify(links));
  await env.TOKENS.put(`announce:${id}`, JSON.stringify({ text: "", seq: 0, updatedAt: null }));
  return Response.json({ ok: true, id, name });
}

async function handleAnnounceDelete(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
  const links: any[] = (await env.TOKENS.get(ANNOUNCE_INDEX_KEY, "json")) || [];
  await env.TOKENS.put(ANNOUNCE_INDEX_KEY, JSON.stringify(links.filter((l) => l.id !== body.id)));
  await env.TOKENS.delete(`announce:${body.id}`);
  return Response.json({ ok: true });
}

async function handleAnnounceSend(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  const text = (body.text || "").trim();
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const key = `announce:${body.id}`;
  const cur: any = (await env.TOKENS.get(key, "json")) || { seq: 0 };
  await env.TOKENS.put(key, JSON.stringify({ text, seq: (cur.seq || 0) + 1, updatedAt: new Date().toISOString() }));
  return Response.json({ ok: true });
}

async function handleAnnounceGet(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ text: "", seq: 0 });
  const cur: any = (await env.TOKENS.get(`announce:${id}`, "json")) || { text: "", seq: 0 };
  return Response.json({ text: cur.text || "", seq: cur.seq || 0 });
}

// Shared client-side TTS engine — splits mixed Russian/English text into
// same-language runs and speaks each with the browser's Web Speech API,
// picking a female voice per language from a name-hint list (the Web
// Speech API doesn't expose voice gender directly). Inlined into both the
// announce widget below and the chat widget (for "!vl"), since both need
// the exact same behavior and there's no shared static-asset pipeline for
// widget-page JS.
const TTS_ENGINE_JS = `
function streopsSplitByScript(text) {
  var re = /[А-Яа-яЁё]+[^A-Za-zА-Яа-яЁё]*|[A-Za-z]+[^A-Za-zА-Яа-яЁё]*|[^A-Za-zА-Яа-яЁё]+/g;
  var matches = text.match(re) || [text];
  var chunks = [];
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    var isCyr = /[А-Яа-яЁё]/.test(m);
    var isLat = /[A-Za-z]/.test(m);
    var lang = isCyr ? 'ru' : (isLat ? 'en' : (chunks.length ? chunks[chunks.length - 1].lang : 'ru'));
    if (chunks.length && chunks[chunks.length - 1].lang === lang) chunks[chunks.length - 1].text += m;
    else chunks.push({ lang: lang, text: m });
  }
  return chunks;
}
var STREOPS_FEMALE_HINTS = ['female','zira','irina','ekaterina','elena','milena','anna','samantha','victoria','karen','moira','tessa','fiona','susan','linda','heera','salli','joanna','kendra','ivy','kimberly','amy','emma','olivia','yuliya','tatyana','katya'];
var STREOPS_MALE_HINTS = ['male','david','mark','yuri','pavel','egor','george','daniel','alex','fred','oliver','ryan','arthur','maxim'];
function streopsScoreVoice(v, wantPrefix) {
  var name = (v.name || '').toLowerCase();
  var lang = (v.lang || '').toLowerCase();
  if (lang.indexOf(wantPrefix) !== 0) return -1;
  var score = 0;
  for (var i = 0; i < STREOPS_FEMALE_HINTS.length; i++) if (name.indexOf(STREOPS_FEMALE_HINTS[i]) !== -1) score += 10;
  for (var i = 0; i < STREOPS_MALE_HINTS.length; i++) if (name.indexOf(STREOPS_MALE_HINTS[i]) !== -1) score -= 10;
  if (name.indexOf('google') !== -1) score += 1;
  return score;
}
function streopsPickVoice(langPrefix) {
  var voices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
  var candidates = voices.filter(function (v) { return (v.lang || '').toLowerCase().indexOf(langPrefix) === 0; });
  if (!candidates.length) return null;
  candidates.sort(function (a, b) { return streopsScoreVoice(b, langPrefix) - streopsScoreVoice(a, langPrefix); });
  return candidates[0];
}
function streopsEnsureVoices(cb) {
  if (!('speechSynthesis' in window)) { cb(); return; }
  var voices = window.speechSynthesis.getVoices();
  if (voices && voices.length) { cb(); return; }
  window.speechSynthesis.onvoiceschanged = function () { cb(); };
  setTimeout(cb, 300);
}
function streopsSpeak(text, onDone) {
  if (!text || !('speechSynthesis' in window)) { if (onDone) onDone(); return; }
  streopsEnsureVoices(function () {
    var chunks = streopsSplitByScript(text);
    var i = 0;
    function next() {
      if (i >= chunks.length) { if (onDone) onDone(); return; }
      var c = chunks[i++];
      var u = new SpeechSynthesisUtterance(c.text);
      var prefix = c.lang === 'ru' ? 'ru' : 'en';
      var voice = streopsPickVoice(prefix);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      else u.lang = c.lang === 'ru' ? 'ru-RU' : 'en-US';
      u.pitch = 1.05;
      u.rate = 0.95;
      u.onend = next;
      u.onerror = next;
      try { window.speechSynthesis.speak(u); } catch (e) { next(); }
    }
    next();
  });
}
`;

function announceWidgetHtml(req: Request): Response {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;}
  .wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}
  .card{max-width:88vw;background:rgba(10,10,14,.88);border:1px solid rgba(255,255,255,.12);border-radius:18px;
    padding:20px 30px;box-shadow:0 20px 60px rgba(0,0,0,.45);
    opacity:0;transform:translateY(18px) scale(.96);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.9,.25,1);}
  .card.show{opacity:1;transform:translateY(0) scale(1);}
  .text{color:#fff;font-size:30px;font-weight:700;line-height:1.35;text-align:center;overflow-wrap:anywhere;}
</style></head><body>
<div class="wrap"><div class="card" id="card"><div class="text" id="text"></div></div></div>
<script>
${TTS_ENGINE_JS}
(function () {
  var ID = ${JSON.stringify(id)};
  var card = document.getElementById('card');
  var textEl = document.getElementById('text');
  var lastSeq = undefined; // undefined = first poll — don't replay whatever's already stored
  var hideTimer = null;

  function hide() { card.classList.remove('show'); }

  function show(text) {
    textEl.textContent = text;
    clearTimeout(hideTimer);
    card.classList.add('show');
    var fallbackMs = Math.max(4000, Math.min(30000, text.length * 150));
    hideTimer = setTimeout(hide, fallbackMs);
    streopsSpeak(text, function () { clearTimeout(hideTimer); hide(); });
  }

  function poll() {
    fetch('/api/announce/get?id=' + encodeURIComponent(ID))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (lastSeq === undefined) { lastSeq = data.seq || 0; return; }
        if ((data.seq || 0) === lastSeq) return;
        lastSeq = data.seq || 0;
        if (data.text) show(data.text);
      }).catch(function () {});
  }
  poll();
  setInterval(poll, 800);
})();
<\/script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function handleNotificationsGet(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const list: any[] = (await env.TOKENS.get(notificationsKey(session.login), "json")) || [];
  const unreadCount = list.filter((n) => !n.read).length;
  return Response.json({ notifications: list, unreadCount });
}

async function handleNotificationsRead(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = notificationsKey(session.login);
  const list: any[] = (await env.TOKENS.get(key, "json")) || [];
  const body: any = await req.json();
  if (body.all) {
    for (const n of list) n.read = true;
  } else if (body.id) {
    const n = list.find((n2) => n2.id === body.id);
    if (n) n.read = true;
  }
  await env.TOKENS.put(key, JSON.stringify(list));
  return Response.json({ ok: true });
}

async function handleAdminBlacklistList(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const list = (await env.TOKENS.get(BLACKLIST_KEY, "json")) || [];
  return Response.json({ users: list });
}

async function handleAdminBlacklistAdd(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.username) return Response.json({ error: "username required" }, { status: 400 });
  if (body.username.toLowerCase() === SUPERADMIN_LOGIN) {
    return Response.json({ error: "cannot_blacklist_superadmin" }, { status: 400 });
  }
  const list: any[] = (await env.TOKENS.get(BLACKLIST_KEY, "json")) || [];
  const login = body.username.toLowerCase();
  if (!list.some((b) => b.username.toLowerCase() === login)) {
    list.push({ username: body.username, reason: body.reason || null, addedAt: new Date().toISOString() });
    await env.TOKENS.put(BLACKLIST_KEY, JSON.stringify(list));
  }
  return Response.json({ ok: true, users: list });
}

async function handleAdminBlacklistRemove(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.username) return Response.json({ error: "username required" }, { status: 400 });
  const list: any[] = (await env.TOKENS.get(BLACKLIST_KEY, "json")) || [];
  const next = list.filter((b) => b.username.toLowerCase() !== body.username.toLowerCase());
  await env.TOKENS.put(BLACKLIST_KEY, JSON.stringify(next));
  return Response.json({ ok: true, users: next });
}

async function handleAdminUnlink(req: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(req, env);
  if (!admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: any = await req.json();
  if (!body.login) return Response.json({ error: "login required" }, { status: 400 });
  await env.TOKENS.delete(`user:${body.login}`);
  return Response.json({ ok: true, login: body.login });
}

async function handleBotLogs(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/logs?login=${encodeURIComponent(session.login)}`);
  return Response.json(await res.json());
}

async function handleBotLogsClear(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/logs?login=${encodeURIComponent(session.login)}`, { method: "POST" });
  return Response.json(await res.json());
}

async function handleBotConfig(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json();
  const stub = botStub(env, session.login);
  const res = await stub.fetch(`https://do/config?login=${encodeURIComponent(session.login)}`, { method: "POST", body: JSON.stringify(body) });
  return Response.json(await res.json());
}

async function handleYoutubeSearch(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q) return Response.json({ items: [] });
  const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  ytUrl.searchParams.set("part", "snippet");
  ytUrl.searchParams.set("type", "video");
  ytUrl.searchParams.set("videoCategoryId", "10");
  ytUrl.searchParams.set("maxResults", "10");
  ytUrl.searchParams.set("q", q);
  ytUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
  const res = await fetchWithTimeout(ytUrl.toString());
  if (!res.ok) return Response.json({ error: await res.text() }, { status: 502 });
  const data: any = await res.json();
  const items = (data.items || []).map((it: any) => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channel: it.snippet.channelTitle,
    thumbnail: it.snippet.thumbnails?.default?.url,
    url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
  }));
  return Response.json({ items });
}

async function handleYoutubeVideo(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const ytUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  ytUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  ytUrl.searchParams.set("id", id);
  ytUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
  const res = await fetchWithTimeout(ytUrl.toString());
  if (!res.ok) return Response.json({ error: await res.text() }, { status: 502 });
  const data: any = await res.json();
  const v = data.items?.[0];
  if (!v) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    videoId: id,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    durationSec: parseIso8601Duration(v.contentDetails.duration),
    views: Number(v.statistics.viewCount || 0),
    thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
    categoryId: v.snippet.categoryId,
  });
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

async function handleYoutubeResolveLink(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const raw = (new URL(req.url).searchParams.get("url") || "").trim();
  if (!raw) return Response.json({ error: "url required" }, { status: 400 });
  if (isYandexMusicLink(raw)) {
    return Response.json(
      { error: "yandex_unavailable", message: "Яндекс.Музыка пока не поддерживается: у сервиса нет публичного способа получить название трека без входа в аккаунт. Вставьте ссылку с YouTube или Spotify." },
      { status: 501 }
    );
  }
  if (!isSpotifyTrackLink(raw)) {
    return Response.json({ error: "unrecognized_link" }, { status: 400 });
  }
  const query = await resolveSpotifyTrackTitle(raw);
  if (!query) {
    return Response.json({ error: "spotify_lookup_failed", message: "Не удалось получить название трека из Spotify." }, { status: 502 });
  }
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("maxResults", "1");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
  const searchRes = await fetchWithTimeout(searchUrl.toString());
  if (!searchRes.ok) return Response.json({ error: "youtube_search_failed" }, { status: 502 });
  const searchData: any = await searchRes.json();
  const top = searchData.items?.[0];
  if (!top) {
    return Response.json({ error: "no_match", message: `Не нашли на YouTube трек «${query}».` }, { status: 404 });
  }
  const videoId = top.id.videoId;
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  videosUrl.searchParams.set("id", videoId);
  videosUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
  const videoRes = await fetchWithTimeout(videosUrl.toString());
  if (!videoRes.ok) return Response.json({ error: "youtube_lookup_failed" }, { status: 502 });
  const videoData: any = await videoRes.json();
  const v = videoData.items?.[0];
  if (!v) return Response.json({ error: "no_match", message: `Не нашли на YouTube трек «${query}».` }, { status: 404 });
  return Response.json({
    videoId,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    durationSec: parseIso8601Duration(v.contentDetails.duration),
    views: Number(v.statistics.viewCount || 0),
    thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
    categoryId: v.snippet.categoryId,
    resolvedFrom: "spotify",
    sourceQuery: query,
  });
}

function parseIso8601Duration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

async function handleWidgetSettingsGet(req: Request, env: Env): Promise<Response> {
  const login = new URL(req.url).searchParams.get("channel");
  if (!login) return Response.json({ error: "channel required" }, { status: 400 });
  const cfg: any = (await env.TOKENS.get(`channel:${login}`, "json")) || {};
  return Response.json(cfg.widgetSettings || {});
}

async function handleWidgetSettingsSave(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json();
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  cfg.widgetSettings = { ...(cfg.widgetSettings || {}), ...body };
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, widgetSettings: cfg.widgetSettings });
}

function pickNextTrack(cfg: any): (Track & { queuedBy: string }) | null {
  if (cfg.queue && cfg.queue.length) return cfg.queue.shift();
  const playlist = Array.isArray(cfg.playlist) ? cfg.playlist : [];
  if (!playlist.length) return null;
  const prevIndex = typeof cfg.playlistIndex === "number" ? cfg.playlistIndex : -1;
  let nextIndex: number;
  if (cfg.playlistShuffle && playlist.length > 1) {
    nextIndex = Math.floor(Math.random() * playlist.length);
    if (nextIndex === prevIndex) nextIndex = (nextIndex + 1) % playlist.length;
  } else {
    nextIndex = (prevIndex + 1) % playlist.length;
  }
  cfg.playlistIndex = nextIndex;
  const track = playlist[nextIndex];
  return { title: track.title, url: track.url, thumbnail: track.thumbnail || undefined, queuedBy: "плейлист", durationSec: track.durationSec || undefined };
}

function startPlayback(cfg: any, track: any): void {
  cfg.nowPlaying = track;
  cfg.nowPlayingStartedAt = track ? new Date().toISOString() : undefined;
  cfg.nowPlayingDurationSec = track && track.durationSec ? track.durationSec : undefined;
  cfg.paused = false;
  cfg.pausedAt = undefined;
}

function peekNextTrack(cfg: any): any | null {
  if (cfg.queue && cfg.queue.length) return cfg.queue[0];
  const playlist = Array.isArray(cfg.playlist) ? cfg.playlist : [];
  if (!playlist.length) return null;
  if (cfg.playlistShuffle) return null;
  const prevIndex = typeof cfg.playlistIndex === "number" ? cfg.playlistIndex : -1;
  return playlist[(prevIndex + 1) % playlist.length];
}

async function handleQueueGet(req: Request, env: Env): Promise<Response> {
  const login = new URL(req.url).searchParams.get("channel");
  if (!login) return Response.json({ error: "channel required" }, { status: 400 });
  const key = `channel:${login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  if (!cfg.nowPlaying && !cfg.playbackStopped) {
    const next = pickNextTrack(cfg);
    if (next) {
      startPlayback(cfg, next);
      await env.TOKENS.put(key, JSON.stringify(cfg));
    }
  }
  return Response.json({
    nowPlaying: cfg.nowPlaying || null,
    queue: cfg.queue || [],
    playlist: cfg.playlist || [],
    playlistShuffle: !!cfg.playlistShuffle,
    paused: !!cfg.paused,
    nowPlayingStartedAt: cfg.nowPlayingStartedAt || null,
    nowPlayingDurationSec: cfg.nowPlayingDurationSec || null,
    pausedAt: cfg.pausedAt || null,
    next: peekNextTrack(cfg),
  });
}

// Honest pause/resume timing: rather than tracking a separate "accumulated
// pause" offset, this shifts nowPlayingStartedAt itself forward by however
// long the track was paused — so "elapsed = now - nowPlayingStartedAt"
// stays correct everywhere else (the widget's progress bar, !uptime-style
// displays) without every reader needing to know about pauses at all.
async function handleQueuePause(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  const body: any = await req.json();
  const wasPaused = !!cfg.paused;
  cfg.paused = !!body.paused;
  if (cfg.paused && !wasPaused) {
    cfg.pausedAt = new Date().toISOString();
  } else if (!cfg.paused && wasPaused && cfg.pausedAt && cfg.nowPlayingStartedAt) {
    const pausedForMs = Date.now() - new Date(cfg.pausedAt).getTime();
    cfg.nowPlayingStartedAt = new Date(new Date(cfg.nowPlayingStartedAt).getTime() + pausedForMs).toISOString();
    cfg.pausedAt = undefined;
  } else if (!cfg.paused) {
    cfg.pausedAt = undefined;
  }
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, paused: cfg.paused });
}

async function handleQueueObservedDuration(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  let login = url.searchParams.get("channel");
  if (!login || login === "self") {
    const session = await requireActiveSession(req, env);
    if (!session) return Response.json({ error: "channel required" }, { status: 400 });
    login = session.login;
  }
  const key = `channel:${login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  const body: any = await req.json();
  if (!cfg.nowPlaying || cfg.nowPlaying.url !== body.url || !(body.durationSec > 0)) {
    return Response.json({ ok: false, reason: "stale_or_invalid" });
  }
  cfg.nowPlayingDurationSec = Math.round(body.durationSec);
  cfg.nowPlaying.durationSec = cfg.nowPlayingDurationSec;
  if (Array.isArray(cfg.playlist)) {
    const pl = cfg.playlist.find((t: any) => t.url === body.url);
    if (pl && !pl.durationSec) pl.durationSec = cfg.nowPlayingDurationSec;
  }
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true });
}

async function handleQueueAdd(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const body: any = await req.json();
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || { queue: [] };
  if (!cfg.isPro) {
    return Response.json({ error: "pro_required", message: "Заказ музыки доступен только с Pro-подпиской." }, { status: 403 });
  }
  const videoIdMatch = (body.url || "").match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  let fetchedDurationSec: number | undefined;
  if (videoIdMatch) {
    try {
      const ytUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      ytUrl.searchParams.set("part", "snippet,contentDetails,statistics");
      ytUrl.searchParams.set("id", videoIdMatch[1]);
      ytUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
      const ytRes = await fetchWithTimeout(ytUrl.toString());
      if (ytRes.ok) {
        const ytData: any = await ytRes.json();
        const v = ytData.items?.[0];
        if (v) {
          const durationSec = parseIso8601Duration(v.contentDetails?.duration || "");
          fetchedDurationSec = durationSec > 0 ? durationSec : undefined;
          const views = Number(v.statistics?.viewCount || 0);
          const channelTitle = v.snippet.channelTitle || "";
          const maxDurationMin = cfg.songMaxDurationMin ?? 0;
          const minViews = cfg.songMinViews ?? 0;
          const blocked = (cfg.songBlockedChannels || []).find((b: string) => channelTitle.toLowerCase().includes(b.toLowerCase()));
          if (maxDurationMin > 0 && durationSec > maxDurationMin * 60) {
            return Response.json({ error: "duration_limit", message: `Видео длиннее лимита в ${maxDurationMin} мин.` }, { status: 400 });
          }
          if (minViews > 0 && views < minViews) {
            return Response.json({ error: "views_limit", message: `У видео меньше ${minViews} просмотров.` }, { status: 400 });
          }
          if (cfg.songMusicCategoryOnly && v.snippet.categoryId !== "10") {
            return Response.json({ error: "category_limit", message: "Категория видео не «Музыка»." }, { status: 400 });
          }
          if (blocked) {
            return Response.json({ error: "blocked_channel", message: `Канал «${channelTitle}» в чёрном списке.` }, { status: 400 });
          }
        }
      }
    } catch {
      // best-effort — if the YouTube lookup fails, the track is still queued unvalidated below
    }
  }
  cfg.queue = cfg.queue || [];
  cfg.queue.push({
    // Same collision problem as the chat !sr path — a unique id per entry
    // means removing/skipping one duplicate request never removes another.
    id: crypto.randomUUID(),
    title: body.title,
    url: body.url,
    thumbnail: body.thumbnail || null,
    queuedBy: session.login,
    durationSec: fetchedDurationSec,
  });
  cfg.playbackStopped = false;
  if (!cfg.nowPlaying) {
    startPlayback(cfg, cfg.queue.shift());
  }
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, nowPlaying: cfg.nowPlaying, queue: cfg.queue });
}

async function handleQueueAdvance(req: Request, env: Env): Promise<Response> {
  let login = new URL(req.url).searchParams.get("channel");
  if (!login || login === "self") {
    const session = await requireActiveSession(req, env);
    if (!session) return Response.json({ error: "channel required" }, { status: 400 });
    login = session.login;
  }
  const key = `channel:${login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || { queue: [] };
  cfg.queue = cfg.queue || [];
  cfg.playbackStopped = false;
  startPlayback(cfg, pickNextTrack(cfg));
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({
    nowPlaying: cfg.nowPlaying,
    queue: cfg.queue,
    playlist: cfg.playlist || [],
    nowPlayingStartedAt: cfg.nowPlayingStartedAt || null,
    nowPlayingDurationSec: cfg.nowPlayingDurationSec || null,
    next: peekNextTrack(cfg),
  });
}

async function handleQueueStop(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || { queue: [] };
  cfg.nowPlaying = null;
  cfg.paused = false;
  cfg.pausedAt = undefined;
  cfg.nowPlayingStartedAt = undefined;
  cfg.nowPlayingDurationSec = undefined;
  cfg.playbackStopped = true;
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, nowPlaying: null, queue: cfg.queue || [] });
}

async function handlePlaylistAdd(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  if (!cfg.isPro) {
    return Response.json({ error: "pro_required", message: "Плейлист доступен только с Pro-подпиской." }, { status: 403 });
  }
  const body: any = await req.json();
  if (!body.title || !body.url) return Response.json({ error: "title and url required" }, { status: 400 });
  cfg.playlist = Array.isArray(cfg.playlist) ? cfg.playlist : [];
  if (cfg.playlist.some((t: any) => t.url === body.url)) {
    return Response.json({ error: "already_in_playlist" }, { status: 400 });
  }
  cfg.playlist.push({
    id: crypto.randomUUID(),
    title: body.title,
    url: body.url,
    thumbnail: body.thumbnail || null,
    // Known when favoriting the current now-playing/queue track (both
    // already carry it) or when the caller already looked the video up via
    // /api/youtube/video; otherwise the widget backfills it on first play.
    durationSec: body.durationSec && body.durationSec > 0 ? body.durationSec : undefined,
  });
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, playlist: cfg.playlist });
}

async function handlePlaylistRemove(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  const body: any = await req.json();
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });
  const before = Array.isArray(cfg.playlist) ? cfg.playlist.length : 0;
  cfg.playlist = (cfg.playlist || []).filter((t: any) => t.id !== body.id);
  if (typeof cfg.playlistIndex === "number" && cfg.playlistIndex >= cfg.playlist.length) {
    cfg.playlistIndex = cfg.playlist.length - 1;
  }
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, removed: before - cfg.playlist.length, playlist: cfg.playlist });
}

async function handlePlaylistSettings(req: Request, env: Env): Promise<Response> {
  const session = await requireActiveSession(req, env);
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const key = `channel:${session.login}`;
  const cfg: any = (await env.TOKENS.get(key, "json")) || {};
  const body: any = await req.json();
  cfg.playlistShuffle = !!body.shuffle;
  await env.TOKENS.put(key, JSON.stringify(cfg));
  return Response.json({ ok: true, playlistShuffle: cfg.playlistShuffle });
}

async function handleWidget(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/widget/now-playing") return musicWidgetHtml(req);
  if (path === "/widget/chat") return chatWidgetHtml(req);
  if (path === "/widget/auction") return auctionWidgetHtml(req);
  if (path === "/widget/donation-alert") return donationAlertWidgetHtml(req);
  if (path === "/widget/donation-goal") return donationGoalWidgetHtml(req);
  if (path === "/widget/announce") return announceWidgetHtml(req);
  return new Response("Unknown widget", { status: 404 });
}

const MUSIC_DEFAULTS = {
  accent: "#a855f7",
  layout: "card",
  compact: false,
  cover: true,
  progress: true,
  next: true,
  glow: true,
  // When true, the whole widget disappears (instead of showing "Сейчас
  // ничего не играет") whenever the queue is empty — useful for streamers
  // who only want the widget visible while music is actually playing.
  autoHide: false,
  // 0-100, applied to the embedded YouTube player via the IFrame API's
  // setVolume(). OBS's own per-source Audio Mixer slider still works on
  // top of this (it scales whatever the page itself outputs), so this is
  // the widget's own baseline level, not a replacement for OBS's mixer.
  volume: 70,
};

function musicWidgetHtml(req: Request): Response {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  :root{--accent:${MUSIC_DEFAULTS.accent};}
  html,body{margin:0;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;}
  .wrap{position:relative;box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;
    background:#0a0a0e;border-radius:16px;padding:14px;display:flex;align-items:center;
    transition:border-radius .2s;}
  .wrap.layout-bar{border-radius:12px;padding:10px;}
  .wrap.empty{opacity:.55;}
  .glow{position:absolute;inset:0;opacity:.3;filter:blur(30px);
    background-image:linear-gradient(135deg, var(--accent), transparent);}
  .glow.hidden{display:none;}
  .row{position:relative;display:flex;align-items:center;gap:12px;width:100%;}
  .wrap.layout-card:not(.compact) .row{flex-direction:column;text-align:center;}
  .cover{flex:none;border-radius:10px;background-image:linear-gradient(135deg, var(--accent), #1a1a22);
    width:72px;height:72px;background-size:cover;background-position:center;transition:width .2s,height .2s;}
  .wrap.layout-bar .cover{width:36px;height:36px;}
  .wrap.compact .cover{width:48px;height:48px;}
  .cover.hidden{display:none;}
  .info{min-width:0;flex:1;}
  .wrap.layout-card:not(.compact) .info{width:100%;margin-top:8px;}
  .title{color:#fff;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .empty-text{color:#fff;opacity:.6;font-size:13px;}
  .sub{color:rgba(255,255,255,.5);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
  .bar{margin-top:8px;height:4px;width:100%;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;}
  .bar.hidden{display:none;}
  .fill{height:100%;border-radius:99px;background:var(--accent);width:0%;transition:width .3s linear;}
  .next{position:relative;margin-top:8px;font-size:11px;color:rgba(255,255,255,.35);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .next.hidden{display:none;}
  #player{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}
</style></head><body>
<div class="wrap layout-card" id="wrap">
  <div class="glow" id="glow"></div>
  <div class="row">
    <div class="cover" id="cover"></div>
    <div class="info">
      <div class="title" id="title">Загрузка…</div>
      <div class="sub" id="sub"></div>
      <div class="bar" id="barWrap"><div class="fill" id="fill"></div></div>
    </div>
  </div>
  <div class="next" id="next"></div>
</div>
<div id="player"></div>
<script>
(function () {
  var CHANNEL = ${JSON.stringify(channel)};
  var DEFAULTS = ${JSON.stringify(MUSIC_DEFAULTS)};
  var STORE_KEY = 'streops_np_url_' + CHANNEL;
  var settings = Object.assign({}, DEFAULTS);
  var player = null;
  var playerReady = false;
  var playerInitiated = false;
  // Persisted across reloads: browsers reliably allow audio-with-sound
  // autoplay only as part of a fresh page load, not from a later JS call
  // like player.loadVideoById()+playVideo() triggered by a background poll.
  // So instead of hot-swapping the video in place (which OBS/Chromium can
  // silently block), a track change forces a real page reload — same as
  // manually refreshing, which is what was already confirmed to work.
  var currentUrl = null;
  try { currentUrl = sessionStorage.getItem(STORE_KEY); } catch (e) {}
  var wrap = document.getElementById('wrap');
  var pendingVideoId = null;
  // Whether the very first load of this page (or a reload triggered by a
  // track change) should come up paused — read from the same poll that
  // gave us pendingVideoId, so a page refresh (OBS restarting, hitting
  // reload manually, a scene switch) never starts audio back up on its
  // own when the streamer had it paused.
  var pendingPaused = false;
  var durationReported = false;

  function applySettings() {
    document.documentElement.style.setProperty('--accent', settings.accent);
    wrap.className = 'wrap layout-' + settings.layout + (settings.compact ? ' compact' : '');
    document.getElementById('glow').classList.toggle('hidden', !settings.glow);
    document.getElementById('cover').classList.toggle('hidden', !settings.cover);
    document.getElementById('barWrap').classList.toggle('hidden', !settings.progress);
    document.getElementById('next').classList.toggle('hidden', !settings.next);
    if (playerReady && player && typeof player.setVolume === 'function') {
      player.setVolume(Math.max(0, Math.min(100, settings.volume == null ? 70 : settings.volume)));
    }
  }
  applySettings();

  function loadSettings() {
    fetch('/api/widget-settings?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        settings = Object.assign({}, DEFAULTS, data.music || {});
        applySettings();
      }).catch(function () {});
  }
  loadSettings();
  // Fast enough that a change saved in the dashboard shows up here well
  // under the 2-second target, without needing to reload the OBS source.
  setInterval(loadSettings, 1200);

  function extractId(url) {
    var m = (url || '').match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/shorts\\/|youtube\\.com\\/embed\\/)([\\w-]{11})/);
    return m ? m[1] : null;
  }

  function reloadTo(url) {
    try { sessionStorage.setItem(STORE_KEY, url || ''); } catch (e) {}
    location.reload();
  }

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      height: '1', width: '1',
      videoId: pendingVideoId || undefined,
      // autoplay:0 when the last known state was paused — otherwise the
      // embed itself would start playing regardless of what we do in
      // onReady below.
      playerVars: { autoplay: pendingPaused ? 0 : 1, controls: 0, playsinline: 1 },
      events: {
        onReady: function () {
          playerReady = true;
          // Some autoplay policies mute the embed regardless of the
          // playerVars passed at creation — an explicit unMute() plus
          // setVolume() is what actually makes sound come out, not just
          // the volume number by itself.
          player.unMute();
          player.setVolume(Math.max(0, Math.min(100, settings.volume == null ? 70 : settings.volume)));
          if (pendingVideoId && !pendingPaused) player.playVideo();
        },
        onStateChange: function (e) {
          if (e.data === YT.PlayerState.ENDED) advance();
        }
      }
    });
  };

  function advance() {
    fetch('/api/queue/advance?channel=' + encodeURIComponent(CHANNEL), { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) { reloadTo(data.nowPlaying ? data.nowPlaying.url : null); })
      .catch(function () {});
  }

  // Tracks the last paused state we actually applied to the player, so we
  // only call pauseVideo/playVideo on a real change — not every poll tick.
  var lastAppliedPaused = false;

  function render(data) {
    var np = data.nowPlaying;
    var titleEl = document.getElementById('title');
    var subEl = document.getElementById('sub');
    var coverEl = document.getElementById('cover');
    var nextEl = document.getElementById('next');

    if (!np) {
      wrap.style.display = settings.autoHide ? 'none' : '';
      wrap.classList.add('empty');
      titleEl.textContent = 'Сейчас ничего не играет';
      titleEl.className = 'empty-text';
      subEl.textContent = '';
      coverEl.style.backgroundImage = '';
      nextEl.textContent = '';
      if (currentUrl) reloadTo(null);
      if (player && playerReady) player.stopVideo();
      return;
    }
    wrap.style.display = '';
    wrap.classList.remove('empty');
    titleEl.className = 'title';
    var parts = String(np.title || '').split(' — ');
    titleEl.textContent = parts[0] || np.title || '';
    subEl.textContent = parts[1] || '';
    if (np.thumbnail) coverEl.style.backgroundImage = 'url(' + np.thumbnail + ')';
    nextEl.textContent = data.next ? ('Далее: ' + data.next.title) : '';

    if (!playerInitiated) {
      // First render of this page load — create the player already loaded
      // with whatever is currently playing, so it autoplays as part of
      // THIS navigation (the one browser context that reliably allows
      // audio autoplay). Any later track change reloads the page instead
      // of hot-swapping the video, since that swap is what was silently
      // getting blocked.
      playerInitiated = true;
      pendingVideoId = extractId(np.url);
      pendingPaused = !!data.paused;
      currentUrl = np.url;
      lastAppliedPaused = !!data.paused;
      try { sessionStorage.setItem(STORE_KEY, np.url); } catch (e) {}
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    } else if (np.url !== currentUrl) {
      reloadTo(np.url);
    } else if (!!data.paused !== lastAppliedPaused && player && playerReady) {
      // Same track, just a play/pause toggle from the dashboard — apply it
      // directly on the already-running player. No reload needed (and none
      // wanted: pausing/resuming an already-loaded player is always allowed
      // by browser autoplay policy, unlike starting a brand new video).
      lastAppliedPaused = !!data.paused;
      if (data.paused) player.pauseVideo(); else player.playVideo();
    }
  }

  function tickProgress() {
    if (!player || !playerReady || typeof player.getDuration !== 'function') return;
    var d = player.getDuration();
    var t = player.getCurrentTime();
    if (d > 0) document.getElementById('fill').style.width = Math.min(100, (t / d) * 100) + '%';
    // Report the real duration back once, straight from the player itself —
    // this is what lets the dashboard show a real progress bar even for
    // tracks that were never looked up against the YouTube API (playlist
    // entries added by hand, or seeded directly).
    if (!durationReported && d > 0 && currentUrl) {
      durationReported = true;
      fetch('/api/queue/observed-duration?channel=' + encodeURIComponent(CHANNEL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentUrl, durationSec: Math.round(d) }),
      }).catch(function () {});
    }
  }
  setInterval(tickProgress, 1000);

  function poll() {
    fetch('/api/queue?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {});
  }
  poll();
  // Fast enough that Пауза/Пропустить on the dashboard reach OBS well
  // under a couple seconds, not the old 5s lag.
  setInterval(poll, 1000);
})();
<\/script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function auctionWidgetHtml(req: Request): Response {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  :root{--accent:#f59e0b;}
  html,body{margin:0;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;height:100%;}
  .wrap{box-sizing:border-box;position:relative;width:100vw;height:100vh;overflow:hidden;background:#0a0a0e;
    border-radius:16px;padding:16px;display:none;flex-direction:column;gap:10px;}
  .wrap.show{display:flex;}
  :fullscreen, :-webkit-full-screen{border-radius:0;}
  /* Sits outside .wrap on purpose — .wrap is display:none whenever there's
     no live/ended auction to show, but the button to blow the (empty)
     overlay up for OBS window-capture should still work regardless. */
  .fsBtn{position:fixed;top:10px;right:10px;z-index:9999;width:30px;height:30px;border-radius:8px;border:none;
    background:rgba(255,255,255,.15);color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;
    justify-content:center;opacity:.6;transition:opacity .15s,background .15s;}
  .fsBtn:hover{opacity:1;background:rgba(255,255,255,.25);}
  .head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-right:34px;}
  .title{color:#fff;font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .timer{color:var(--accent);font-size:16px;font-weight:700;flex:none;font-variant-numeric:tabular-nums;}
  .rules{color:rgba(255,255,255,.5);font-size:12px;}
  .table{display:flex;flex-direction:column;gap:6px;overflow:hidden;}
  .opt{position:relative;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.06);padding:8px 10px;
    transition:opacity .5s,transform .5s;}
  .opt.gone{opacity:0;transform:scale(.9);}
  .opt .fillbar{position:absolute;inset:0;background:linear-gradient(90deg, var(--accent), transparent);
    opacity:.28;width:0%;transition:width .4s ease;}
  .opt .row{position:relative;display:flex;justify-content:space-between;gap:10px;}
  .opt .label{color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .opt .total{color:#fff;font-size:13px;font-weight:700;flex:none;}
  .opt.winner{background:rgba(245,158,11,.22);}
  .opt.winner .label{color:var(--accent);}
  .opt.eliminating{background:rgba(239,68,68,.28);}
  .ended{color:var(--accent);font-size:13px;font-weight:600;text-align:center;}
  .wheelBox{position:relative;flex:1;display:none;align-items:center;justify-content:center;min-height:0;}
  .wheelBox.show{display:flex;}
  .wheelPointer{position:absolute;top:calc(50% - 118px);left:50%;transform:translateX(-50%);
    width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;
    border-top:16px solid var(--accent);z-index:2;}
  #wheel{transition:transform 4.2s cubic-bezier(.13,.63,.1,1);}
</style></head><body>
<button class="fsBtn" id="fsBtn" title="На весь экран">⛶</button>
<div class="wrap" id="wrap">
  <div class="head"><div class="title" id="title"></div><div class="timer" id="timer"></div></div>
  <div class="rules" id="rules"></div>
  <div class="table" id="table"></div>
  <div class="wheelBox" id="wheelBox">
    <div class="wheelPointer"></div>
    <canvas id="wheel" width="240" height="240"></canvas>
  </div>
  <div class="ended" id="ended" style="display:none;"></div>
</div>
<script>
(function () {
  var CHANNEL = ${JSON.stringify(channel)};
  var wrap = document.getElementById('wrap');
  var titleEl = document.getElementById('title');
  var timerEl = document.getElementById('timer');
  var rulesEl = document.getElementById('rules');
  var tableEl = document.getElementById('table');
  var endedEl = document.getElementById('ended');
  var wheelBox = document.getElementById('wheelBox');
  var wheelCanvas = document.getElementById('wheel');
  var ctx = wheelCanvas.getContext('2d');
  var hideTimer = null;
  var animatedForAuctionId = null;
  var animating = false;

  document.getElementById('fsBtn').addEventListener('click', function () {
    if (document.fullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el);
  });

  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  var COLORS = ['#f59e0b', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c', '#4ade80', '#38bdf8'];

  function drawWheel(opts) {
    var cx = 120, cy = 120, r = 110;
    ctx.clearRect(0, 0, 240, 240);
    var weights = opts.map(function (o) { return o.total; });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) weights = opts.map(function () { return 1; }), total = opts.length;
    var start = -Math.PI / 2;
    opts.forEach(function (o, i) {
      var slice = (weights[i] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + slice / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.font = '600 12px system-ui,sans-serif';
      var label = o.label.length > 14 ? o.label.slice(0, 13) + '…' : o.label;
      ctx.fillText(label, r - 10, 4);
      ctx.restore();
      start += slice;
    });
    return weights.reduce(function (acc, w, i) {
      acc.push({ id: opts[i].id, from: acc.length ? acc[acc.length - 1].to : 0, to: (acc.length ? acc[acc.length - 1].to : 0) + w / total });
      return acc;
    }, []);
  }

  function spinTo(opts, winnerId, onDone) {
    var segs = drawWheel(opts);
    var seg = segs.find(function (s) { return s.id === winnerId; });
    var mid = seg ? (seg.from + seg.to) / 2 : 0;
    // Wheel draws starting at 12 o'clock; the pointer is fixed at 12 o'clock
    // too, so rotate the wheel until the winning slice's middle sits there.
    var targetDeg = 360 * 5 - mid * 360;
    wheelCanvas.style.transition = 'none';
    wheelCanvas.style.transform = 'rotate(0deg)';
    // Force reflow so the transition below actually animates from 0deg.
    void wheelCanvas.offsetWidth;
    wheelCanvas.style.transition = 'transform 4.2s cubic-bezier(.13,.63,.1,1)';
    requestAnimationFrame(function () {
      wheelCanvas.style.transform = 'rotate(' + targetDeg + 'deg)';
    });
    setTimeout(onDone, 4300);
  }

  function runEliminationThenSpin(auction, opts) {
    var order = auction.eliminationOrder || [];
    var remaining = opts.slice();
    var i = 0;
    function step() {
      if (i >= order.length) {
        spinTo(remaining, auction.winnerOptionId, function () {
          animating = false;
          showResult(auction, opts);
        });
        return;
      }
      drawWheel(remaining);
      var loserId = order[i];
      var rows = tableEl.querySelectorAll('.opt');
      rows.forEach(function (row) { if (row.dataset.id === loserId) row.classList.add('eliminating'); });
      setTimeout(function () {
        remaining = remaining.filter(function (o) { return o.id !== loserId; });
        var row = tableEl.querySelector('.opt[data-id="' + loserId + '"]');
        if (row) row.classList.add('gone');
        drawWheel(remaining);
        i++;
        setTimeout(step, 500);
      }, 700);
    }
    step();
  }

  function showResult(auction, opts) {
    var unit = auction.currency === 'points' ? 'баллов' : '₽';
    var winner = opts.find(function (o) { return o.id === auction.winnerOptionId; });
    endedEl.style.display = '';
    endedEl.textContent = winner ? ('Победил: ' + winner.label + (winner.total ? ' — ' + winner.total + ' ' + unit : '')) : 'Аукцион завершён';
    hideTimer = setTimeout(function () { wrap.classList.remove('show'); }, 30000);
  }

  function render(auction) {
    if (!auction) { wrap.classList.remove('show'); return; }
    clearTimeout(hideTimer);
    wrap.classList.add('show');
    titleEl.textContent = auction.title || '';
    var unit = auction.currency === 'points' ? 'баллов' : '₽';
    var mode = auction.finishMode || 'highest';
    var opts = (auction.options || []).slice().sort(function (a, b) { return b.total - a.total; });
    var max = opts.reduce(function (m, o) { return Math.max(m, o.total); }, 0) || 1;

    if (auction.status === 'live') {
      var how = auction.currency === 'points'
        ? 'Ставьте баллами канала — награда «Ставка на аукционе», впишите вариант.'
        : 'Ставьте донатом, указав вариант в комментарии.';
      rulesEl.textContent = how + (mode === 'roulette' ? ' Победитель определится рулеткой!' : mode === 'elimination' ? ' Победитель — рулеткой на выбывание!' : '');
      var endsAt = auction.endsAt ? new Date(auction.endsAt).getTime() : null;
      timerEl.textContent = endsAt ? fmt(endsAt - Date.now()) : '';
      endedEl.style.display = 'none';
      wheelBox.classList.remove('show');
      tableEl.style.display = '';
    } else if (auction.status === 'ended' && mode !== 'highest' && auction.winnerOptionId && animatedForAuctionId !== auction.id) {
      // Play the wheel exactly once per auction — later polls of the same
      // ended auction must not restart the spin from scratch.
      animatedForAuctionId = auction.id;
      animating = true;
      rulesEl.textContent = '';
      timerEl.textContent = '';
      endedEl.style.display = 'none';
      tableEl.style.display = mode === 'elimination' ? '' : 'none';
      wheelBox.classList.add('show');
      if (mode === 'elimination') {
        runEliminationThenSpin(auction, opts);
      } else {
        spinTo(opts, auction.winnerOptionId, function () { animating = false; showResult(auction, opts); });
      }
    } else if (!animating) {
      rulesEl.textContent = '';
      timerEl.textContent = '';
      tableEl.style.display = '';
      wheelBox.classList.remove('show');
      if (auction.status !== 'live') showResult(auction, opts);
    }

    if (!animating) {
      tableEl.innerHTML = '';
      opts.forEach(function (o) {
        var row = document.createElement('div');
        row.dataset.id = o.id;
        row.className = 'opt' + (auction.status !== 'live' && o.id === auction.winnerOptionId ? ' winner' : '');
        var pct = Math.round((o.total / max) * 100);
        row.innerHTML = '<div class="fillbar" style="width:' + pct + '%"></div>' +
          '<div class="row"><div class="label"></div><div class="total"></div></div>';
        row.querySelector('.label').textContent = o.label;
        row.querySelector('.total').textContent = o.total + ' ' + unit;
        tableEl.appendChild(row);
      });
    }
  }

  var lastAuction = null;
  function poll() {
    fetch('/api/auctions/public?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(function (data) { lastAuction = data.auction; render(lastAuction); })
      .catch(function () {});
  }
  poll();
  setInterval(poll, 2000);
  // Countdown ticks locally between polls so it doesn't visibly stutter.
  setInterval(function () {
    if (lastAuction && lastAuction.status === 'live' && lastAuction.endsAt) {
      timerEl.textContent = fmt(new Date(lastAuction.endsAt).getTime() - Date.now());
    }
  }, 1000);
})();
<\/script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

const DONATION_ALERT_DEFAULTS = { accent: "#22c55e", durationSec: 6, showMessage: true, minAmount: 0, imageUrl: "", soundUrl: "" };

function donationAlertWidgetHtml(req: Request): Response {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  :root{--accent:${DONATION_ALERT_DEFAULTS.accent};}
  html,body{margin:0;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;}
  .card{position:fixed;top:24px;left:50%;transform:translate(-50%,-140%);width:min(92vw,420px);box-sizing:border-box;
    background:#0a0a0e;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px 18px;
    display:flex;align-items:center;gap:14px;transition:transform .5s cubic-bezier(.2,.9,.25,1);}
  .card.show{transform:translate(-50%,0);}
  .icon{flex:none;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg, var(--accent), #1a1a22);
    display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700;overflow:hidden;}
  .icon img{width:100%;height:100%;object-fit:cover;}
  .body{min-width:0;}
  .top{color:#fff;font-size:15px;font-weight:700;}
  .top b{color:var(--accent);}
  .msg{margin-top:2px;color:rgba(255,255,255,.6);font-size:13px;overflow-wrap:anywhere;}
</style></head><body>
<div class="card" id="card">
  <div class="icon" id="icon">₽</div>
  <div class="body">
    <div class="top" id="top"></div>
    <div class="msg" id="msg"></div>
  </div>
</div>
<audio id="sound" style="display:none;"></audio>
<script>
(function () {
  var CHANNEL = ${JSON.stringify(channel)};
  var DEFAULTS = ${JSON.stringify(DONATION_ALERT_DEFAULTS)};
  var settings = Object.assign({}, DEFAULTS, { rules: [] });
  var card = document.getElementById('card');
  var icon = document.getElementById('icon');
  var top = document.getElementById('top');
  var msg = document.getElementById('msg');
  var soundEl = document.getElementById('sound');
  var lastId = undefined; // undefined = haven't polled yet, don't replay history on load
  var hideTimer = null;

  function applySettings() {
    document.documentElement.style.setProperty('--accent', settings.accent);
  }
  applySettings();

  function loadSettings() {
    fetch('/api/widget-settings?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        settings = Object.assign({}, DEFAULTS, { rules: [] }, data.donation || {});
        applySettings();
      }).catch(function () {});
  }
  loadSettings();
  setInterval(loadSettings, 5000);

  // Picks the highest-threshold rule the donation still clears — a 500-rub
  // rule beats a 100-rub rule for a 600-rub donation. Sorted here rather
  // than trusting save order, so it's correct regardless of how the rules
  // array was written.
  function pickRule(amount) {
    var rules = (settings.rules || []).slice().sort(function (a, b) { return (a.minAmount || 0) - (b.minAmount || 0); });
    var best = null;
    for (var i = 0; i < rules.length; i++) {
      if (amount >= (rules[i].minAmount || 0)) best = rules[i];
    }
    return best;
  }

  function show(d) {
    var rule = pickRule(d.amount);
    var imageUrl = (rule && rule.imageUrl) || settings.imageUrl || '';
    var soundUrl = (rule && rule.soundUrl) || settings.soundUrl || '';
    var durationSec = (rule && rule.durationSec) || settings.durationSec;

    icon.innerHTML = '';
    if (imageUrl) {
      var img = document.createElement('img');
      img.src = imageUrl;
      icon.appendChild(img);
    } else {
      icon.textContent = '₽';
    }

    top.innerHTML = '';
    var strong = document.createElement('b');
    strong.textContent = d.username;
    top.appendChild(strong);
    top.appendChild(document.createTextNode(' — ' + d.amount + ' ' + (d.currency || '')));
    msg.textContent = settings.showMessage ? (d.message || '') : '';

    if (soundUrl) {
      soundEl.src = soundUrl;
      soundEl.play().catch(function () {});
    }

    clearTimeout(hideTimer);
    card.classList.add('show');
    hideTimer = setTimeout(function () { card.classList.remove('show'); }, durationSec * 1000);
  }

  function poll() {
    fetch('/api/donationalerts/latest?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var d = data.donation;
        if (!d) return;
        if (lastId === undefined) { lastId = d.id; return; }
        if (d.id === lastId) return;
        lastId = d.id;
        if (d.amount < (settings.minAmount || 0)) return;
        show(d);
      }).catch(function () {});
  }
  poll();
  setInterval(poll, 2000);
})();
<\/script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function donationGoalWidgetHtml(req: Request): Response {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  :root{--accent:#22c55e;}
  html,body{margin:0;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;}
  .wrap{box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;background:#0a0a0e;border-radius:16px;
    padding:16px 20px;display:none;flex-direction:column;justify-content:center;gap:8px;}
  .wrap.show{display:flex;}
  .head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
  .title{color:#fff;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .nums{color:var(--accent);font-size:14px;font-weight:700;flex:none;font-variant-numeric:tabular-nums;}
  .track{height:14px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;}
  .fill{height:100%;border-radius:99px;background:linear-gradient(90deg, var(--accent), #86efac);width:0%;
    transition:width .6s ease;}
  .pct{align-self:flex-end;color:rgba(255,255,255,.4);font-size:12px;}
</style></head><body>
<div class="wrap" id="wrap">
  <div class="head"><div class="title" id="title"></div><div class="nums" id="nums"></div></div>
  <div class="track"><div class="fill" id="fill"></div></div>
  <div class="pct" id="pct"></div>
</div>
<script>
(function () {
  var CHANNEL = ${JSON.stringify(channel)};
  var wrap = document.getElementById('wrap');
  var title = document.getElementById('title');
  var nums = document.getElementById('nums');
  var fill = document.getElementById('fill');
  var pct = document.getElementById('pct');

  function render(goal) {
    if (!goal) { wrap.classList.remove('show'); return; }
    wrap.classList.add('show');
    document.documentElement.style.setProperty('--accent', '#22c55e');
    title.textContent = goal.title;
    var ratio = goal.targetAmount > 0 ? Math.min(1, goal.currentAmount / goal.targetAmount) : 0;
    nums.textContent = goal.currentAmount + ' / ' + goal.targetAmount + ' ' + goal.currency;
    fill.style.width = Math.round(ratio * 100) + '%';
    pct.textContent = Math.round(ratio * 100) + '%';
  }

  function poll() {
    fetch('/api/donationalerts/goal-public?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data.goal); })
      .catch(function () {});
  }
  poll();
  setInterval(poll, 4000);
})();
<\/script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

const CHAT_DEFAULTS = {
  accent: "#a855f7",
  size: "md",
  opacity: 20,
  font: "sans",
  anim: "fade",
  radius: 16,
  maxLines: 6,
  badges: true,
  timestamps: false,
  shadow: true,
  hideCommands: true,
  // Hides the bot's own chat messages (command replies, "!sr" confirmations,
  // warnings) from the overlay, so only real viewer chat shows on stream.
  hideBot: false,
};

function chatWidgetHtml(req: Request): Response {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const wsUrl = `wss://${url.host}/widget/chat-stream?channel=${encodeURIComponent(channel)}`;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  :root{--accent:${CHAT_DEFAULTS.accent};--opacity:0.2;--radius:16px;--fontsize:14px;}
  html,body{margin:0;background:transparent;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;}
  html.font-mono,body.font-mono{font-family:ui-monospace,monospace;}
  #wrap{box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;padding:14px;
    background:rgba(10,10,14,var(--opacity));border-radius:var(--radius);
    display:flex;flex-direction:column-reverse;gap:6px;}
  .msg{font-size:var(--fontsize);line-height:1.4;color:rgba(255,255,255,.9);word-break:break-word;}
  .msg.shadow{text-shadow:0 1px 3px rgba(0,0,0,.8);}
  .msg .ts{color:rgba(255,255,255,.3);margin-right:6px;}
  .msg .badge{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle;}
  .msg .user{font-weight:600;}
  .msg .text{color:rgba(255,255,255,.85);}
  .msg.enter-fade{animation:fadeIn .35s ease both;}
  .msg.enter-slide{animation:slideIn .35s ease both;}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style></head><body>
<div id="wrap"></div>
<script>
${TTS_ENGINE_JS}
(function () {
  var CHANNEL = ${JSON.stringify(channel)};
  var DEFAULTS = ${JSON.stringify(CHAT_DEFAULTS)};
  var settings = Object.assign({}, DEFAULTS);
  var wrap = document.getElementById('wrap');
  var wsUrl = ${JSON.stringify(wsUrl)};
  var backoff = 1000;
  var FONT_SIZES = { sm: '12px', md: '14px', lg: '16px' };

  function applySettings() {
    var root = document.documentElement;
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--opacity', Math.max(0, Math.min(80, settings.opacity)) / 100);
    root.style.setProperty('--radius', settings.radius + 'px');
    root.style.setProperty('--fontsize', FONT_SIZES[settings.size] || '14px');
    document.body.className = settings.font === 'mono' ? 'font-mono' : '';
    while (wrap.children.length > settings.maxLines) wrap.removeChild(wrap.lastChild);
  }
  applySettings();

  function loadSettings() {
    fetch('/api/widget-settings?channel=' + encodeURIComponent(CHANNEL))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        settings = Object.assign({}, DEFAULTS, data.chat || {});
        applySettings();
      }).catch(function () {});
  }
  loadSettings();
  // Fast enough that a change saved in the dashboard shows up here well
  // under the 2-second target, without needing to reload the OBS source.
  setInterval(loadSettings, 1200);

  function roleColor(role, color) {
    if (color) return color;
    if (role === 'moderator') return '#38bdf8';
    if (role === 'subscriber') return '#34d399';
    if (role === 'bot') return settings.accent;
    return '#ffffff';
  }

  function addMessage(m) {
    if (settings.hideBot && m.role === 'bot') return;
    if (settings.hideCommands && (m.text || '').trim().charAt(0) === '!') return;
    var el = document.createElement('div');
    el.className = 'msg' + (settings.shadow ? ' shadow' : '') +
      (settings.anim === 'fade' ? ' enter-fade' : settings.anim === 'slide' ? ' enter-slide' : '');
    var html = '';
    if (settings.timestamps) {
      var d = new Date(m.ts || Date.now());
      html += '<span class="ts">' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + '</span>';
    }
    if (settings.badges && m.badges) {
      html += '<span class="badge" style="background:' + roleColor(m.role, m.color) + '"></span>';
    }
    html += '<span class="user" style="color:' + roleColor(m.role, m.color) + '">' + escapeHtml(m.user) + '</span>';
    html += '<span class="text">: ' + escapeHtml(m.text) + '</span>';
    el.innerHTML = html;
    wrap.prepend(el);
    while (wrap.children.length > settings.maxLines) wrap.removeChild(wrap.lastChild);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function connect() {
    var ws = new WebSocket(wsUrl);
    ws.onopen = function () { backoff = 1000; };
    ws.onmessage = function (ev) {
      try {
        var data = JSON.parse(ev.data);
        if (data.type === 'speak') { streopsSpeak(data.text); return; }
        addMessage(data);
      } catch (e) {}
    };
    ws.onclose = ws.onerror = function () {
      setTimeout(connect, backoff);
      backoff = Math.min(15000, backoff * 1.5);
    };
  }
  connect();
})();
<\/script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
