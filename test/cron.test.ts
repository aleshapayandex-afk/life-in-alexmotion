import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleScheduled } from "../src/cron";
import { insertInbox } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
});

/** Мок fetch, считающий вызовы Telegram. */
function mockFetch() {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("handleScheduled — недельный дайджест (сценарий 5)", () => {
  it("пустой inbox: не падает и ничего не шлёт", async () => {
    const { fn, calls } = mockFetch();
    const sent = await handleScheduled(testEnv, fn);
    expect(sent).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("есть материал: шлёт один дайджест с количеством и пунктами", async () => {
    await insertInbox(testEnv, { text: "идея про дисциплину" });
    await insertInbox(testEnv, { text: "горы" });

    const { fn, calls } = mockFetch();
    const sent = await handleScheduled(testEnv, fn);

    expect(sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/sendMessage");
    const text = String(calls[0]!.body.text);
    expect(text).toContain("дайджест");
    expect(text).toContain("2");
    expect(text).toContain("дисциплину");
  });
});
