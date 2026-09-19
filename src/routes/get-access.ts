import { Hono } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../env";
import { currentSession, isEligible } from "../lib/hackclub-auth";
import { hcIdentityById } from "../db/queries/hcIdentities";
import { findDonationByHcIdentity } from "../db/queries/donatedTokens";
import { apiKeyByHcIdentity, createApiKey, regenerateApiKey } from "../db/queries/apiKeys";
import { generateApiKey, keyHint, sha256Hex } from "../lib/crypto";
import { formatKeyDisplay } from "../lib/format";
import { checkCSRF, issueCSRFCookie } from "../lib/csrf";
import { jsonError } from "../lib/errors";
import { LoginRequiredPage, NotEligiblePage, NeedsDonationPage, KeyReadyPage, KeyExistsPage } from "../templates/GetAccess";

export const getAccessRoutes = new Hono<{ Bindings: Env }>();

getAccessRoutes.get("/get-access", async (c) => {
  const session = await currentSession(c);
  if (!session) return c.html(LoginRequiredPage());

  const identity = await hcIdentityById(c.env.DB, session.hcIdentityId);
  if (!identity) return c.html(LoginRequiredPage());

  if (!isEligible(identity.verification_status, c.env)) {
    return c.html(NotEligiblePage({ status: identity.verification_status }));
  }

  // One-time plaintext key display, set by /auth/github/callback right after
  // an auto-mint on first donation.
  const freshKey = getCookie(c, "gh_proxy_new_key");
  if (freshKey) {
    deleteCookie(c, "gh_proxy_new_key", { path: "/get-access" });
    return c.html(KeyReadyPage({ plaintextKey: freshKey }));
  }

  const existingKey = await apiKeyByHcIdentity(c.env.DB, session.hcIdentityId);
  if (existingKey) {
    const csrf = issueCSRFCookie(c);
    return c.html(
      KeyExistsPage({ display: formatKeyDisplay(existingKey.app_name, existingKey.machine, existingKey.key_hint), csrf }),
    );
  }

  const donation = await findDonationByHcIdentity(c.env.DB, session.hcIdentityId);
  if (!donation) return c.html(NeedsDonationPage());

  // Eligible + donated but somehow no key yet (e.g. auto-mint failed) — let
  // them mint one explicitly.
  const key = generateApiKey(identity.name ?? identity.hc_user_id, "default", "web");
  const keyHashValue = await sha256Hex(key);
  await createApiKey(c.env.DB, {
    hcIdentityId: identity.id,
    donatedTokenId: donation.id,
    appName: "default",
    machine: "web",
    keyHash: keyHashValue,
    keyHint: keyHint(key),
    rateLimitPerSec: 10,
  });
  return c.html(KeyReadyPage({ plaintextKey: key }));
});

getAccessRoutes.post("/get-access/regenerate-key", async (c) => {
  if (!(await checkCSRF(c))) return jsonError(c, "CSRF_FAILED", "Invalid CSRF token", "Please refresh the page and try again", 403);

  const session = await currentSession(c);
  if (!session) return jsonError(c, "HCA_LOGIN_REQUIRED", "Log in with Hack Club Auth first", undefined, 401);

  const existing = await apiKeyByHcIdentity(c.env.DB, session.hcIdentityId);
  if (!existing) return jsonError(c, "DONATION_REQUIRED", "No API key to regenerate yet", "Donate a token at /get-access first", 403);

  const identity = await hcIdentityById(c.env.DB, session.hcIdentityId);
  const key = generateApiKey(identity?.name ?? identity?.hc_user_id ?? "user", existing.app_name, existing.machine);
  const keyHashValue = await sha256Hex(key);
  await regenerateApiKey(c.env.DB, existing.id, keyHashValue, keyHint(key));

  return c.html(KeyReadyPage({ plaintextKey: key }));
});
