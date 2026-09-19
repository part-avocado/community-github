# gh-proxy

A community-run GitHub REST/GraphQL API proxy, hosted entirely on Cloudflare (**Workers**, **D1**, **R2**, **Durable Objects**). It's a shared pool of donated GitHub tokens behind a cached, rate-limited proxy:

- **Self-serve API keys.** Log in with [Hack Club Auth](https://auth.hackclub.com) (you need a "verified eligible" or verified-18+ status), donate a GitHub token, and get your own rate-limited API key — no admin required.
- **Open donation.** Anyone can donate a GitHub token to grow the shared pool at `/donate`, with or without a Hack Club account.
- **Pooled token rotation** by GitHub rate-limit category (core/search/code_search/graphql), tracked per token.
- **D1 + R2 caching** of GET/HEAD responses, with TTL and size-based eviction run on a Cron Trigger.
- **Per-key rate limiting** via a Durable Object token bucket.
- An **admin dashboard** at `/admin`, gated by Hack Club Auth + an allow-list, with live stats over a Durable-Object-backed WebSocket.

This is a full rewrite of an earlier Go/Postgres/Docker version of this service. That version required an admin to manually mint every consumer's API key; this version lets anyone who donates a token get their own.

---

## Architecture

| Concern | Cloudflare primitive |
|---|---|
| HTTP routing | [Hono](https://hono.dev) on Workers |
| Metadata (keys, donors, identities, stats, cache index) | D1 (SQLite) |
| Cached GitHub response bodies | R2 |
| Per-API-key rate limiting | Durable Object (`RateLimiterDO`) |
| Live admin dashboard stats | Durable Object (`AdminHubDO`), WebSocket Hibernation API |
| Cache eviction, log/stat pruning | Cron Trigger (`scheduled()`, every minute) |

Donated GitHub tokens are encrypted at rest in D1 with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`), decrypted only for the moment of an upstream GitHub API call.

---

## Local development

**Prereqs:** Node 18+, a Cloudflare account (for `wrangler login`, not required for local dev).

```bash
npm install
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars`:

```env
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
HACKCLUB_OAUTH_CLIENT_ID=...
HACKCLUB_OAUTH_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=...   # openssl rand -base64 32
SESSION_SIGNING_KEY=...    # openssl rand -base64 32
```

> Create a GitHub OAuth App with callback URL `http://localhost:8787/auth/github/callback` and scope `read:user` (read-only). Create a Hack Club Auth OAuth app at [auth.hackclub.com/developer/apps](https://auth.hackclub.com/developer/apps) with callback URL `http://localhost:8787/auth/hackclub/callback` and scopes `openid profile email name slack_id verification_status`.

Apply the D1 schema locally, then start the dev server:

```bash
npm run db:migrations:apply:local
npm run dev
```

- Home: `http://localhost:8787/`
- Get your own key: `http://localhost:8787/get-access`
- Donate a token (no account needed): `http://localhost:8787/donate`
- Admin: `http://localhost:8787/admin` (needs a Hack Club Auth identity on the admin allow-list — see below)
- Docs: `http://localhost:8787/docs`

### Admin access locally

The admin allow-list bootstraps itself from `ADMIN_BOOTSTRAP_HC_USER_IDS` (a comma-separated list of Hack Club Auth `sub` values) the first time `/admin` is hit with an empty `admins` table. Set it in `wrangler.toml`'s `[vars]` or override in `.dev.vars` for local dev.

### Tests

```bash
npm test        # vitest + @cloudflare/vitest-pool-workers (Miniflare-backed)
npm run typecheck
```

---

## Environment configuration

| Variable | Where | What it does |
|---|---|---|
| `BASE_URL` | `wrangler.toml` var | Public base URL of this deployment. Must match the external scheme+host (OAuth callbacks, WebSocket origin). |
| `MAX_CACHE_TIME` | var | Cache TTL in seconds for cached responses (`0` = unlimited). |
| `MAX_CACHE_SIZE_MB` | var | Approximate max size of cached response bodies in R2; oldest entries are evicted first. |
| `MAX_PROXY_BODY_BYTES` | var | Max allowed request body to `/gh/*` in bytes (`413` if exceeded). |
| `ALLOWED_VERIFICATION_STATUSES` | var | Comma-separated Hack Club Auth `verification_status` values that qualify for self-serve API access. |
| `ADMIN_BOOTSTRAP_HC_USER_IDS` | var | Comma-separated Hack Club Auth `sub` values seeded into the `admins` table the first time it's empty. |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | secret | GitHub OAuth App used by both `/donate` and `/get-access`'s token-donation step. |
| `HACKCLUB_OAUTH_CLIENT_ID` / `_SECRET` | secret | Hack Club Auth OAuth App used by `/get-access` and `/admin`. |
| `TOKEN_ENCRYPTION_KEY` | secret | 32 random bytes, base64-encoded. Encrypts donated GitHub tokens at rest (AES-256-GCM). |
| `SESSION_SIGNING_KEY` | secret | 32 random bytes, base64-encoded. Signs the Hack Club Auth session cookie (HMAC-SHA256). |

> **Note on `ALLOWED_VERIFICATION_STATUSES`:** the exact Hack Club Auth `verification_status` enum (e.g. a "verified eligible" vs. "verified, 18+" distinction) should be confirmed against a live Hack Club Auth OAuth app before launch — this is a one-line config change, not a code change.

---

## Endpoints

- **Homepage**: `/` — what the project is, links to `/get-access` and `/donate`.
- **Get access**: `/get-access` — Hack Club Auth login + GitHub token donation → self-serve API key.
- **Donate**: `/donate` — donate a GitHub token with no account required.
- **API docs**: `/docs`
- **Admin**: `/admin` — Hack Club Auth + allow-list protected. Live stats, key list, disable action.
- **REST proxy**: `/gh/{path}` → `https://api.github.com/{path}`
- **GraphQL proxy**: `/gh/graphql` → `https://api.github.com/graphql`

All `/gh/*` requests require `X-API-Key: <your key>`.

### Machine-readable

- **OpenAPI**: `/openapi.json`
- **llms.txt**: `/llms.txt` (site map for agents, [llmstxt.org](https://llmstxt.org) format)
- **Sitemap**: `/sitemap.xml`, **Crawler policy**: `/robots.txt`

---

## Errors and rate limit headers

Every error is JSON, never an HTML page:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "hint": "This key allows 10 requests/second; retry after 1 second(s) and back off exponentially",
    "documentation_url": "https://gh-proxy.hackclub.com/docs"
  }
}
```

Branch on `error.code`. `404`/`405` responses add an `error.links` array pointing at the entry points above. Unknown paths return a real `404`: JSON for API paths or `Accept: application/json`, HTML for browsers, markdown for everything else. Any other status on `/gh/*` is GitHub's own response, forwarded verbatim.

Every `/gh/*` response reports your live quota:

```
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 1
RateLimit-Policy: "default";q=10;w=1
RateLimit: "default";r=9;t=1
```

A `429` adds `Retry-After`. GitHub's own upstream quota is passed through separately as `X-RateLimit-*`.

---

## Deploying

```bash
npx wrangler d1 create gh-proxy          # then paste the returned database_id into wrangler.toml
npx wrangler r2 bucket create gh-proxy-cache
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
npx wrangler secret put HACKCLUB_OAUTH_CLIENT_ID
npx wrangler secret put HACKCLUB_OAUTH_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put SESSION_SIGNING_KEY
npm run db:migrations:apply:remote
npm run deploy
```

Set `BASE_URL` in `wrangler.toml` to your public HTTPS URL, and update the GitHub/Hack Club Auth OAuth apps' callback URLs to match.

---

## How it works

- **Token rotation:** donated tokens are encrypted at rest. The proxy picks the token with the most remaining quota for the request's category (core/search/code_search/graphql), tracked per token in D1. Revoked/unauthorized tokens are marked and skipped; re-donating clears the revocation.
- **Caching:** GET/HEAD 200 responses are cached — the response body in R2, a small index row in D1. A Cron Trigger sweeps expired entries and evicts the oldest ones once the pool exceeds `MAX_CACHE_SIZE_MB`.
- **Rate limiting:** each API key has a per-second limit (default 10 rps), enforced by a dedicated Durable Object per key.
