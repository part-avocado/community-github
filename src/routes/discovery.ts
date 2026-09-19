import { Hono } from "hono";
import type { Env } from "../env";
import { baseURL, entryPoints } from "../lib/errors";
import { formatNumber, humanizeDuration } from "../lib/format";
import { countActiveDonors, mostRecentDonor } from "../db/queries/donatedTokens";
import { getSystemStats, requestsInLastHours } from "../db/queries/stats";
import { IndexPage } from "../templates/Index";
import { DocsPage } from "../templates/Docs";
import openapiSpec from "../openapi.json";

export const discoveryRoutes = new Hono<{ Bindings: Env }>();

discoveryRoutes.get("/healthz", (c) => c.body(null, 204));

discoveryRoutes.get("/", async (c) => {
  const [donors, last, stats, requests24h] = await Promise.all([
    countActiveDonors(c.env.DB),
    mostRecentDonor(c.env.DB),
    getSystemStats(c.env.DB),
    requestsInLastHours(c.env.DB, 24),
  ]);
  const trackingSince = new Date(stats.statsTrackingStartedAt).getTime();
  const requests24HoursLabel = Date.now() - trackingSince >= 24 * 60 * 60 * 1000 ? "in the past 24 hours" : "since tracking began";
  return c.html(
    IndexPage({
      donors,
      lastUser: last?.github_user ?? null,
      lastAgo: last ? humanizeDuration(Date.now() - new Date(last.created_at).getTime()) : null,
      totalRequests: formatNumber(stats.totalRequests),
      requests24Hours: formatNumber(requests24h),
      requests24HoursLabel,
    }),
  );
});

discoveryRoutes.get("/docs", (c) => c.html(DocsPage({ baseURL: baseURL(c) })));

discoveryRoutes.get("/openapi.json", (c) => c.json(openapiSpec));

discoveryRoutes.get("/llms.txt", (c) => {
  const base = baseURL(c);
  const body = `# gh-proxy

> A Hack Club GitHub API proxy. It forwards REST and GraphQL calls to api.github.com using a pool of donated GitHub tokens, caches responses, and rate limits each API key. Every proxied call needs an \`X-API-Key\` header, obtained at /get-access.

Errors are JSON: \`{"error":{"code":"...","message":"...","hint":"..."}}\`. Rate limit state is returned on every /gh/ response in the RateLimit, RateLimit-Policy, RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset headers, plus Retry-After on a 429.

## Docs

- [API documentation](${base}/docs): endpoints, authentication, caching, error codes and rate limit headers
- [OpenAPI specification](${base}/openapi.json): OpenAPI 3.0.3 description of every endpoint and error shape

## API

- [GitHub REST proxy](${base}/gh/): GET|POST|PATCH|PUT|DELETE ${base}/gh/{github-rest-path} mirrors https://api.github.com/{github-rest-path}
- [GitHub GraphQL proxy](${base}/gh/graphql): POST a {"query":"..."} body, mirrors https://api.github.com/graphql

## Access

- [Get access](${base}/get-access): self-serve API key via Hack Club Auth + token donation
- [Donate a token](${base}/donate): grow the shared pool, no account required

## Optional

- [Home](${base}/): what the project is
- [Sitemap](${base}/sitemap.xml): XML sitemap
- [Admin panel](${base}/admin): usage dashboard, Hack Club Auth + allow-list protected
`;
  return c.text(body, 200, { "Cache-Control": "public, max-age=3600" });
});

discoveryRoutes.get("/robots.txt", (c) => {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /auth/
Disallow: /gh/

Sitemap: ${baseURL(c)}/sitemap.xml
`;
  return c.text(body, 200, { "Cache-Control": "public, max-age=3600" });
});

discoveryRoutes.get("/sitemap.xml", (c) => {
  const base = baseURL(c);
  const urls = entryPoints
    .filter((e) => e.sitemap)
    .map((e) => `  <url><loc>${base}${e.path}</loc></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return c.body(body, 200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
});
