// One instance per API-key hash (env.RATE_LIMITER.idFromName(apiKeyHash)).
// Replaces the Go server's in-memory sync.Mutex-protected token bucket map —
// Workers isolates can't hold that kind of state reliably across requests,
// so the bucket lives here instead, persisted to durable storage so it
// survives DO eviction between bursts.

export interface RateLimitState {
  limit: number;
  remaining: number;
  reset: number;
}

interface BucketState {
  capacity: number;
  tokens: number;
  lastMs: number;
}

export class RateLimiterDO {
  state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/allow" || request.method !== "POST") {
      return new Response("not found", { status: 404 });
    }
    const { perSec } = (await request.json()) as { perSec: number };
    if (!perSec || perSec <= 0) {
      return Response.json({ allowed: false, limit: 0, remaining: 0, reset: 0 });
    }

    let bucket = await this.state.storage.get<BucketState>("bucket");
    const now = Date.now();
    if (!bucket) {
      bucket = { capacity: perSec, tokens: perSec, lastMs: now };
    }
    if (bucket.capacity !== perSec) {
      bucket.capacity = perSec;
      if (bucket.tokens > perSec) bucket.tokens = perSec;
    }
    const dtSeconds = (now - bucket.lastMs) / 1000;
    bucket.lastMs = now;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + dtSeconds * perSec);

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;

    await this.state.storage.put("bucket", bucket);

    const remaining = Math.max(0, Math.floor(bucket.tokens));
    const reset = bucket.tokens < bucket.capacity ? Math.ceil((bucket.capacity - bucket.tokens) / bucket.capacity) : 0;

    return Response.json({ allowed, limit: bucket.capacity, remaining, reset } satisfies { allowed: boolean } & RateLimitState);
  }
}
