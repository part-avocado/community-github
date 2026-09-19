import type { MiddlewareHandler } from "hono";

// Mirrors internal/server/server.go's renderStatus header set. Applied to
// every human-facing/JSON route EXCEPT the /gh/* proxy, which forwards
// GitHub's own response headers verbatim and must not have them overridden.
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  if (new URL(c.req.url).pathname.startsWith("/gh/")) return;
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; img-src https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  );
};
