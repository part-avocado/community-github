import type { MiddlewareHandler } from "hono";
import { maskKey } from "../lib/crypto";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const dur = Date.now() - start;
  const apiKey = c.req.header("x-api-key");
  console.log(
    `${c.req.method} ${new URL(c.req.url).pathname} ${c.res.status} (${dur}ms) ua=${JSON.stringify(
      c.req.header("user-agent") ?? "",
    )} key=${apiKey ? maskKey(apiKey) : "-"}`,
  );
};
