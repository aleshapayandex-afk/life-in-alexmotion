import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { answerCallbackQuery, editMessageText } from "../src/lib/telegram";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

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

describe("answerCallbackQuery", () => {
  it("шлёт callback_query_id и текст, если он передан", async () => {
    const { fn, calls } = mockFetch();
    await answerCallbackQuery(testEnv, "cbq-1", "Уже удалено", fn);
    expect(calls[0]!.url).toContain("/answerCallbackQuery");
    expect(calls[0]!.body.callback_query_id).toBe("cbq-1");
    expect(calls[0]!.body.text).toBe("Уже удалено");
  });

  it("без текста поле text не отправляется", async () => {
    const { fn, calls } = mockFetch();
    await answerCallbackQuery(testEnv, "cbq-2", undefined, fn);
    expect(calls[0]!.body.text).toBeUndefined();
  });
});

describe("editMessageText", () => {
  it("шлёт chat_id, message_id, текст и доп. поля (reply_markup)", async () => {
    const { fn, calls } = mockFetch();
    await editMessageText(testEnv, 111, 22, "Отменено.", fn, {
      reply_markup: { inline_keyboard: [] },
    });
    expect(calls[0]!.url).toContain("/editMessageText");
    expect(calls[0]!.body.chat_id).toBe(111);
    expect(calls[0]!.body.message_id).toBe(22);
    expect(calls[0]!.body.text).toBe("Отменено.");
    expect(calls[0]!.body.reply_markup).toEqual({ inline_keyboard: [] });
  });
});
