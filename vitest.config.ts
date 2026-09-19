import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              BASE_URL: "http://localhost:8787",
              MAX_CACHE_TIME: "300",
              MAX_CACHE_SIZE_MB: "100",
              MAX_PROXY_BODY_BYTES: "1048576",
              ALLOWED_VERIFICATION_STATUSES: "verified_eligible,verified_eligible_18_plus",
              ADMIN_BOOTSTRAP_HC_USER_IDS: "",
              GITHUB_OAUTH_CLIENT_ID: "test-client-id",
              GITHUB_OAUTH_CLIENT_SECRET: "test-client-secret",
              HACKCLUB_OAUTH_CLIENT_ID: "test-client-id",
              HACKCLUB_OAUTH_CLIENT_SECRET: "test-client-secret",
              TOKEN_ENCRYPTION_KEY: "d7rdkK8hM0teSoGFK2ITVGB/5y8rlp32bwtSFAAcnGo=",
              SESSION_SIGNING_KEY: "LbxJNX/rE7LhEG2ApxZgElf/a+h970yskdPeTBNzdyA=",
            },
          },
        },
      },
    },
  };
});
