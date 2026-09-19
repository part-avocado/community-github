import type { Context } from "hono";
import type { Env } from "../env";
import { jsonError, markdownResponse, notFoundLinks, notFoundMarkdown, wantsHTML, wantsJSON } from "../lib/errors";
import { methodsFor } from "../lib/route-table";
import { NotFoundPage } from "../templates/NotFound";

// Serves a 404 (or 405, if the path is a real route but this method isn't
// supported on it) that every kind of client can act on: JSON for API
// clients, HTML for browsers, markdown for everything else (curl, agents).
// Mirrors internal/server/discovery.go's handleNotFound/handleMethodNotAllowed.
export function notFoundHandler(c: Context<{ Bindings: Env }>): Response | Promise<Response> {
  const pathname = new URL(c.req.url).pathname;
  const allowed = methodsFor(pathname);
  const isMethodNotAllowed = allowed !== null && !allowed.includes(c.req.method);

  if (isMethodNotAllowed) {
    const msg = `Method ${c.req.method} is not allowed on ${pathname}`;
    if (wantsJSON(c)) {
      return jsonError(
        c,
        "METHOD_NOT_ALLOWED",
        msg,
        "See /openapi.json for the methods each path accepts.",
        405,
        notFoundLinks(c),
      );
    }
    return markdownResponse(405, notFoundMarkdown(c, "405 Method Not Allowed", `\`${msg}\`.`));
  }

  const detail = `\`${pathname}\` is not a route on this server.`;
  if (wantsJSON(c)) {
    return jsonError(
      c,
      "NOT_FOUND",
      `No such path: ${pathname}`,
      "Check /openapi.json for the list of valid paths, or /llms.txt for a site map.",
      404,
      notFoundLinks(c),
    );
  }
  if (wantsHTML(c)) {
    return c.html(NotFoundPage({ path: pathname }), 404);
  }
  return markdownResponse(404, notFoundMarkdown(c, "404 Not Found", detail));
}
