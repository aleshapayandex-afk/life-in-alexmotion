import { applyD1Migrations, env } from "cloudflare:test";

// Прогоняется один раз перед тестами каждого воркера: поднимает схему из
// migrations/ — ровно ту, что уедет в прод.
const testEnv = env as unknown as {
  DB: D1Database;
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
