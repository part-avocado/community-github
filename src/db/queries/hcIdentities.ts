import type { HcIdentityRow } from "../schema";

export interface UpsertHcIdentityInput {
  hcUserId: string;
  slackId: string | null;
  email: string | null;
  name: string | null;
  verificationStatus: string | null;
}

export async function upsertHcIdentity(db: D1Database, input: UpsertHcIdentityInput): Promise<HcIdentityRow> {
  const existing = await db
    .prepare(`SELECT * FROM hc_identities WHERE hc_user_id = ?1`)
    .bind(input.hcUserId)
    .first<HcIdentityRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE hc_identities
         SET slack_id = ?2, email = ?3, name = ?4, verification_status = ?5,
             verification_status_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1`,
      )
      .bind(existing.id, input.slackId, input.email, input.name, input.verificationStatus)
      .run();
    return {
      ...existing,
      slack_id: input.slackId,
      email: input.email,
      name: input.name,
      verification_status: input.verificationStatus,
    };
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO hc_identities (id, hc_user_id, slack_id, email, name, verification_status, verification_status_checked_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    )
    .bind(id, input.hcUserId, input.slackId, input.email, input.name, input.verificationStatus)
    .run();

  const row = await db.prepare(`SELECT * FROM hc_identities WHERE id = ?1`).bind(id).first<HcIdentityRow>();
  if (!row) throw new Error("failed to read back inserted hc_identity");
  return row;
}

export async function hcIdentityById(db: D1Database, id: string): Promise<HcIdentityRow | null> {
  return db.prepare(`SELECT * FROM hc_identities WHERE id = ?1`).bind(id).first<HcIdentityRow>();
}
