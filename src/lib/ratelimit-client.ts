import type { Env } from "../env";
import type { RateLimitState } from "../durable-objects/RateLimiterDO";

export async function checkRateLimit(
  env: Env,
  apiKeyHash: string,
  perSec: number,
): Promise<{ allowed: boolean } & RateLimitState> {
  const id = env.RATE_LIMITER.idFromName(apiKeyHash);
  const stub = env.RATE_LIMITER.get(id);
  const resp = await stub.fetch("https://rate-limiter/allow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ perSec }),
  });
  return resp.json();
}
