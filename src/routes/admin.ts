import { Hono } from "hono";
import type { Env } from "../env";
import type { Context, Next } from "hono";
import { currentSession } from "../lib/hackclub-auth";
import { hcIdentityById } from "../db/queries/hcIdentities";
import { bootstrapAdminsIfEmpty, isAdmin } from "../db/queries/admins";
import { countActiveDonors, donorBreakdown } from "../db/queries/donatedTokens";
import { getSystemStats } from "../db/queries/stats";
import { aggregateCoreQuota } from "../db/queries/tokenRateLimits";
import { listApiKeysForAdmin, keysUsageLast7Days, recentRequestsForAdmin, disableApiKey } from "../db/queries/apiKeys";
import { checkCSRF, issueCSRFCookie } from "../lib/csrf";
import { jsonError } from "../lib/errors";
import { formatNumber } from "../lib/format";
import { AdminPage } from "../templates/Admin";

export const adminRoutes = new Hono<{ Bindings: Env }>();

async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  await bootstrapAdminsIfEmpty(c.env.DB, c.env.ADMIN_BOOTSTRAP_HC_USER_IDS);

  const session = await currentSession(c);
  if (!session) {
    if (c.req.header("accept")?.includes("application/json") || c.req.path.endsWith(".json")) {
      return jsonError(c, "HCA_LOGIN_REQUIRED", "Admin authentication required", "Log in with Hack Club Auth", 401);
    }
    return c.redirect(`/auth/hackclub/start?return=${encodeURIComponent(c.req.path)}`, 302);
  }

  const identity = await hcIdentityById(c.env.DB, session.hcIdentityId);
  if (!identity || !(await isAdmin(c.env.DB, identity.hc_user_id))) {
    return jsonError(c, "FORBIDDEN", "Not an admin", "This Hack Club Auth identity is not on the admin allow-list", 403);
  }

  await next();
}

adminRoutes.use("*", requireAdmin);

async function adminStats(env: Env) {
  const [stats, activeTokens, donors, core] = await Promise.all([
    getSystemStats(env.DB),
    countActiveDonors(env.DB),
    donorBreakdown(env.DB),
    aggregateCoreQuota(env.DB),
  ]);
  const hitPct = stats.totalRequests > 0 ? (stats.totalCachedRequests / stats.totalRequests) * 100 : 0;
  return {
    totalRequests: formatNumber(stats.totalRequests),
    cacheHitRate: `${hitPct.toFixed(1)}%`,
    today: formatNumber(stats.todayRequests),
    activeTokens,
    selfServeDonors: donors.selfServe,
    anonymousDonors: donors.anonymous,
    coreRateLimit: core.limit,
    coreRateRemaining: core.remaining,
    coreRateTracked: core.tracked,
  };
}

adminRoutes.get("/", async (c) => {
  const csrf = issueCSRFCookie(c);
  const [stats, keys] = await Promise.all([adminStats(c.env), listApiKeysForAdmin(c.env.DB)]);
  return c.html(AdminPage({ csrf, ...stats, keys }));
});

adminRoutes.get("/ws", async (c) => {
  const id = c.env.ADMIN_HUB.idFromName("singleton");
  const stub = c.env.ADMIN_HUB.get(id);
  return stub.fetch(c.req.raw);
});

adminRoutes.get("/keys.json", async (c) => c.json(await listApiKeysForAdmin(c.env.DB)));
adminRoutes.get("/keys_usage.json", async (c) => c.json(await keysUsageLast7Days(c.env.DB)));
adminRoutes.get("/recent.json", async (c) => c.json(await recentRequestsForAdmin(c.env.DB)));

adminRoutes.post("/apikeys/:id/disable", async (c) => {
  if (!(await checkCSRF(c))) {
    return jsonError(c, "CSRF_FAILED", "Invalid CSRF token", "Please refresh the page and try again", 403);
  }
  await disableApiKey(c.env.DB, c.req.param("id"));
  return c.redirect("/admin", 303);
});
