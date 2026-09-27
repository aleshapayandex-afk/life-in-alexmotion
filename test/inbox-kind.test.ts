import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { insertInbox, getInbox, listNewInbox } from "../src/lib/db";
import { formatInboxLine, renderInboxList } from "../src/commands/inbox";
import { handleDraft } from "../src/commands/draft";
import type { Env } from "../src/types";
import type { InboxItem } from "../src/lib/db";

const testEnv = env as unknown as Env;

/**
 * Окружение со счётчиком вызовов модели: генерация по готовому тексту
 * не должна запускаться вовсе, а не «запускаться и отбрасываться».
 */
function envWithAiSpy(): { env: Env; calls: () => number } {
  let calls = 0;
  const spied = {
    ...testEnv,
    AI: {
      async run() {
        calls++;
        return { response: "СГЕНЕРИРОВАННЫЙ ТЕКСТ" };
      },
    },
  } as unknown as Env;
  return { env: spied, calls: () => calls };
}

/** Мок Telegram: копит текст отправленных владельцу сообщений. */
function mockTelegram(): { fn: typeof fetch; sent: string[] } {
  const sent: string[] = [];
  const fn = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(init!.body as string).text);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, sent };
}

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
});

function item(over: Partial<InboxItem>): InboxItem {
  return { id: 1, text: "заметка", kind: "raw", status: "new", created_at: "", ...over };
}

describe("inbox.kind — миграция 0004", () => {
  it("по умолчанию запись — сырьё", async () => {
    const id = await insertInbox(testEnv, { text: "пробежал 10 км" });
    const row = await getInbox(testEnv, id);
    expect(row?.kind).toBe("raw");
  });

  it("готовый текст сохраняется как post", async () => {
    const id = await insertInbox(testEnv, { text: "готовый пост", kind: "post" });
    const row = await getInbox(testEnv, id);
    expect(row?.kind).toBe("post");
  });

  it("kind доезжает до списка, а не только до getInbox", async () => {
    await insertInbox(testEnv, { text: "сырьё" });
    await insertInbox(testEnv, { text: "готовое", kind: "post" });
    const rows = await listNewInbox(testEnv);
    expect(rows.map((r) => r.kind).sort()).toEqual(["post", "raw"]);
  });
});

describe("renderInboxList — типы записей в выводе", () => {
  it("сырьё и готовый текст помечены по-разному", () => {
    expect(formatInboxLine(item({ kind: "raw" }))).toContain("📝");
    expect(formatInboxLine(item({ id: 2, kind: "post" }))).toContain("✅");
  });

  it("легенда появляется, только когда есть готовые тексты", () => {
    const onlyRaw = renderInboxList([item({})]);
    expect(onlyRaw).toContain("/draft <id>");
    expect(onlyRaw).not.toContain("публикуй как есть");

    const mixed = renderInboxList([item({}), item({ id: 2, kind: "post" })]);
    expect(mixed).toContain("публикуй как есть");
  });

  it("пустой inbox по-прежнему отвечает подсказкой", () => {
    expect(renderInboxList([])).toContain("Inbox пуст");
  });
});

describe("/draft и тип записи", () => {
  it("по готовому тексту не генерирует, а отдаёт сохранённое", async () => {
    const id = await insertInbox(testEnv, {
      text: "Заголовок\n\nГотовый текст — с тире и «ё».",
      kind: "post",
    });
    const { env: spied, calls } = envWithAiSpy();
    const { fn, sent } = mockTelegram();

    await handleDraft(spied, String(id), fn);

    expect(calls()).toBe(0);
    // Одно сообщение: без «Думаю над черновиком…», раз думать не над чем.
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("СГЕНЕРИРОВАННЫЙ ТЕКСТ");
    // Текст авторский, но типографику всё равно чиним — он идёт в канал.
    expect(sent[0]).toContain("Готовый текст - с тире и");
    expect(sent[0]).not.toContain("ё");
  });

  it("по сырью генерация по-прежнему запускается", async () => {
    const id = await insertInbox(testEnv, { text: "пробежал 10 км за 47:12" });
    const { env: spied, calls } = envWithAiSpy();
    const { fn, sent } = mockTelegram();

    await handleDraft(spied, String(id), fn);

    expect(calls()).toBe(1);
    expect(sent.some((m) => m.includes("СГЕНЕРИРОВАННЫЙ ТЕКСТ"))).toBe(true);
  });

  it("тема строкой считается сырьём и идёт в генерацию", async () => {
    const { env: spied, calls } = envWithAiSpy();
    const { fn } = mockTelegram();

    await handleDraft(spied, "дисциплина утром", fn);

    expect(calls()).toBe(1);
  });
});
