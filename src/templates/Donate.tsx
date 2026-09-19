import { Layout } from "./Layout";

export function DonatePage({ donated, donors, lastUser }: { donated: boolean; donors: number; lastUser: string | null }) {
  return (
    <Layout title="Donate a token · gh-proxy">
      <nav class="top">
        <a href="/">Home</a>
        <a href="/get-access">Get access</a>
        <a href="/docs">Docs</a>
      </nav>
      <h1>Donate a GitHub token</h1>
      {donated ? (
        <div class="card">
          <span class="badge ok">Thanks!</span> Your token has been added to the shared pool.
        </div>
      ) : null}
      <p class="lead">
        No Hack Club account needed. Anyone can donate — it grows the shared pool everyone's API
        requests draw from.
      </p>
      <div class="card">
        <p>
          <strong>{donors}</strong> people have donated a token
          {lastUser ? (
            <>
              , most recently <strong>@{lastUser}</strong>
            </>
          ) : null}
          .
        </p>
      </div>
      <h2>What this gives us</h2>
      <p>
        We request the <code>read:user</code> scope only — <strong>no private permissions of any
        kind</strong>. It's read-only access to everything on GitHub.com that's already public. You
        can revoke it at any time from your{" "}
        <a href="https://github.com/settings/applications" target="_blank" rel="noreferrer">
          GitHub OAuth app settings
        </a>
        .
      </p>
      <a class="btn" href="/auth/github/donate/start">
        Donate with GitHub →
      </a>
    </Layout>
  );
}
