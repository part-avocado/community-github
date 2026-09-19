// A small table of {pattern, methods} used only to tell a genuine 404 (no
// route matches this path at all) apart from a 405 (the path is real, but
// this method isn't supported on it) — Hono's router doesn't expose that
// distinction itself, so app.notFound() consults this table.
export interface RoutePattern {
  regex: RegExp;
  methods: string[];
}

export const routeTable: RoutePattern[] = [
  { regex: /^\/$/, methods: ["GET", "HEAD"] },
  { regex: /^\/docs$/, methods: ["GET", "HEAD"] },
  { regex: /^\/openapi\.json$/, methods: ["GET", "HEAD"] },
  { regex: /^\/llms\.txt$/, methods: ["GET", "HEAD"] },
  { regex: /^\/robots\.txt$/, methods: ["GET", "HEAD"] },
  { regex: /^\/sitemap\.xml$/, methods: ["GET", "HEAD"] },
  { regex: /^\/healthz$/, methods: ["GET"] },
  { regex: /^\/donate$/, methods: ["GET", "HEAD"] },
  { regex: /^\/get-access$/, methods: ["GET", "HEAD"] },
  { regex: /^\/get-access\/generate-key$/, methods: ["POST"] },
  { regex: /^\/get-access\/regenerate-key$/, methods: ["POST"] },
  { regex: /^\/auth\/github\/donate\/start$/, methods: ["GET"] },
  { regex: /^\/auth\/github\/consumer\/start$/, methods: ["GET"] },
  { regex: /^\/auth\/github\/callback$/, methods: ["GET"] },
  { regex: /^\/auth\/hackclub\/start$/, methods: ["GET"] },
  { regex: /^\/auth\/hackclub\/callback$/, methods: ["GET"] },
  { regex: /^\/admin$/, methods: ["GET"] },
  { regex: /^\/admin\/ws$/, methods: ["GET"] },
  { regex: /^\/admin\/keys\.json$/, methods: ["GET"] },
  { regex: /^\/admin\/keys_usage\.json$/, methods: ["GET"] },
  { regex: /^\/admin\/recent\.json$/, methods: ["GET"] },
  { regex: /^\/admin\/apikeys\/[^/]+\/disable$/, methods: ["POST"] },
  { regex: /^\/gh\/graphql$/, methods: ["POST"] },
  { regex: /^\/gh\/.*$/, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD"] },
];

export function methodsFor(pathname: string): string[] | null {
  for (const r of routeTable) {
    if (r.regex.test(pathname)) return r.methods;
  }
  return null;
}
