// TypeScript row shapes mirroring migrations/0001_init.sql. SQLite has no
// boolean type; 0/1 INTEGER columns are typed here as 0 | 1 to keep call
// sites honest about the conversion.

export interface DonatedTokenRow {
  id: string;
  github_user: string;
  github_user_id: number | null;
  token_ciphertext: ArrayBuffer;
  token_iv: ArrayBuffer;
  created_at: string;
  revoked: 0 | 1;
  last_ok_at: string | null;
  scopes: string | null;
  donor_hc_identity_id: string | null;
}

export type RateLimitCategory = "core" | "search" | "code_search" | "graphql";

export interface TokenRateLimitRow {
  token_id: string;
  category: RateLimitCategory;
  rate_limit: number;
  remaining: number;
  reset_at: string;
  updated_at: string;
}

export interface HcIdentityRow {
  id: string;
  hc_user_id: string;
  slack_id: string | null;
  email: string | null;
  name: string | null;
  verification_status: string | null;
  verification_status_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  key_hash: string;
  key_hint: string;
  hc_identity_id: string;
  donated_token_id: string;
  app_name: string;
  machine: string;
  rate_limit_per_sec: number;
  disabled: 0 | 1;
  created_at: string;
  last_used_at: string | null;
  total_requests: number;
  total_cached_requests: number;
}

export interface AdminRow {
  hc_user_id: string;
  note: string | null;
  added_at: string;
}

export interface CachedResponseRow {
  id: number;
  method: string;
  url: string;
  status: number;
  resp_headers: string;
  content_hash: string;
  r2_key: string;
  body_size: number;
  created_at: string;
  expires_at: string | null;
}

export interface RequestLogRow {
  id: number;
  api_key_hash: string;
  method: string;
  path: string;
  status: number;
  cache_hit: 0 | 1;
  created_at: string;
}

export interface SystemStatsRow {
  id: 1;
  total_requests: number;
  total_cached_requests: number;
  today_requests: number;
  today_date: string;
  stats_tracking_started_at: string;
  updated_at: string;
}

export interface RequestStatsHourlyRow {
  hour: string;
  requests: number;
}
