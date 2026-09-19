import { RATE_LIMIT_POLICY_NAME } from "../middleware/rate-limit-policy-header";
import type { RateLimitState } from "../durable-objects/RateLimiterDO";

export function setRateLimitHeaders(headers: Headers, st: RateLimitState): void {
  if (st.limit <= 0) return;
  const remaining = Math.max(0, st.remaining);
  const reset = Math.max(0, st.reset);
  headers.set("RateLimit-Limit", String(st.limit));
  headers.set("RateLimit-Remaining", String(remaining));
  headers.set("RateLimit-Reset", String(reset));
  headers.set("RateLimit-Policy", `"${RATE_LIMIT_POLICY_NAME}";q=${st.limit};w=1`);
  headers.set("RateLimit", `"${RATE_LIMIT_POLICY_NAME}";r=${remaining};t=${reset}`);
}

export function retryAfterSeconds(st: RateLimitState): number {
  return st.reset > 0 ? st.reset : 1;
}

export function defaultRateLimitState(defaultPerSec: number): RateLimitState {
  return { limit: defaultPerSec, remaining: defaultPerSec, reset: 0 };
}
