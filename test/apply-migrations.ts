import { applyD1Migrations, env } from "cloudflare:test";

// TEST_MIGRATIONS is injected by vitest.config.ts via readD1Migrations().
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
