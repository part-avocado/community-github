export interface Env {
  DB: D1Database;
  CACHE_BUCKET: R2Bucket;
  RATE_LIMITER: DurableObjectNamespace;
  ADMIN_HUB: DurableObjectNamespace;

  BASE_URL: string;
  MAX_CACHE_TIME: string;
  MAX_CACHE_SIZE_MB: string;
  MAX_PROXY_BODY_BYTES: string;
  ALLOWED_VERIFICATION_STATUSES: string;
  ADMIN_BOOTSTRAP_HC_USER_IDS: string;

  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  HACKCLUB_OAUTH_CLIENT_ID: string;
  HACKCLUB_OAUTH_CLIENT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  SESSION_SIGNING_KEY: string;
}

export type Vars = Record<string, never>;
