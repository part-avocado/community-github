import type { RateLimitCategory } from "../schema";

export interface ChosenToken {
  id: string;
  tokenCiphertext: ArrayBuffer;
  tokenIv: ArrayBuffer;
}

/**
 * Picks the best donated token for a category with a single indexed JOIN,
 * favoring the token with the most remaining quota (ties broken by earliest
 * reset, then longest since last successful use) — replaces the Go client's
 * N+1 query-per-token loop with one query.
 */
export async function chooseToken(db: D1Database, category: RateLimitCategory): Promise<ChosenToken | null> {
  const row = await db
    .prepare(
      `SELECT dt.id, dt.token_ciphertext, dt.token_iv
       FROM donated_tokens dt
       LEFT JOIN token_rate_limits trl ON trl.token_id = dt.id AND trl.category = ?1
       WHERE dt.revoked = 0
       ORDER BY COALESCE(trl.remaining, 999999) DESC,
                COALESCE(trl.reset_at, '1970-01-01') ASC,
                COALESCE(dt.last_ok_at, '1970-01-01') ASC
       LIMIT 1`,
    )
    .bind(category)
    .first<{ id: string; token_ciphertext: ArrayBuffer; token_iv: ArrayBuffer }>();
  if (!row) return null;
  return { id: row.id, tokenCiphertext: row.token_ciphertext, tokenIv: row.token_iv };
}

export async function upsertRateLimitFromHeaders(
  db: D1Database,
  tokenId: string,
  category: RateLimitCategory,
  limit: number,
  remaining: number,
  resetUnix: number,
): Promise<void> {
  const resetAt = new Date(resetUnix * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO token_rate_limits (token_id, category, rate_limit, remaining, reset_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(token_id, category) DO UPDATE SET
         rate_limit = excluded.rate_limit, remaining = excluded.remaining,
         reset_at = excluded.reset_at, updated_at = excluded.updated_at`,
    )
    .bind(tokenId, category, limit, remaining, resetAt)
    .run();
  await db
    .prepare(`UPDATE donated_tokens SET last_ok_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1`)
    .bind(tokenId)
    .run();
}

export async function aggregateCoreQuota(db: D1Database): Promise<{
  limit: number;
  remaining: number;
  tracked: number;
  resetUnix: number | null;
}> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(trl.rate_limit), 0) AS lim,
              COALESCE(SUM(CASE WHEN trl.reset_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN trl.rate_limit ELSE trl.remaining END), 0) AS remaining,
              COUNT(*) AS tracked,
              MIN(CASE WHEN trl.reset_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN trl.reset_at END) AS reset_at
       FROM token_rate_limits trl
       JOIN donated_tokens dt ON dt.id = trl.token_id
       WHERE dt.revoked = 0 AND trl.category = 'core'`,
    )
    .first<{ lim: number; remaining: number; tracked: number; reset_at: string | null }>();
  return {
    limit: row?.lim ?? 0,
    remaining: row?.remaining ?? 0,
    tracked: row?.tracked ?? 0,
    resetUnix: row?.reset_at ? Math.floor(new Date(row.reset_at).getTime() / 1000) : null,
  };
}
