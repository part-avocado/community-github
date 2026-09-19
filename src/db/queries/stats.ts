export interface SystemStatsSummary {
  totalRequests: number;
  totalCachedRequests: number;
  todayRequests: number;
  statsTrackingStartedAt: string;
}

export async function getSystemStats(db: D1Database): Promise<SystemStatsSummary> {
  const row = await db
    .prepare(
      `SELECT total_requests, total_cached_requests, today_requests, stats_tracking_started_at
       FROM system_stats WHERE id = 1`,
    )
    .first<{
      total_requests: number;
      total_cached_requests: number;
      today_requests: number;
      stats_tracking_started_at: string;
    }>();
  return {
    totalRequests: row?.total_requests ?? 0,
    totalCachedRequests: row?.total_cached_requests ?? 0,
    todayRequests: row?.today_requests ?? 0,
    statsTrackingStartedAt: row?.stats_tracking_started_at ?? new Date().toISOString(),
  };
}

export async function requestsInLastHours(db: D1Database, hours: number): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(`SELECT COALESCE(SUM(requests), 0) AS n FROM request_stats_hourly WHERE hour >= ?1`)
    .bind(since.slice(0, 13)) // hour bucket key, see recordHourlyRequest
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** hour bucket key: ISO string truncated to the hour, e.g. 2026-09-19T15 */
export function hourBucket(d = new Date()): string {
  return d.toISOString().slice(0, 13);
}

export async function recordRequest(db: D1Database, cacheHit: boolean): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  if (cacheHit) {
    await db
      .prepare(
        `INSERT INTO system_stats (id, total_requests, total_cached_requests, today_requests, today_date, stats_tracking_started_at, updated_at)
         VALUES (1, 1, 1, 1, ?1, ?2, ?2)
         ON CONFLICT(id) DO UPDATE SET
           total_requests = total_requests + 1,
           total_cached_requests = total_cached_requests + 1,
           today_requests = CASE WHEN today_date = ?1 THEN today_requests + 1 ELSE 1 END,
           today_date = ?1,
           updated_at = ?2`,
      )
      .bind(today, now)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO system_stats (id, total_requests, total_cached_requests, today_requests, today_date, stats_tracking_started_at, updated_at)
         VALUES (1, 1, 0, 1, ?1, ?2, ?2)
         ON CONFLICT(id) DO UPDATE SET
           total_requests = total_requests + 1,
           today_requests = CASE WHEN today_date = ?1 THEN today_requests + 1 ELSE 1 END,
           today_date = ?1,
           updated_at = ?2`,
      )
      .bind(today, now)
      .run();
  }

  const hour = hourBucket();
  await db
    .prepare(
      `INSERT INTO request_stats_hourly (hour, requests) VALUES (?1, 1)
       ON CONFLICT(hour) DO UPDATE SET requests = requests + 1`,
    )
    .bind(hour)
    .run();
}

export async function logRequest(
  db: D1Database,
  apiKeyHash: string,
  method: string,
  path: string,
  status: number,
  cacheHit: boolean,
): Promise<void> {
  await db
    .prepare(`INSERT INTO request_logs (api_key_hash, method, path, status, cache_hit) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(apiKeyHash, method, path, status, cacheHit ? 1 : 0)
    .run();
}
