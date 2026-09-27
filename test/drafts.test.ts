import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  handleDrafts,
  handleDraftView,
  handleDraftDelete,
  renderDraftsList,
} from "../src/commands/drafts";
import { insertDraft, getDraft, type DraftItem } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
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

function draftItem(over: Partial<DraftItem>): DraftItem {
  return {
    id: 1,
    inbox_id: null,
    content: "текст",
    status: "draft",
    created_at: "2026-09-27 10:15:00",
    ...over,
  };
}

describe("renderDraftsList", () => {
  it("пустой список", () => {
    expect(renderDraftsList([])).toContain("Черновиков нет");
  });

  it("строка содержит id, дату и превью", () => {
    const text = renderDraftsList([draftItem({ id: 5, content: "Заголовок черновика" })]);
    expect(text).toContain("#5");
    expect(text).toContain("2026-09-27 10:15");
    expect(text).toContain("Заголовок черновика");
  });
});

describe("handleDrafts", () => {
  it("шлёт список сохранённых черновиков", async () => {
    await insertDraft(testEnv, "первый черновик", null);
    const { fn, calls } = mockFetch();
    await handleDrafts(testEnv, fn);
    expect(String(calls[0]!.body.text)).toContain("первый черновик");
  });
});

describe("handleDraftView", () => {
  it("показывает полный текст черновика с HTML-разметкой", async () => {
    const id = await insertDraft(testEnv, "Заголовок\n\nТело черновика", null);
    const { fn, calls } = mockFetch();
    await handleDraftView(testEnv, String(id), fn);
    expect(calls[0]!.body.parse_mode).toBe("HTML");
    expect(String(calls[0]!.body.text)).toContain("Тело черновика");
  });

  it("несуществующий id → «не найден»", async () => {
    const { fn, calls } = mockFetch();
    await handleDraftView(testEnv, "999999", fn);
    expect(String(calls[0]!.body.text)).toContain("не найден");
  });
});

describe("handleDraftDelete", () => {
  it("показывает черновик и клавиатуру подтверждения, НЕ удаляет сразу", async () => {
    const id = await insertDraft(testEnv, "черновик на удаление", null);
    const { fn, calls } = mockFetch();
    await handleDraftDelete(testEnv, String(id), fn);

    expect(String(calls[0]!.body.text)).toContain("черновик на удаление");
    expect(calls[0]!.body.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      `del_draft:${id}`,
    );
    expect(await getDraft(testEnv, id)).not.toBeNull();
  });
});
