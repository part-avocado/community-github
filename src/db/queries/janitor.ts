/**
 * Keeps request_logs bounded to the last 1000 rows. When fewer than 1000
 * rows exist, (MAX(id) - 1000) is negative and the WHERE clause matches no
 * rows (ids start at 1), so this is a safe no-op in that case.
 */
export async function pruneRequestLogs(db: D1Database): Promise<void> {
  await db
    .prepare(
      `DELETE FROM request_logs WHERE id <= (SELECT COALESCE(MAX(id), 0) FROM request_logs) - 1000`,
    )
    .run();
}

/** Keeps request_stats_hourly to the trailing 8 days. */
export async function pruneHourlyStats(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 13);
  await db.prepare(`DELETE FROM request_stats_hourly WHERE hour < ?1`).bind(cutoff).run();
}
