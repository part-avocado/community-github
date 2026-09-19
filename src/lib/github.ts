import type { Env } from "../env";
import type { RateLimitCategory } from "../db/schema";
import { chooseToken, upsertRateLimitFromHeaders } from "../db/queries/tokenRateLimits";
import { markRevoked } from "../db/queries/donatedTokens";
import { decryptSecret } from "./crypto";

export function categoryFor(url: string): RateLimitCategory {
  if (url.includes("/graphql")) return "graphql";
  if (url.includes("/search/code")) return "code_search";
  if (url.includes("/search/")) return "search";
  return "core";
}

// Token selection is best-effort/racy by design (same as the Go version) —
// a short per-isolate cache avoids a redundant D1 read on every request in a
// burst without needing a dedicated Durable Object.
const tokenCache = new Map<RateLimitCategory, { id: string; ciphertext: ArrayBuffer; iv: ArrayBuffer; expiresAtMs: number }>();
const TOKEN_CACHE_TTL_MS = 2000;

async function pickToken(db: D1Database, category: RateLimitCategory) {
  const cached = tokenCache.get(category);
  if (cached && cached.expiresAtMs > Date.now()) return cached;
  const chosen = await chooseToken(db, category);
  if (!chosen) {
    tokenCache.delete(category);
    return null;
  }
  const entry = { id: chosen.id, ciphertext: chosen.tokenCiphertext, iv: chosen.tokenIv, expiresAtMs: Date.now() + TOKEN_CACHE_TTL_MS };
  tokenCache.set(category, entry);
  return entry;
}

export interface ProxyResult {
  status: number;
  headers: Headers;
  body: ArrayBuffer;
  usedTokenId: string | null;
}

const ALLOWED_HOST = "api.github.com";

export interface WaitUntilCtx {
  waitUntil(promise: Promise<unknown>): void;
}

export async function doProxyRequest(
  env: Env,
  ctx: WaitUntilCtx,
  method: string,
  rawUrl: string,
  body: ArrayBuffer | null,
  contentType?: string | null,
): Promise<ProxyResult> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" || parsed.host !== ALLOWED_HOST) {
    throw new Error("disallowed request target");
  }
  const category = categoryFor(parsed.toString());
  const picked = await pickToken(env.DB, category);
  if (!picked) {
    return { status: 0, headers: new Headers(), body: new ArrayBuffer(0), usedTokenId: null };
  }

  let token: string;
  try {
    token = await decryptSecret(picked.ciphertext, picked.iv, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    tokenCache.delete(category);
    return { status: 0, headers: new Headers(), body: new ArrayBuffer(0), usedTokenId: null };
  }

  const upstream = await fetch(parsed.toString(), {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "gh-proxy/2.0 (community; Cloudflare Workers)",
      Authorization: `Bearer ${token}`,
      ...(body && contentType ? { "Content-Type": contentType } : {}),
    },
    body: body ?? undefined,
  });
  const respBody = await upstream.arrayBuffer();

  if (upstream.status === 401 || upstream.status === 403) {
    let shouldRevoke = upstream.status === 401;
    if (upstream.status === 403) {
      try {
        const text = new TextDecoder().decode(respBody);
        const parsed403 = JSON.parse(text) as { message?: string };
        if ((parsed403.message ?? "").toLowerCase().includes("bad credentials")) shouldRevoke = true;
      } catch {
        // not JSON, ignore
      }
    }
    if (shouldRevoke) {
      tokenCache.delete(category);
      ctx.waitUntil(markRevoked(env.DB, picked.id));
      return { status: upstream.status, headers: upstream.headers, body: respBody, usedTokenId: picked.id };
    }
  }

  // Deliberate improvement over the Go version: parse the X-RateLimit-*
  // headers already on this response instead of firing a second /rate_limit
  // call after every proxied request.
  const limit = upstream.headers.get("x-ratelimit-limit");
  const remaining = upstream.headers.get("x-ratelimit-remaining");
  const reset = upstream.headers.get("x-ratelimit-reset");
  if (limit && remaining && reset) {
    ctx.waitUntil(
      upsertRateLimitFromHeaders(env.DB, picked.id, category, Number(limit), Number(remaining), Number(reset)),
    );
  }

  return { status: upstream.status, headers: upstream.headers, body: respBody, usedTokenId: picked.id };
}

export { ALLOWED_HOST };
