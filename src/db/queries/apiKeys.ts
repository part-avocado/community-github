import type { ApiKeyRow } from "../schema";

export async function apiKeyByHcIdentity(db: D1Database, hcIdentityId: string): Promise<ApiKeyRow | null> {
  return db.prepare(`SELECT * FROM api_keys WHERE hc_identity_id = ?1`).bind(hcIdentityId).first<ApiKeyRow>();
}

export async function apiKeyByHash(db: D1Database, keyHash: string): Promise<ApiKeyRow | null> {
  return db.prepare(`SELECT * FROM api_keys WHERE key_hash = ?1`).bind(keyHash).first<ApiKeyRow>();
}

export interface CreateApiKeyInput {
  hcIdentityId: string;
  donatedTokenId: string;
  appName: string;
  machine: string;
  keyHash: string;
  keyHint: string;
  rateLimitPerSec: number;
}

export async function createApiKey(db: D1Database, input: CreateApiKeyInput): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO api_keys (id, key_hash, key_hint, hc_identity_id, donated_token_id, app_name, machine, rate_limit_per_sec)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(id, input.keyHash, input.keyHint, input.hcIdentityId, input.donatedTokenId, input.appName, input.machine, input.rateLimitPerSec)
    .run();
  return id;
}

export async function regenerateApiKey(
  db: D1Database,
  id: string,
  keyHash: string,
  keyHint: string,
): Promise<void> {
  await db.prepare(`UPDATE api_keys SET key_hash = ?2, key_hint = ?3 WHERE id = ?1`).bind(id, keyHash, keyHint).run();
}

export async function disableApiKey(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE api_keys SET disabled = 1 WHERE id = ?1`).bind(id).run();
}

export async function touchApiKeyUsage(db: D1Database, keyHash: string, cacheHit: boolean): Promise<void> {
  if (cacheHit) {
    await db
      .prepare(
        `UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           total_requests = total_requests + 1, total_cached_requests = total_cached_requests + 1
         WHERE key_hash = ?1`,
      )
      .bind(keyHash)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           total_requests = total_requests + 1
         WHERE key_hash = ?1`,
      )
      .bind(keyHash)
      .run();
  }
}

export interface ApiKeyListRow {
  id: string;
  display: string;
  hc_username: string | null;
  slack_id: string | null;
  total: number;
  hit_rate: number;
  last_used: string | null;
  rate_limit: number;
  disabled: 0 | 1;
  donation_active: 0 | 1;
}

export async function listApiKeysForAdmin(db: D1Database): Promise<ApiKeyListRow[]> {
  const { results } = await db
    .prepare(
      `SELECT k.id,
              k.app_name || '_' || k.machine || '_' || k.key_hint AS display,
              hi.name AS hc_username,
              hi.slack_id AS slack_id,
              k.total_requests AS total,
              CASE WHEN k.total_requests > 0 THEN (CAST(k.total_cached_requests AS REAL) / k.total_requests) * 100 ELSE 0 END AS hit_rate,
              k.last_used_at AS last_used,
              k.rate_limit_per_sec AS rate_limit,
              k.disabled AS disabled,
              CASE WHEN dt.revoked = 0 THEN 1 ELSE 0 END AS donation_active
       FROM api_keys k
       JOIN hc_identities hi ON hi.id = k.hc_identity_id
       JOIN donated_tokens dt ON dt.id = k.donated_token_id
       ORDER BY k.created_at DESC`,
    )
    .all<ApiKeyListRow>();
  return results;
}

export async function keysUsageLast7Days(db: D1Database): Promise<Record<string, { day: string; c: number }[]>> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date('now', '-6 days')
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date('now')
       )
       SELECT k.id AS key_id, days.d AS day, COALESCE(COUNT(rl.id), 0) AS c
       FROM api_keys k
       CROSS JOIN days
       LEFT JOIN request_logs rl ON rl.api_key_hash = k.key_hash AND date(rl.created_at) = days.d
       GROUP BY k.id, days.d
       ORDER BY k.id, days.d`,
    )
    .all<{ key_id: string; day: string; c: number }>();
  const out: Record<string, { day: string; c: number }[]> = {};
  for (const row of results) {
    (out[row.key_id] ??= []).push({ day: row.day, c: row.c });
  }
  return out;
}

export interface RecentRequestRow {
  method: string;
  path: string;
  status: number;
  created_at: string;
  display: string;
}

export async function recentRequestsForAdmin(db: D1Database, limit = 1000): Promise<RecentRequestRow[]> {
  const { results } = await db
    .prepare(
      `SELECT rl.method, rl.path, rl.status, rl.created_at,
              COALESCE(ak.app_name || '_' || ak.machine || '_' || ak.key_hint, '') AS display
       FROM request_logs rl
       LEFT JOIN api_keys ak ON ak.key_hash = rl.api_key_hash
       ORDER BY rl.id DESC
       LIMIT ?1`,
    )
    .bind(limit)
    .all<RecentRequestRow>();
  return results;
}
