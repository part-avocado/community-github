import type { Env } from "../env";
import { sha256HexBytes } from "./crypto";
import {
  findCachedResponse,
  insertCachedResponse,
  totalCacheSizeBytes,
  oldestCacheRows,
  deleteCacheRowsById,
  expiredCacheRows,
  countCacheRows,
} from "../db/queries/cache";

export interface CacheHit {
  status: number;
  headers: Record<string, string[]>;
  body: ArrayBuffer;
}

function contentHashOf(body: ArrayBuffer): Promise<string> {
  return sha256HexBytes(body);
}

export async function getCachedResponse(
  env: Env,
  method: string,
  url: string,
  reqBody: ArrayBuffer,
): Promise<CacheHit | null> {
  const hash = await contentHashOf(reqBody);
  const row = await findCachedResponse(env.DB, method, url, hash);
  if (!row) return null;
  const obj = await env.CACHE_BUCKET.get(row.r2_key);
  if (!obj) return null; // D1/R2 aren't transactional; treat a missing object as a miss
  const body = await obj.arrayBuffer();
  return { status: row.status, headers: JSON.parse(row.resp_headers), body };
}

const NO_CACHE_DIRECTIVES = ["no-cache", "no-store"];

export function isCacheable(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

export function skipCaching(cacheControl: string | null): boolean {
  if (!cacheControl) return false;
  const lower = cacheControl.toLowerCase();
  return NO_CACHE_DIRECTIVES.some((d) => lower.includes(d));
}

export async function putCachedResponse(
  env: Env,
  method: string,
  url: string,
  reqBody: ArrayBuffer,
  status: number,
  headers: Record<string, string[]>,
  respBody: ArrayBuffer,
): Promise<void> {
  const hash = await contentHashOf(reqBody);
  const maxAgeSeconds = Number(env.MAX_CACHE_TIME || "300");
  const expiresAt = maxAgeSeconds > 0 ? new Date(Date.now() + maxAgeSeconds * 1000).toISOString() : null;
  const r2Key = `cache/${hash}/${crypto.randomUUID()}`;

  await env.CACHE_BUCKET.put(r2Key, respBody);
  await insertCachedResponse(env.DB, {
    method,
    url,
    status,
    respHeaders: JSON.stringify(headers),
    contentHash: hash,
    r2Key,
    bodySize: respBody.byteLength,
    expiresAt,
  });
}

/** Called from the scheduled() cron handler: size eviction + TTL sweep. */
export async function runCacheJanitor(env: Env): Promise<void> {
  const maxSizeMB = Number(env.MAX_CACHE_SIZE_MB || "100");

  // TTL sweep — Go never actively deleted expired rows, only filtered them
  // at read time; sweeping them here keeps D1 (and R2) smaller.
  const expired = await expiredCacheRows(env.DB);
  if (expired.length > 0) {
    await Promise.all(expired.map((row) => env.CACHE_BUCKET.delete(row.r2_key)));
    await deleteCacheRowsById(env.DB, expired.map((r) => r.id));
  }

  if (maxSizeMB <= 0) return;
  const sizeBytes = await totalCacheSizeBytes(env.DB);
  const limitBytes = maxSizeMB * 1024 * 1024;
  if (sizeBytes <= limitBytes) return;

  const rowCount = await countCacheRows(env.DB);
  const rows = await oldestCacheRows(env.DB, Math.max(1, Math.floor(rowCount / 10)));
  if (rows.length === 0) return;
  await Promise.all(rows.map((row) => env.CACHE_BUCKET.delete(row.r2_key)));
  await deleteCacheRowsById(env.DB, rows.map((r) => r.id));
}
