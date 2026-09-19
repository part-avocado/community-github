export async function isAdmin(db: D1Database, hcUserId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM admins WHERE hc_user_id = ?1`).bind(hcUserId).first();
  return row !== null;
}

export async function adminsCount(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM admins`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function addAdmin(db: D1Database, hcUserId: string, note: string | null): Promise<void> {
  await db
    .prepare(`INSERT INTO admins (hc_user_id, note) VALUES (?1, ?2) ON CONFLICT(hc_user_id) DO NOTHING`)
    .bind(hcUserId, note)
    .run();
}

/** Seeds the admins table from ADMIN_BOOTSTRAP_HC_USER_IDS the first time it's empty. */
export async function bootstrapAdminsIfEmpty(db: D1Database, bootstrapIds: string): Promise<void> {
  const count = await adminsCount(db);
  if (count > 0) return;
  const ids = bootstrapIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    await addAdmin(db, id, "bootstrap");
  }
}
