import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleInboxView, handleInboxDelete } from "../src/commands/inbox";
import { insertInbox, getInbox } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
});

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

describe("handleInboxView", () => {
  it("показывает полный текст записи", async () => {
    const id = await insertInbox(testEnv, { text: "длинная заметка про горы и бег" });
    const { fn, calls } = mockFetch();
    await handleInboxView(testEnv, String(id), fn);
    expect(String(calls[0]!.body.text)).toContain("длинная заметка про горы и бег");
  });

  it("несуществующий id → «не найдена»", async () => {
    const { fn, calls } = mockFetch();
    await handleInboxView(testEnv, "999999", fn);
    expect(String(calls[0]!.body.text)).toContain("не найдена");
  });

  it("нечисловой аргумент → просьба прислать номер", async () => {
    const { fn, calls } = mockFetch();
    await handleInboxView(testEnv, "abc", fn);
    expect(String(calls[0]!.body.text)).toContain("номер");
  });
});

describe("handleInboxDelete", () => {
  it("показывает текст и клавиатуру подтверждения, запись НЕ удаляется сразу", async () => {
    const id = await insertInbox(testEnv, { text: "удали меня" });
    const { fn, calls } = mockFetch();
    await handleInboxDelete(testEnv, String(id), fn);

    expect(String(calls[0]!.body.text)).toContain("удали меня");
    expect(calls[0]!.body.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      `del_inbox:${id}`,
    );
    expect(await getInbox(testEnv, id)).not.toBeNull();
  });

  it("несуществующий id → «не найдена», без клавиатуры", async () => {
    const { fn, calls } = mockFetch();
    await handleInboxDelete(testEnv, "999999", fn);
    expect(String(calls[0]!.body.text)).toContain("не найдена");
    expect(calls[0]!.body.reply_markup).toBeUndefined();
  });
});
