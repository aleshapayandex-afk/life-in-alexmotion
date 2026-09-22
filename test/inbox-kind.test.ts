import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { insertInbox, getInbox, listNewInbox } from "../src/lib/db";
import { formatInboxLine, renderInboxList } from "../src/commands/inbox";
import type { Env } from "../src/types";
import type { InboxItem } from "../src/lib/db";

const testEnv = env as unknown as Env;

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
