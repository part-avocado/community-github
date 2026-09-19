import type { CachedResponseRow } from "../schema";

export async function findCachedResponse(
  db: D1Database,
  method: string,
  url: string,
  contentHash: string,
): Promise<CachedResponseRow | null> {
  return db
    .prepare(
      `SELECT * FROM cached_responses
       WHERE method = ?1 AND url = ?2 AND content_hash = ?3
         AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ORDER BY id DESC LIMIT 1`,
    )
    .bind(method, url, contentHash)
    .first<CachedResponseRow>();
}

export interface InsertCachedResponseInput {
  method: string;
  url: string;
  status: number;
  respHeaders: string;
  contentHash: string;
  r2Key: string;
  bodySize: number;
  expiresAt: string | null;
}

export async function insertCachedResponse(db: D1Database, input: InsertCachedResponseInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cached_responses (method, url, status, resp_headers, content_hash, r2_key, body_size, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(input.method, input.url, input.status, input.respHeaders, input.contentHash, input.r2Key, input.bodySize, input.expiresAt)
    .run();
}

export async function deleteCachedResponseRow(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM cached_responses WHERE id = ?1`).bind(id).run();
}

export async function totalCacheSizeBytes(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(SUM(body_size), 0) AS n FROM cached_responses`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function oldestCacheRows(db: D1Database, limit: number): Promise<{ id: number; r2_key: string }[]> {
  const { results } = await db
    .prepare(`SELECT id, r2_key FROM cached_responses ORDER BY created_at ASC LIMIT ?1`)
    .bind(limit)
    .all<{ id: number; r2_key: string }>();
  return results;
}

export async function countCacheRows(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM cached_responses`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function expiredCacheRows(db: D1Database): Promise<{ id: number; r2_key: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, r2_key FROM cached_responses WHERE expires_at IS NOT NULL AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
    .all<{ id: number; r2_key: string }>();
  return results;
}

export async function deleteCacheRowsById(db: D1Database, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  await db.prepare(`DELETE FROM cached_responses WHERE id IN (${placeholders})`).bind(...ids).run();
}
