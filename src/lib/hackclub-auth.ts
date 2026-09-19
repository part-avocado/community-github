import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../env";
import { randomBase32, bufferToHex, signSession, verifySession } from "./crypto";
import { upsertHcIdentity } from "../db/queries/hcIdentities";
import type { HcIdentityRow } from "../db/schema";

const STATE_COOKIE = "hca_state";
const VERIFIER_COOKIE = "hca_verifier";
const RETURN_COOKIE = "hca_return";
export const SESSION_COOKIE = "hc_session";

const AUTHORIZE_URL = "https://auth.hackclub.com/oauth/authorize";
const TOKEN_URL = "https://auth.hackclub.com/oauth/token";
const USERINFO_URL = "https://auth.hackclub.com/api/v1/me";
const SCOPES = "openid profile email name slack_id verification_status";

function isHttps(c: Context<{ Bindings: Env }>): boolean {
  return c.env.BASE_URL.startsWith("https://");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function startHackclubOAuth(c: Context<{ Bindings: Env }>, returnTo: string): Promise<Response> {
  const state = randomBase32(16);
  const verifier = randomBase32(32);
  const secure = isHttps(c);
  setCookie(c, STATE_COOKIE, state, { path: "/", httpOnly: true, sameSite: "Lax", secure, maxAge: 300 });
  setCookie(c, VERIFIER_COOKIE, verifier, { path: "/", httpOnly: true, sameSite: "Lax", secure, maxAge: 300 });
  setCookie(c, RETURN_COOKIE, returnTo, { path: "/", httpOnly: true, sameSite: "Lax", secure, maxAge: 300 });

  const challenge = await pkceChallenge(verifier);
  const redirectUri = `${c.env.BASE_URL.replace(/\/+$/, "")}/auth/hackclub/callback`;
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", c.env.HACKCLUB_OAUTH_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return c.redirect(u.toString(), 302);
}

interface HcaTokenResp {
  access_token?: string;
  error?: string;
  error_description?: string;
}

// Field names below follow the OmniAuth Hack Club Auth strategy's `info`
// shape (email/name/first_name/last_name/slack_id/verification_status) —
// see README for the note that the exact verification_status enum values
// should be confirmed against a live HCA OAuth app.
interface HcaUserInfo {
  sub?: string;
  id?: string;
  email?: string;
  name?: string;
  slack_id?: string;
  verification_status?: string;
}

export interface HackclubCallbackResult {
  identity: HcIdentityRow;
  returnTo: string;
}

export async function handleHackclubCallback(
  c: Context<{ Bindings: Env }>,
): Promise<HackclubCallbackResult | Response> {
  const err = c.req.query("error");
  if (err) return c.text(`hack club auth error: ${err}`, 400);

  const state = c.req.query("state");
  const cookieState = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);
  const returnTo = getCookie(c, RETURN_COOKIE) ?? "/get-access";
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  deleteCookie(c, VERIFIER_COOKIE, { path: "/" });
  deleteCookie(c, RETURN_COOKIE, { path: "/" });

  if (!state || !cookieState || state !== cookieState || !verifier) {
    return c.text("invalid oauth state", 400);
  }
  const code = c.req.query("code");
  if (!code) return c.text("missing code", 400);

  const redirectUri = `${c.env.BASE_URL.replace(/\/+$/, "")}/auth/hackclub/callback`;
  const tokenResp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.env.HACKCLUB_OAUTH_CLIENT_ID,
      client_secret: c.env.HACKCLUB_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  if (!tokenResp.ok) {
    return c.text(`hack club auth token exchange failed (${tokenResp.status}): ${await tokenResp.text()}`, 502);
  }
  const tok = (await tokenResp.json()) as HcaTokenResp;
  if (!tok.access_token) {
    return c.text(`no token: ${tok.error_description ?? tok.error ?? "unknown error"}`, 400);
  }

  const infoResp = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
  });
  if (!infoResp.ok) return c.text("failed to fetch Hack Club Auth identity", 502);
  const info = (await infoResp.json()) as HcaUserInfo;
  const hcUserId = info.sub ?? info.id;
  if (!hcUserId) return c.text("no user id in Hack Club Auth response", 400);

  const identity = await upsertHcIdentity(c.env.DB, {
    hcUserId,
    slackId: info.slack_id ?? null,
    email: info.email ?? null,
    name: info.name ?? null,
    verificationStatus: info.verification_status ?? null,
  });

  return { identity, returnTo };
}

export interface SessionPayload {
  hcIdentityId: string;
  exp: number;
}

export async function issueSession(c: Context<{ Bindings: Env }>, hcIdentityId: string): Promise<void> {
  const payload: SessionPayload = { hcIdentityId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  const token = await signSession(payload, c.env.SESSION_SIGNING_KEY);
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttps(c),
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function currentSession(c: Context<{ Bindings: Env }>): Promise<SessionPayload | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySession<SessionPayload>(token, c.env.SESSION_SIGNING_KEY);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

export function isEligible(status: string | null, env: Env): boolean {
  if (!status) return false;
  const allowed = env.ALLOWED_VERIFICATION_STATUSES.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(status);
}

// Re-exported for callers that need a stable hex id for logging without
// leaning on the raw hc_user_id.
export function hashId(s: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(bufferToHex);
}
