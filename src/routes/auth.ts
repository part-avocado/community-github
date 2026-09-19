import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Env } from "../env";
import { startGithubOAuth, handleGithubCallback } from "../lib/github-oauth";
import { startHackclubOAuth, handleHackclubCallback, currentSession, issueSession } from "../lib/hackclub-auth";
import { apiKeyByHcIdentity, createApiKey } from "../db/queries/apiKeys";
import { generateApiKey, keyHint, sha256Hex } from "../lib/crypto";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get("/auth/github/donate/start", (c) => startGithubOAuth(c, "donate"));
authRoutes.get("/auth/github/consumer/start", (c) => startGithubOAuth(c, "consumer"));

authRoutes.get("/auth/github/callback", async (c) => {
  const session = await currentSession(c);
  const result = await handleGithubCallback(c, session?.hcIdentityId ?? null);
  if (result instanceof Response) return result;

  if (result.flow === "donate") {
    return c.redirect("/donate?donated=1", 303);
  }

  // Consumer flow: the donation is now linked to this hc_identity (handled
  // inside handleGithubCallback). If a key doesn't exist yet, mint one now so
  // the user lands on /get-access with their key ready, matching the
  // "donate -> key appears" UX described in the plan.
  if (session) {
    const existing = await apiKeyByHcIdentity(c.env.DB, session.hcIdentityId);
    if (!existing) {
      const key = generateApiKey(result.githubUser, "default", "web");
      const keyHash = await sha256Hex(key);
      await createApiKey(c.env.DB, {
        hcIdentityId: session.hcIdentityId,
        donatedTokenId: result.donatedTokenId,
        appName: "default",
        machine: "web",
        keyHash,
        keyHint: keyHint(key),
        rateLimitPerSec: 10,
      });
      // Stash the plaintext key one time via a short-lived cookie so
      // /get-access can render it once, then clear it.
      setCookie(c, "gh_proxy_new_key", key, {
        path: "/get-access",
        httpOnly: true,
        sameSite: "Lax",
        secure: c.env.BASE_URL.startsWith("https://"),
        maxAge: 60,
      });
    }
  }
  return c.redirect("/get-access", 303);
});

authRoutes.get("/auth/hackclub/start", (c) => {
  const returnTo = c.req.query("return") ?? "/get-access";
  return startHackclubOAuth(c, returnTo);
});

authRoutes.get("/auth/hackclub/callback", async (c) => {
  const result = await handleHackclubCallback(c);
  if (result instanceof Response) return result;
  await issueSession(c, result.identity.id);
  return c.redirect(result.returnTo, 303);
});
