import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { preparePost, SIGNATURE, TEXT_LIMIT } from "../src/templates";
import { sendPhoto } from "../src/lib/telegram";
import { publishInboxItem, publishText } from "../src/commands/publish";
import { insertInbox, getInbox, getRecentPosts } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeAll(async () => {
  await testEnv.DB.exec(
    "CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT, file_id TEXT, media_group_id TEXT, rubric TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );
  await testEnv.DB.exec(
    "CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, rubric TEXT, file_id TEXT, channel_msg_id INTEGER, published_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );
});

/** Мок fetch: записывает вызовы, отдаёт успешный ответ Bot API. */
function mockFetch(messageId = 555) {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("preparePost — валидация (сценарий 6)", () => {
  it("пустой текст → ошибка", () => {
    const r = preparePost("   ", false);
    expect(r.ok).toBe(false);
  });

  it("слишком длинный текст → ошибка", () => {
    const r = preparePost("a".repeat(TEXT_LIMIT + 1), false);
    expect(r.ok).toBe(false);
  });

  it("нормальный текст → ok и добавлена подпись", () => {
    const r = preparePost("Новый PR на 10 км", false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text.endsWith(SIGNATURE)).toBe(true);
  });

  it("подпись не дублируется, если уже есть", () => {
    const r = preparePost(`Текст\n\n${SIGNATURE}`, false);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const occurrences = r.text.split(SIGNATURE).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});

describe("sendPhoto — формирование запроса (сценарий 8)", () => {
  it("шлёт sendPhoto с file_id и подписью, возвращает message_id", async () => {
    const { fn, calls } = mockFetch(777);
    const msgId = await sendPhoto(testEnv, "@chan", "FILE_ABC", "подпись", fn);

    expect(msgId).toBe(777);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/sendPhoto");
    expect(calls[0]!.body.photo).toBe("FILE_ABC");
    expect(calls[0]!.body.chat_id).toBe("@chan");
    expect(calls[0]!.body.caption).toBe("подпись");
  });
});

describe("publishInboxItem — постинг сохранённого file_id (сценарий 8)", () => {
  it("публикует фото из inbox, помечает used, пишет в posts", async () => {
    const id = await insertInbox(testEnv, {
      kind: "photo",
      text: "горы на скорости",
      file_id: "SKI_FILE",
      media_group_id: null,
    });

    const { fn, calls } = mockFetch(888);
    const res = await publishInboxItem(testEnv, id, fn);

    expect(res.ok).toBe(true);
    expect(calls[0]!.url).toContain("/sendPhoto");
    expect(calls[0]!.body.photo).toBe("SKI_FILE");
    expect(String(calls[0]!.body.caption)).toContain(SIGNATURE);

    const row = await getInbox(testEnv, id);
    expect(row!.status).toBe("used");

    const recent = await getRecentPosts(testEnv, 5);
    expect(recent.some((c) => c.includes("горы на скорости"))).toBe(true);
  });

  it("повторная публикация той же записи → отказ", async () => {
    const id = await insertInbox(testEnv, {
      kind: "text",
      text: "разовая идея",
      file_id: null,
      media_group_id: null,
    });
    const { fn } = mockFetch();
    expect((await publishInboxItem(testEnv, id, fn)).ok).toBe(true);
    expect((await publishInboxItem(testEnv, id, fn)).ok).toBe(false);
  });

  it("несуществующий id → отказ", async () => {
    const { fn } = mockFetch();
    expect((await publishInboxItem(testEnv, 999999, fn)).ok).toBe(false);
  });
});

describe("publishText — литеральный текст в канал", () => {
  it("публикует текст через sendMessage", async () => {
    const { fn, calls } = mockFetch(101);
    const res = await publishText(testEnv, "Короткий пост", fn);
    expect(res.ok).toBe(true);
    expect(calls[0]!.url).toContain("/sendMessage");
    expect(String(calls[0]!.body.text)).toContain(SIGNATURE);
  });
});
