import app from "./app";
import type { Env } from "./env";
import { runCacheJanitor } from "./lib/cache";
import { pruneRequestLogs, pruneHourlyStats } from "./db/queries/janitor";

export { RateLimiterDO } from "./durable-objects/RateLimiterDO";
export { AdminHubDO } from "./durable-objects/AdminHubDO";

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCacheJanitor(env));
    ctx.waitUntil(pruneRequestLogs(env.DB));
    ctx.waitUntil(pruneHourlyStats(env.DB));
  },
};
