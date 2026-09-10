// Twitch Helix API helpers, token management, and the signed-cookie session
// scheme. Everything here is shared by both bot.ts (the per-channel Durable
// Object) and index.ts (the HTTP Worker).

import type { Env, Session } from "./types";

const HELIX = "https://api.twitch.tv/helix";

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function helix(
  env: Env,
  path: string,
  token: string,
  init: RequestInit = {},
  clientId?: string
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Client-Id", clientId || env.TWITCH_CLIENT_ID);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetchWithTimeout(`${HELIX}${path}`, { ...init, headers });
}

export async function refreshUserToken(env: Env, login: string, refreshToken: string): Promise<any | null> {
  const res = await fetchWithTimeout("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
    }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  await env.TOKENS.put(
    `user:${login}`,
    JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token }),
    { expirationTtl: 60 * 60 * 24 * 90 }
  );
  return data;
}

/**
 * Returns a valid access token for the bot's own Twitch account, refreshing
 * it first if Twitch no longer considers it valid. Cached in KV under
 * "bot:token" once refreshed; falls back to the BOT_ACCESS_TOKEN/
 * BOT_REFRESH_TOKEN secrets on a cold start (nothing cached yet).
 */
export async function getBotToken(env: Env): Promise<string> {
  const stored: any = await env.TOKENS.get("bot:token", "json");
  const refreshToken = stored?.refresh_token || env.BOT_REFRESH_TOKEN;
  const accessToken = stored?.access_token || env.BOT_ACCESS_TOKEN;
  const validate = await fetchWithTimeout("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (validate.ok) return accessToken;
  const res = await fetchWithTimeout("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.BOT_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh bot token: " + (await res.text()));
  const data: any = await res.json();
  await env.TOKENS.put(
    "bot:token",
    JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token })
  );
  return data.access_token;
}

/** Returns the broadcaster's own user-token (refreshing if needed), or null if they never linked / it can no longer be refreshed. */
export async function getBroadcasterToken(env: Env, login: string): Promise<string | null> {
  const stored: any = await env.TOKENS.get(`user:${login}`, "json");
  if (!stored) return null;
  const validate = await fetchWithTimeout("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${stored.access_token}` },
  });
  if (validate.ok) return stored.access_token;
  const refreshed = await refreshUserToken(env, login, stored.refresh_token);
  return refreshed?.access_token || null;
}

/** App access token (client_credentials grant) — used for EventSub subscription management. */
export async function getAppAccessToken(env: Env): Promise<string> {
  const cached: any = await env.TOKENS.get("app:token", "json");
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.access_token;
  const res = await fetchWithTimeout("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error("Failed to get app access token: " + (await res.text()));
  const data: any = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;
  await env.TOKENS.put("app:token", JSON.stringify({ access_token: data.access_token, expiresAt }));
  return data.access_token;
}

export async function getUserByLogin(env: Env, login: string, token: string, clientId?: string): Promise<any | null> {
  const res = await helix(env, `/users?login=${encodeURIComponent(login)}`, token, {}, clientId);
  if (!res.ok) return null;
  const data: any = await res.json();
  return data.data?.[0] || null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Signs a session payload into `body.signature` form for the streops_session cookie — a minimal signed-cookie scheme, not a JWT library. */
export async function signSession(env: Env, payload: Session): Promise<string> {
  const body = btoa(JSON.stringify(payload));
  const key = await hmacKey(env.SESSION_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${body}.${sigB64}`;
}

export async function verifySession(env: Env, token: string): Promise<Session | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await hmacKey(env.SESSION_SECRET);
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)));
  if (expectedB64 !== sig) return null;
  try {
    return JSON.parse(atob(body));
  } catch {
    return null;
  }
}

export function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
