import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../env";
import { randomBase32, encryptSecret } from "./crypto";
import { upsertDonatedToken } from "../db/queries/donatedTokens";

const STATE_COOKIE = "gh_oauth_state";
const FLOW_COOKIE = "gh_oauth_flow";

export type GithubOAuthFlow = "donate" | "consumer";

function isHttps(c: Context<{ Bindings: Env }>): boolean {
  return c.env.BASE_URL.startsWith("https://");
}

export function startGithubOAuth(c: Context<{ Bindings: Env }>, flow: GithubOAuthFlow): Response {
  const state = randomBase32(16);
  const secure = isHttps(c);
  setCookie(c, STATE_COOKIE, state, { path: "/", httpOnly: true, sameSite: "Lax", secure, maxAge: 300 });
  setCookie(c, FLOW_COOKIE, flow, { path: "/", httpOnly: true, sameSite: "Lax", secure, maxAge: 300 });

  const redirectUri = `${c.env.BASE_URL.replace(/\/+$/, "")}/auth/github/callback`;
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", c.env.GITHUB_OAUTH_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", "read:user");
  u.searchParams.set("state", state);
  return c.redirect(u.toString(), 302);
}

interface GhTokenResp {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GhUser {
  login: string;
  id: number;
}

export interface GithubDonationResult {
  flow: GithubOAuthFlow;
  githubUser: string;
  donatedTokenId: string;
}

/**
 * Handles GET /auth/github/callback for both the /donate and /get-access
 * flows (distinguished by the gh_oauth_flow cookie set in startGithubOAuth).
 * Validates state, exchanges the code, fetches the GitHub user, encrypts and
 * upserts the donated token. Does NOT touch api_keys — that linkage (for the
 * consumer flow) is the caller's job in routes/get-access.ts.
 */
export async function handleGithubCallback(
  c: Context<{ Bindings: Env }>,
  donorHcIdentityId: string | null,
): Promise<GithubDonationResult | Response> {
  const err = c.req.query("error");
  if (err) return c.text(`oauth error: ${err}`, 400);

  const state = c.req.query("state");
  const cookieState = getCookie(c, STATE_COOKIE);
  const flow = (getCookie(c, FLOW_COOKIE) as GithubOAuthFlow | undefined) ?? "donate";
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  deleteCookie(c, FLOW_COOKIE, { path: "/" });

  if (!state || !cookieState || state !== cookieState) {
    return c.text("invalid oauth state", 400);
  }
  const code = c.req.query("code");
  if (!code) return c.text("missing code", 400);

  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: c.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: c.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    return c.text(`oauth token exchange failed (${tokenResp.status}): ${body}`, 502);
  }
  const tok = (await tokenResp.json()) as GhTokenResp;
  if (!tok.access_token) {
    return c.text(`no token: ${tok.error_description ?? tok.error ?? "unknown error"}`, 400);
  }

  const userResp = await fetch("https://api.github.com/user", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tok.access_token}` },
  });
  if (!userResp.ok) return c.text("failed to fetch GitHub user", 502);
  const user = (await userResp.json()) as GhUser;
  if (!user.login) return c.text("no user", 400);

  const { ciphertext, iv } = await encryptSecret(tok.access_token, c.env.TOKEN_ENCRYPTION_KEY);
  const id = crypto.randomUUID();
  const donatedTokenId = await upsertDonatedToken(c.env.DB, {
    id,
    githubUser: user.login,
    githubUserId: user.id,
    tokenCiphertext: ciphertext,
    tokenIv: iv,
    scopes: tok.scope ?? null,
    donorHcIdentityId: flow === "consumer" ? donorHcIdentityId : null,
  });

  return { flow, githubUser: user.login, donatedTokenId };
}
