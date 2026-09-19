import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env";
import { randomBase32, timingSafeEqual } from "./crypto";

const CSRF_COOKIE = "csrf";

/** Issues (or reuses) a double-submit CSRF cookie and returns its value for embedding in a form. */
export function issueCSRFCookie(c: Context<{ Bindings: Env }>): string {
  const existing = getCookie(c, CSRF_COOKIE);
  if (existing && existing.length >= 20) return existing;
  const token = randomBase32(20);
  setCookie(c, CSRF_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: c.env.BASE_URL.startsWith("https://"),
    maxAge: 86400 * 7,
  });
  return token;
}

export async function checkCSRF(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const cookie = getCookie(c, CSRF_COOKIE);
  if (!cookie) return false;
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const submitted = body["csrf"];
  if (typeof submitted !== "string") return false;
  return timingSafeEqual(cookie, submitted);
}
