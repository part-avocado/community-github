import type { MiddlewareHandler } from "hono";

export const DEFAULT_RATE_LIMIT_PER_SEC = 10;
export const RATE_LIMIT_WINDOW_SECONDS = 1;
export const RATE_LIMIT_POLICY_NAME = "default";

// Advertises the default rate limit policy on every response, mirroring Go's
// router-level rateLimitPolicyHeader middleware. Route handlers (the /gh/*
// proxy) return their own Response objects with the caller's real per-key
// policy already set; since that replaces c.res outright rather than
// merging with it, this only fills the header in when it's still missing
// after the handler has run, instead of unconditionally overwriting it.
export const rateLimitPolicyHeader: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.headers.has("RateLimit-Policy")) {
    c.res.headers.set(
      "RateLimit-Policy",
      `"${RATE_LIMIT_POLICY_NAME}";q=${DEFAULT_RATE_LIMIT_PER_SEC};w=${RATE_LIMIT_WINDOW_SECONDS}`,
    );
  }
};
