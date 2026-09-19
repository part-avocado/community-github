import { Layout } from "./Layout";

export interface IndexData {
  donors: number;
  lastUser: string | null;
  lastAgo: string | null;
  totalRequests: string;
  requests24Hours: string;
  requests24HoursLabel: string;
}

export function IndexPage(data: IndexData) {
  return (
    <Layout title="gh-proxy · Hack Club GitHub API proxy">
      <nav class="top">
        <a href="/docs">Docs</a>
        <a href="/get-access">Get access</a>
        <a href="/donate">Donate a token</a>
        <a href="/admin">Admin</a>
      </nav>
      <h1>gh-proxy</h1>
      <p class="lead">
        gh-proxy is a small service by Hack Club that lets us make cached public API calls beyond
        GitHub's normal rate limits — to do things like understand how many people have shipped
        projects in Hack Club events, and more.
      </p>

      <div class="card stats">
        <div class="stat">
          <div class="n">{data.donors}</div>
          <div class="l">donated tokens</div>
        </div>
        <div class="stat">
          <div class="n">{data.lastUser ? `@${data.lastUser}` : "—"}</div>
          <div class="l">last donor{data.lastAgo ? ` · ${data.lastAgo}` : ""}</div>
        </div>
        <div class="stat">
          <div class="n">{data.totalRequests}</div>
          <div class="l">requests proxied, all time</div>
        </div>
        <div class="stat">
          <div class="n">{data.requests24Hours}</div>
          <div class="l">requests {data.requests24HoursLabel}</div>
        </div>
      </div>

      <h2>Get your own API key</h2>
      <p>
        Log in with Hack Club Auth (you'll need a "verified eligible" or verified 18+ status) and
        donate a GitHub token to activate your own rate-limited API key — no admin required.
      </p>
      <a class="btn" href="/get-access">
        Get access →
      </a>

      <h2>Just want to help?</h2>
      <p>
        Anyone can donate a GitHub access token to grow the shared pool, with or without a Hack Club
        account. The token gives no private permissions — it's read-only access to everything on
        GitHub.com, and you can revoke it on GitHub at any time.
      </p>
      <a class="btn secondary" href="/donate">
        Donate a token →
      </a>
    </Layout>
  );
}
