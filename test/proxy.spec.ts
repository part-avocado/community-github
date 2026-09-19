import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { sha256Hex } from "../src/lib/crypto";

async function seedKey(rateLimitPerSec: number, disabled = false) {
  await env.DB.prepare(
    `INSERT INTO hc_identities (id, hc_user_id, name, verification_status) VALUES ('id1','hcuser1','Test','verified_eligible')`,
  ).run();
  await env.DB.prepare(
    `INSERT INTO donated_tokens (id, github_user, token_ciphertext, token_iv, revoked, donor_hc_identity_id)
     VALUES ('tok1','octocat', x'00', x'000000000000000000000000', 0, 'id1')`,
  ).run();
  const keyHash = await sha256Hex("testkey123");
  await env.DB.prepare(
    `INSERT INTO api_keys (id, key_hash, key_hint, hc_identity_id, donated_token_id, app_name, machine, rate_limit_per_sec, disabled)
     VALUES ('key1', ?1, 'abcdef', 'id1', 'tok1', 'default', 'web', ?2, ?3)`,
  )
    .bind(keyHash, rateLimitPerSec, disabled ? 1 : 0)
    .run();
}

describe("proxy auth", () => {
  beforeEach(async () => {
    for (const table of ["api_keys", "donated_tokens", "hc_identities", "request_logs", "token_rate_limits"]) {
      await env.DB.prepare(`DELETE FROM ${table}`).run();
    }
  });

  it("rejects a request with no X-API-Key", async () => {
    const res = await SELF.fetch("http://example.com/gh/repos/octocat/Hello-World");
    expect(res.status).toBe(401);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("MISSING_API_KEY");
    expect(res.headers.get("RateLimit-Limit")).toBe("10");
  });

  it("rejects an unknown API key", async () => {
    const res = await SELF.fetch("http://example.com/gh/repos/octocat/Hello-World", {
      headers: { "X-API-Key": "not-a-real-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("INVALID_API_KEY");
  });

  it("rejects a disabled API key", async () => {
    await seedKey(10, true);
    const res = await SELF.fetch("http://example.com/gh/repos/octocat/Hello-World", {
      headers: { "X-API-Key": "testkey123" },
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("API_KEY_DISABLED");
  });

  it("returns UPSTREAM_ERROR when the donated token can't be decrypted (no real GitHub call in tests)", async () => {
    await seedKey(10);
    const res = await SELF.fetch("http://example.com/gh/repos/octocat/Hello-World", {
      headers: { "X-API-Key": "testkey123" },
    });
    expect(res.status).toBe(502);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("UPSTREAM_ERROR");
  });

  it("enforces the per-key rate limit and reports the real policy in headers", async () => {
    await seedKey(2);
    const headers = { "X-API-Key": "testkey123" };
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await (await SELF.fetch("http://example.com/gh/repos/octocat/Hello-World", { headers })).status);
    }
    expect(results).toContain(429);

    const res = await SELF.fetch("http://example.com/gh/repos/octocat/Hello-World", { headers });
    if (res.status === 429) {
      expect(res.headers.get("RateLimit-Limit")).toBe("2");
      expect(res.headers.get("Retry-After")).toBeTruthy();
    }
  });
});
