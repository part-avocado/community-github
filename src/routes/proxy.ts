import { Hono } from "hono";
import type { Env } from "../env";
import { jsonError } from "../lib/errors";
import { sha256Hex, maskKey } from "../lib/crypto";
import { apiKeyByHash, touchApiKeyUsage } from "../db/queries/apiKeys";
import { donorUsernameById } from "../db/queries/donatedTokens";
import { recordRequest, logRequest, getSystemStats } from "../db/queries/stats";
import { checkRateLimit } from "../lib/ratelimit-client";
import { setRateLimitHeaders, retryAfterSeconds, defaultRateLimitState } from "../lib/ratelimit-headers";
import { DEFAULT_RATE_LIMIT_PER_SEC } from "../middleware/rate-limit-policy-header";
import { doProxyRequest, categoryFor, ALLOWED_HOST } from "../lib/github";
import { getCachedResponse, putCachedResponse, isCacheable, skipCaching } from "../lib/cache";
import { broadcastRecent, broadcastStats } from "../lib/admin-hub-client";

export const proxyRoutes = new Hono<{ Bindings: Env }>();

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const BLOCKED_RESPONSE_HEADERS = new Set(["set-cookie", "strict-transport-security", "public-key-pins", "content-length"]);

function copyableHeaders(src: Headers): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of src.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || BLOCKED_RESPONSE_HEADERS.has(lower)) continue;
    (out[key] ??= []).push(value);
  }
  return out;
}

function applyHeaders(dst: Headers, headers: Record<string, string[]>): void {
  for (const [key, values] of Object.entries(headers)) {
    for (const v of values) dst.append(key, v);
  }
}

proxyRoutes.all("/graphql", (c) => handleProxy(c, "https://api.github.com/graphql"));
proxyRoutes.all("/*", (c) => {
  const rest = c.req.path.replace(/^\/gh\//, "");
  return handleProxy(c, `https://${ALLOWED_HOST}/${rest}`);
});

async function handleProxy(c: import("hono").Context<{ Bindings: Env }>, target: string): Promise<Response> {
  const apiKey = (c.req.header("x-api-key") ?? "").trim();
  if (!apiKey) {
    const headers = new Headers();
    setRateLimitHeaders(headers, defaultRateLimitState(DEFAULT_RATE_LIMIT_PER_SEC));
    return jsonError(c, "MISSING_API_KEY", "Missing X-API-Key header", "Include your API key in the X-API-Key header", 401, undefined, headers);
  }

  const apiKeyHash = await sha256Hex(apiKey);
  const keyRow = await apiKeyByHash(c.env.DB, apiKeyHash);
  if (!keyRow) {
    console.log(`deny unknown key: ${maskKey(apiKey)}`);
    return jsonError(c, "INVALID_API_KEY", "Unknown API key", "Check the X-API-Key header value, or get one at /get-access", 401);
  }
  if (keyRow.disabled) {
    console.log(`deny disabled key: ${maskKey(apiKey)}`);
    return jsonError(c, "API_KEY_DISABLED", "API key disabled", "Your key was disabled by an administrator", 403);
  }

  const rl = await checkRateLimit(c.env, apiKeyHash, keyRow.rate_limit_per_sec);
  if (!rl.allowed) {
    console.log(`429 rate limit for key ${maskKey(apiKey)}`);
    const headers = new Headers();
    setRateLimitHeaders(headers, rl);
    headers.set("Retry-After", String(retryAfterSeconds(rl)));
    return jsonError(
      c,
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded",
      `This key allows ${rl.limit} requests/second; retry after ${retryAfterSeconds(rl)} second(s) and back off exponentially`,
      429,
      undefined,
      headers,
    );
  }

  const maxBodyBytes = Number(c.env.MAX_PROXY_BODY_BYTES || "1048576");
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (maxBodyBytes > 0 && contentLength > maxBodyBytes) {
    const headers = new Headers();
    setRateLimitHeaders(headers, rl);
    return jsonError(c, "REQUEST_TOO_LARGE", "Request body too large", `Maximum allowed size is ${maxBodyBytes} bytes`, 413, undefined, headers);
  }

  const method = c.req.method;
  const bodyBuf = method === "GET" || method === "HEAD" ? new ArrayBuffer(0) : await c.req.arrayBuffer();
  if (maxBodyBytes > 0 && bodyBuf.byteLength > maxBodyBytes) {
    const headers = new Headers();
    setRateLimitHeaders(headers, rl);
    return jsonError(c, "REQUEST_TOO_LARGE", "Request body too large", `Maximum allowed size is ${maxBodyBytes} bytes`, 413, undefined, headers);
  }

  const url = new URL(c.req.url);
  const fullTarget = target + (url.search ?? "");
  const category = categoryFor(fullTarget);
  const cacheable = isCacheable(method);

  if (cacheable) {
    const hit = await getCachedResponse(c.env, method, fullTarget, bodyBuf);
    if (hit) {
      const headers = new Headers();
      applyHeaders(headers, hit.headers);
      headers.set("X-Gh-Proxy-Cache", "hit");
      headers.set("X-Gh-Proxy-Category", category);
      headers.set("X-Gh-Proxy-Client", `${keyRow.app_name}_${keyRow.machine}`);
      setRateLimitHeaders(headers, rl);
      c.executionCtx.waitUntil(afterRequest(c.env, apiKeyHash, method, url.pathname, hit.status, true));
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  const result = await doProxyRequest(
    c.env,
    c.executionCtx,
    method,
    fullTarget,
    bodyBuf.byteLength > 0 ? bodyBuf : null,
    c.req.header("content-type"),
  );
  if (result.status === 0) {
    const headers = new Headers();
    setRateLimitHeaders(headers, rl);
    c.executionCtx.waitUntil(afterRequest(c.env, apiKeyHash, method, url.pathname, 502, false));
    return jsonError(
      c,
      "UPSTREAM_ERROR",
      "Could not reach the GitHub API",
      "The proxy could not complete the upstream request; retry with backoff",
      502,
      undefined,
      headers,
    );
  }

  if (cacheable && result.status === 200 && !skipCaching(result.headers.get("cache-control"))) {
    c.executionCtx.waitUntil(putCachedResponse(c.env, method, fullTarget, bodyBuf, result.status, copyableHeaders(result.headers), result.body));
  }

  const headers = new Headers();
  applyHeaders(headers, copyableHeaders(result.headers));
  headers.set("X-Gh-Proxy-Cache", "miss");
  headers.set("X-Gh-Proxy-Category", category);
  headers.set("X-Gh-Proxy-Client", `${keyRow.app_name}_${keyRow.machine}`);
  setRateLimitHeaders(headers, rl);
  if (result.usedTokenId) {
    const donor = await donorUsernameById(c.env.DB, result.usedTokenId);
    if (donor) headers.set("X-Gh-Proxy-Donor", donor);
  }

  c.executionCtx.waitUntil(afterRequest(c.env, apiKeyHash, method, url.pathname, result.status, false));
  return new Response(result.body, { status: result.status, headers });
}

async function afterRequest(env: Env, apiKeyHash: string, method: string, path: string, status: number, hit: boolean): Promise<void> {
  await Promise.all([
    recordRequest(env.DB, hit),
    logRequest(env.DB, apiKeyHash, method, path, status, hit),
    touchApiKeyUsage(env.DB, apiKeyHash, hit),
  ]);
  await broadcastRecent(env, { method, path, created_at: new Date().toISOString() });
  const stats = await getSystemStats(env.DB);
  await broadcastStats(env, stats);
}
