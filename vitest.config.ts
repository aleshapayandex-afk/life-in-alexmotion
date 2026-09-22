import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Тесты гоняют ТУ ЖЕ схему, что накатывается в прод: миграции читаются из
// migrations/ и применяются к тестовой D1 в setup-файле. Раньше каждый тест
// держал свою рукописную копию CREATE TABLE, и миграции не проверялись вообще.
const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.test.toml" },
        miniflare: {
          // Тестовые значения секретов/переменных (НЕ настоящие).
          bindings: {
            OWNER_USER_ID: "111111",
            WEBHOOK_SECRET: "test-secret",
            BOT_TOKEN: "test-bot-token",
            CLAUDE_API_KEY: "test-claude-key",
            CHANNEL_ID: "@test_channel",
            TEST_MIGRATIONS: migrations,
          },
        },
      },
    },
  },
});
