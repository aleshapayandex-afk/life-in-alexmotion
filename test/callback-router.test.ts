import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCallbackQuery } from "../src/callback-router";
import { insertInbox, getInbox, insertDraft, getDraft } from "../src/lib/db";
import type { Env, TgCallbackQuery } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
  await testEnv.DB.exec("DELETE FROM drafts;");
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

function cq(data: string): TgCallbackQuery {
  return {
    id: "cbq-1",
    from: { id: 111111, is_bot: false },
    message: { message_id: 5, chat: { id: 111111, type: "private" }, date: 0 },
    data,
  };
}

describe("handleCallbackQuery — del_inbox", () => {
  it("удаляет запись, редактирует сообщение и отвечает на callback", async () => {
    const id = await insertInbox(testEnv, { text: "на удаление" });
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq(`del_inbox:${id}`), fn);

    expect(await getInbox(testEnv, id)).toBeNull();
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toContain("удалена");
    expect(edit.body.reply_markup).toEqual({ inline_keyboard: [] });
    expect(calls.some((c) => c.url.includes("/answerCallbackQuery"))).toBe(true);
  });

  it("повторное нажатие на уже удалённую запись — без ошибки", async () => {
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq("del_inbox:999999"), fn);
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toContain("Уже удалено");
  });
});

describe("handleCallbackQuery — del_draft", () => {
  it("удаляет черновик", async () => {
    const id = await insertDraft(testEnv, "черновик", null);
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq(`del_draft:${id}`), fn);

    expect(await getDraft(testEnv, id)).toBeNull();
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toContain("удалён");
  });
});

describe("handleCallbackQuery — cancel", () => {
  it("ничего не удаляет, сообщение меняет на «Отменено.»", async () => {
    const id = await insertInbox(testEnv, { text: "не трогать" });
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq("cancel"), fn);

    expect(await getInbox(testEnv, id)).not.toBeNull();
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toBe("Отменено.");
  });
});
