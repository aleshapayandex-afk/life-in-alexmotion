import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Тестовые значения секретов/переменных (НЕ настоящие).
          bindings: {
            OWNER_USER_ID: "111111",
            WEBHOOK_SECRET: "test-secret",
            BOT_TOKEN: "test-bot-token",
            CLAUDE_API_KEY: "test-claude-key",
            CHANNEL_ID: "@test_channel",
          },
        },
      },
    },
  },
});
