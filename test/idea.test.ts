import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { buildIdeaContext } from "../src/commands/idea";
import { insertInbox } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
});

describe("buildIdeaContext", () => {
  it("с темой → контекст вокруг темы", async () => {
    const ctx = await buildIdeaContext(testEnv, "сноуборд и скорость");
    expect(ctx).toContain("сноуборд и скорость");
  });

  it("без темы и пустой inbox → fallback на рубрики", async () => {
    const ctx = await buildIdeaContext(testEnv, "");
    expect(ctx.toLowerCase()).toContain("рубрик");
  });

  it("без темы, но с материалом → собирает заметки", async () => {
    await insertInbox(testEnv, { text: "забег в песчаную бурю" });
    const ctx = await buildIdeaContext(testEnv, "");
    expect(ctx).toContain("песчаную бурю");
  });
});
