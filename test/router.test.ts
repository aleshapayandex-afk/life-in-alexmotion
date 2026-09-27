import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleMessage } from "../src/router";
import { insertInbox, insertDraft, listNewInbox } from "../src/lib/db";
import type { Env, TgMessage } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
  await testEnv.DB.exec("DELETE FROM drafts;");
  await testEnv.DB.exec("DELETE FROM bot_state;");
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

function msg(text: string): TgMessage {
  return {
    message_id: 1,
    chat: { id: 1, type: "private" },
    date: 0,
    text,
  };
}

describe("режим ожидания номера для /inbox_view, /inbox_del, /draft_view, /draft_del", () => {
  it("/inbox_view без аргумента, затем номер — не создаёт запись в inbox, а показывает запись", async () => {
    const id = await insertInbox(testEnv, { text: "заметка для просмотра" });
    const { fn, calls } = mockFetch();

    await handleMessage(testEnv, msg("/inbox_view"), fn);
    await handleMessage(testEnv, msg(String(id)), fn);

    const items = await listNewInbox(testEnv);
    expect(items).toHaveLength(1); // не появилось новой записи

    const last = calls[calls.length - 1]!;
    expect(String(last.body.text)).toContain("заметка для просмотра");
  });

  it("/inbox_del без аргумента, затем номер — показывает клавиатуру подтверждения, не создаёт запись", async () => {
    const id = await insertInbox(testEnv, { text: "на удаление" });
    const { fn, calls } = mockFetch();

    await handleMessage(testEnv, msg("/inbox_del"), fn);
    await handleMessage(testEnv, msg(String(id)), fn);

    const items = await listNewInbox(testEnv);
    expect(items).toHaveLength(1);

    const last = calls[calls.length - 1]!;
    expect(last.body.reply_markup.inline_keyboard[0][0].callback_data).toBe(`del_inbox:${id}`);
  });

  it("/draft_view без аргумента, затем номер — показывает черновик, не создаёт запись в inbox", async () => {
    const id = await insertDraft(testEnv, "черновик для просмотра", null);
    const { fn, calls } = mockFetch();

    await handleMessage(testEnv, msg("/draft_view"), fn);
    await handleMessage(testEnv, msg(String(id)), fn);

    const items = await listNewInbox(testEnv);
    expect(items).toHaveLength(0);

    const last = calls[calls.length - 1]!;
    expect(String(last.body.text)).toContain("черновик для просмотра");
  });

  it("/draft_del без аргумента, затем номер — показывает клавиатуру подтверждения, не создаёт запись", async () => {
    const id = await insertDraft(testEnv, "черновик на удаление", null);
    const { fn, calls } = mockFetch();

    await handleMessage(testEnv, msg("/draft_del"), fn);
    await handleMessage(testEnv, msg(String(id)), fn);

    const items = await listNewInbox(testEnv);
    expect(items).toHaveLength(0);

    const last = calls[calls.length - 1]!;
    expect(last.body.reply_markup.inline_keyboard[0][0].callback_data).toBe(`del_draft:${id}`);
  });
});
