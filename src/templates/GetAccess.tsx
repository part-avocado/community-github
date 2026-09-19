import { Layout } from "./Layout";

export function LoginRequiredPage() {
  return (
    <Layout title="Get access · gh-proxy">
      <h1>Get your own API key</h1>
      <p class="lead">
        Log in with Hack Club Auth to check your eligibility. You'll need a "verified eligible" or
        verified 18+ status.
      </p>
      <a class="btn" href="/auth/hackclub/start?return=/get-access">
        Log in with Hack Club Auth →
      </a>
    </Layout>
  );
}

export function NotEligiblePage({ status }: { status: string | null }) {
  return (
    <Layout title="Get access · gh-proxy">
      <h1>Not eligible (yet)</h1>
      <div class="card">
        <span class="badge warn">verification_status: {status ?? "unknown"}</span>
      </div>
      <p class="lead">
        Your Hack Club Auth verification status doesn't currently qualify for automatic API access.
        If you think this is wrong, check your status at{" "}
        <a href="https://auth.hackclub.com" target="_blank" rel="noreferrer">
          auth.hackclub.com
        </a>
        .
      </p>
      <p>You can still help the shared pool without a key:</p>
      <a class="btn secondary" href="/donate">
        Donate a token →
      </a>
    </Layout>
  );
}

export function NeedsDonationPage() {
  return (
    <Layout title="Get access · gh-proxy">
      <h1>You're eligible 🎉</h1>
      <p class="lead">
        Donate a GitHub token to activate your API key. We only ever request the read-only
        <code> read:user</code> scope — no private permissions.
      </p>
      <a class="btn" href="/auth/github/consumer/start">
        Donate with GitHub to activate →
      </a>
    </Layout>
  );
}

export function KeyReadyPage({ plaintextKey }: { plaintextKey: string }) {
  return (
    <Layout title="Get access · gh-proxy">
      <h1>Your API key</h1>
      <div class="card">
        <p>
          <span class="badge ok">Copy this now</span> — you won't be able to see it again.
        </p>
        <pre>
          <code>{plaintextKey}</code>
        </pre>
      </div>
      <p>
        Use it in the <code>X-API-Key</code> header on every request. See <a href="/docs">the docs</a>{" "}
        for examples.
      </p>
    </Layout>
  );
}

export function KeyExistsPage({ display, csrf }: { display: string; csrf: string }) {
  return (
    <Layout title="Get access · gh-proxy">
      <h1>Your API key is active</h1>
      <div class="card">
        <p>
          Key: <code>{display}</code>
        </p>
      </div>
      <p>
        Lost the key, or need to rotate it? Regenerating invalidates the old key immediately and
        shows the new one once.
      </p>
      <form method="post" action="/get-access/regenerate-key">
        <input type="hidden" name="csrf" value={csrf} />
        <button type="submit" class="secondary">
          Regenerate key
        </button>
      </form>
    </Layout>
  );
}
