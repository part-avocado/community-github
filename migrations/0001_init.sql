-- Donated GitHub tokens (encrypted at rest with AES-256-GCM; see src/lib/crypto.ts).
-- donor_hc_identity_id is set only when the donation came through the self-serve
-- /get-access flow; anonymous /donate donors leave it NULL.
CREATE TABLE donated_tokens (
  id TEXT PRIMARY KEY,
  github_user TEXT NOT NULL UNIQUE,
  github_user_id INTEGER,
  token_ciphertext BLOB NOT NULL,
  token_iv BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked INTEGER NOT NULL DEFAULT 0,
  last_ok_at TEXT,
  scopes TEXT,
  donor_hc_identity_id TEXT REFERENCES hc_identities(id)
);
CREATE INDEX idx_donated_tokens_active_last_ok ON donated_tokens(last_ok_at) WHERE revoked = 0;

-- Per-token, per-category GitHub rate limit snapshot (core/search/code_search/graphql).
CREATE TABLE token_rate_limits (
  token_id TEXT NOT NULL REFERENCES donated_tokens(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('core', 'search', 'code_search', 'graphql')),
  rate_limit INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  reset_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (token_id, category)
);

-- Hack Club Auth identities, snapshotted on each login.
CREATE TABLE hc_identities (
  id TEXT PRIMARY KEY,
  hc_user_id TEXT NOT NULL UNIQUE,
  slack_id TEXT,
  email TEXT,
  name TEXT,
  verification_status TEXT,
  verification_status_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Self-serve consumer API keys. One per Hack Club identity, backed by that
-- same person's own donated token.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_hint TEXT NOT NULL,
  hc_identity_id TEXT NOT NULL UNIQUE REFERENCES hc_identities(id),
  donated_token_id TEXT NOT NULL REFERENCES donated_tokens(id),
  app_name TEXT NOT NULL,
  machine TEXT NOT NULL,
  rate_limit_per_sec INTEGER NOT NULL DEFAULT 10,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_cached_requests INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_api_keys_key_hash_active ON api_keys(key_hash) WHERE disabled = 0;

-- Admin allow-list. Bootstrapped from ADMIN_BOOTSTRAP_HC_USER_IDS on first use.
CREATE TABLE admins (
  hc_user_id TEXT PRIMARY KEY,
  note TEXT,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- GET/HEAD response cache. Body lives in R2 (CACHE_BUCKET) under r2_key; this
-- table is just the lookup index and metadata.
CREATE TABLE cached_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  resp_headers TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  body_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);
CREATE INDEX idx_cached_responses_lookup ON cached_responses(method, url, content_hash);
CREATE INDEX idx_cached_responses_created_at ON cached_responses(created_at);

-- Rolling recent-activity log, pruned to the last 1000 rows by the cron job.
CREATE TABLE request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_request_logs_recent ON request_logs(created_at DESC, api_key_hash);

-- Single-row cumulative counters (id is always 1).
CREATE TABLE system_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_cached_requests INTEGER NOT NULL DEFAULT 0,
  today_requests INTEGER NOT NULL DEFAULT 0,
  today_date TEXT NOT NULL,
  stats_tracking_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO system_stats (id, today_date, stats_tracking_started_at, updated_at)
VALUES (1, strftime('%Y-%m-%d', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Durable hourly request counts, kept for 8 days for the admin dashboard graph.
CREATE TABLE request_stats_hourly (
  hour TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0
);
