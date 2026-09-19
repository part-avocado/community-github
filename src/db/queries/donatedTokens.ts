import type { DonatedTokenRow } from "../schema";

export async function countActiveDonors(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM donated_tokens WHERE revoked = 0`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function mostRecentDonor(
  db: D1Database,
): Promise<{ github_user: string; created_at: string } | null> {
  return db
    .prepare(`SELECT github_user, created_at FROM donated_tokens WHERE revoked = 0 ORDER BY created_at DESC LIMIT 1`)
    .first<{ github_user: string; created_at: string }>();
}

export interface UpsertDonatedTokenInput {
  id: string;
  githubUser: string;
  githubUserId: number | null;
  tokenCiphertext: ArrayBuffer;
  tokenIv: ArrayBuffer;
  scopes: string | null;
  donorHcIdentityId: string | null;
}

/** Insert a new donation, or refresh an existing donor's token/scopes and clear revocation. */
export async function upsertDonatedToken(db: D1Database, input: UpsertDonatedTokenInput): Promise<string> {
  const existing = await db
    .prepare(`SELECT id FROM donated_tokens WHERE github_user = ?1`)
    .bind(input.githubUser)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE donated_tokens
         SET github_user_id = ?2, token_ciphertext = ?3, token_iv = ?4, scopes = ?5,
             revoked = 0, last_ok_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             donor_hc_identity_id = COALESCE(?6, donor_hc_identity_id)
         WHERE id = ?1`,
      )
      .bind(
        existing.id,
        input.githubUserId,
        input.tokenCiphertext,
        input.tokenIv,
        input.scopes,
        input.donorHcIdentityId,
      )
      .run();
    return existing.id;
  }

  await db
    .prepare(
      `INSERT INTO donated_tokens
        (id, github_user, github_user_id, token_ciphertext, token_iv, revoked, last_ok_at, scopes, donor_hc_identity_id)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?6, ?7)`,
    )
    .bind(
      input.id,
      input.githubUser,
      input.githubUserId,
      input.tokenCiphertext,
      input.tokenIv,
      input.scopes,
      input.donorHcIdentityId,
    )
    .run();
  return input.id;
}

export async function findDonationByHcIdentity(
  db: D1Database,
  hcIdentityId: string,
): Promise<DonatedTokenRow | null> {
  return db
    .prepare(`SELECT * FROM donated_tokens WHERE donor_hc_identity_id = ?1 ORDER BY created_at DESC LIMIT 1`)
    .bind(hcIdentityId)
    .first<DonatedTokenRow>();
}

export async function markRevoked(db: D1Database, tokenId: string): Promise<void> {
  await db.prepare(`UPDATE donated_tokens SET revoked = 1 WHERE id = ?1`).bind(tokenId).run();
}

export async function tokenById(db: D1Database, id: string): Promise<DonatedTokenRow | null> {
  return db.prepare(`SELECT * FROM donated_tokens WHERE id = ?1`).bind(id).first<DonatedTokenRow>();
}

export async function donorUsernameById(db: D1Database, id: string): Promise<string | null> {
  const row = await db.prepare(`SELECT github_user FROM donated_tokens WHERE id = ?1`).bind(id).first<{ github_user: string }>();
  return row?.github_user ?? null;
}

export interface DonorBreakdown {
  selfServe: number;
  anonymous: number;
}

export async function donorBreakdown(db: D1Database): Promise<DonorBreakdown> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE donor_hc_identity_id IS NOT NULL) AS self_serve,
         COUNT(*) FILTER (WHERE donor_hc_identity_id IS NULL) AS anonymous
       FROM donated_tokens WHERE revoked = 0`,
    )
    .first<{ self_serve: number; anonymous: number }>();
  return { selfServe: row?.self_serve ?? 0, anonymous: row?.anonymous ?? 0 };
}
