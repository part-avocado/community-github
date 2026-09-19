import type { Context } from "hono";
import type { Env } from "../env";

export interface ErrorLink {
  rel: string;
  href: string;
  description?: string;
}

export interface EntryPoint {
  path: string;
  rel: string;
  desc: string;
  sitemap?: boolean;
}

// The list of machine-readable "where to look next" links. Rendered into 404
// bodies (JSON/HTML/markdown), /llms.txt and /sitemap.xml so all four stay in
// sync — mirrors internal/server/discovery.go's entryPoints.
export const entryPoints: EntryPoint[] = [
  { path: "/", rel: "home", desc: "Project home page", sitemap: true },
  { path: "/docs", rel: "documentation", desc: "API documentation, examples and error reference", sitemap: true },
  { path: "/openapi.json", rel: "service-desc", desc: "OpenAPI 3.0.3 specification for the whole API", sitemap: true },
  { path: "/llms.txt", rel: "llms-txt", desc: "Machine-readable site map for agents (llmstxt.org)", sitemap: true },
  { path: "/donate", rel: "donate", desc: "Donate a GitHub token to the shared pool", sitemap: true },
  { path: "/get-access", rel: "get-access", desc: "Get your own API key (Hack Club Auth + token donation)", sitemap: true },
  { path: "/sitemap.xml", rel: "sitemap", desc: "XML sitemap" },
];

export function baseURL(c: Context<{ Bindings: Env }>): string {
  const cfg = c.env.BASE_URL;
  if (cfg) return cfg.replace(/\/+$/, "");
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

export function docsURL(c: Context<{ Bindings: Env }>): string {
  return `${baseURL(c)}/docs`;
}

export function notFoundLinks(c: Context<{ Bindings: Env }>): ErrorLink[] {
  const base = baseURL(c);
  return entryPoints.map((e) => ({ rel: e.rel, href: base + e.path, description: e.desc }));
}

export function wantsJSON(c: Context): boolean {
  const accept = (c.req.header("accept") ?? "").toLowerCase();
  if (accept.includes("application/json") || accept.includes("+json")) return true;
  const p = new URL(c.req.url).pathname;
  if (p.startsWith("/gh/") || p === "/gh" || p.startsWith("/admin/") || p.startsWith("/api/") || p.endsWith(".json")) {
    return true;
  }
  if (c.req.header("x-api-key")) return true;
  return false;
}

export function wantsHTML(c: Context): boolean {
  return (c.req.header("accept") ?? "").toLowerCase().includes("text/html");
}

export interface JsonErrorBody {
  error: {
    code: string;
    message: string;
    hint?: string;
    documentation_url?: string;
    links?: ErrorLink[];
  };
}

export function jsonErrorBody(
  c: Context<{ Bindings: Env }>,
  code: string,
  message: string,
  hint?: string,
  links?: ErrorLink[],
): JsonErrorBody {
  return {
    error: {
      code,
      message,
      ...(hint ? { hint } : {}),
      documentation_url: docsURL(c),
      ...(links ? { links } : {}),
    },
  };
}

export function jsonError(
  c: Context<{ Bindings: Env }>,
  code: string,
  message: string,
  hint: string | undefined,
  status: number,
  links?: ErrorLink[],
  extraHeaders?: Headers,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(jsonErrorBody(c, code, message, hint, links)), { status, headers });
}

export function notFoundMarkdown(c: Context<{ Bindings: Env }>, title: string, detail: string): string {
  const base = baseURL(c);
  let body = `# ${title}\n\n${detail}\n\n## Where to look next\n\n`;
  for (const e of entryPoints) {
    body += `- [${e.path}](${base}${e.path}) — ${e.desc}\n`;
  }
  body += "\n## API endpoints\n\n";
  body += `- \`GET ${base}/gh/{github-rest-path}\` — GitHub REST proxy (requires an \`X-API-Key\` header)\n`;
  body += `- \`POST ${base}/gh/graphql\` — GitHub GraphQL proxy (requires an \`X-API-Key\` header)\n`;
  body += '\nErrors are returned as JSON (`{"error":{"code","message","hint"}}`) for API paths or when the request sends `Accept: application/json`.\n';
  return body;
}

export function markdownResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/markdown; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
