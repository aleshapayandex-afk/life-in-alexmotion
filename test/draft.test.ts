import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { buildSystem, generateDraft } from "../src/lib/claude";
import { resolveMaterial } from "../src/commands/draft";
import { insertInbox } from "../src/lib/db";
import { STYLE_GUIDE } from "../src/voice";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeAll(async () => {
  await testEnv.DB.exec(
    "CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT, file_id TEXT, media_group_id TEXT, rubric TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );
});

/** Мок fetch с программируемой последовательностью статусов. */
function mockClaude(statuses: number[], text = "Готовый пост\n\nTrain. Think. Explore.") {
  const calls: { url: string; headers: any; body: any }[] = [];
  let i = 0;
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const status = statuses[Math.min(i, statuses.length - 1)]!;
    i++;
    if (status === 200) {
      return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("err", { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("buildSystem — prompt caching", () => {
  it("первый блок — STYLE_GUIDE с cache_control ephemeral", () => {
    const blocks = buildSystem([]);
    expect(blocks[0]!.text).toBe(STYLE_GUIDE);
    expect(blocks[0]!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("недавние посты добавляются вторым блоком", () => {
    const blocks = buildSystem(["Пост 1", "Пост 2"]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.text).toContain("Пост 1");
    expect(blocks[1]!.cache_control).toBeUndefined();
  });
});

describe("generateDraft — запрос и разбор (сценарий 2)", () => {
  it("формирует корректный запрос к Anthropic", async () => {
    const { fn, calls } = mockClaude([200]);
    const text = await generateDraft(testEnv, "пробежал 10 км за 47:12", [], fn);

    expect(text).toContain("Train. Think. Explore.");
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.headers["x-api-key"]).toBe(testEnv.CLAUDE_API_KEY);
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    // system — массив блоков с cache_control на первом
    expect(Array.isArray(calls[0]!.body.system)).toBe(true);
    expect(calls[0]!.body.system[0].cache_control).toEqual({ type: "ephemeral" });
    // материал попал в user-сообщение
    expect(calls[0]!.body.messages[0].content).toContain("47:12");
  });

  it("ретраит 429 и затем успешно возвращает текст", async () => {
    const { fn, calls } = mockClaude([429, 200]);
    const text = await generateDraft(testEnv, "тема", [], fn);
    expect(text).toContain("Готовый пост");
    expect(calls.length).toBe(2);
  });

  it("после исчерпания попыток бросает ошибку", async () => {
    const { fn } = mockClaude([500, 500, 500]);
    await expect(generateDraft(testEnv, "тема", [], fn)).rejects.toThrow();
  });
});

describe("resolveMaterial — выбор источника", () => {
  it("пустой аргумент → ошибка", async () => {
    const r = await resolveMaterial(testEnv, "");
    expect(r.ok).toBe(false);
  });

  it("тема (не число) → материал = тема", async () => {
    const r = await resolveMaterial(testEnv, "дисциплина утром");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.material).toBe("дисциплина утром");
      expect(r.inboxId).toBeNull();
    }
  });

  it("число → материал из inbox с пометкой о медиа", async () => {
    const id = await insertInbox(testEnv, {
      kind: "photo",
      text: "горы, 102 км/ч",
      file_id: "F",
      media_group_id: null,
    });
    const r = await resolveMaterial(testEnv, String(id));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.material).toContain("102 км/ч");
      expect(r.material).toContain("photo");
      expect(r.inboxId).toBe(id);
    }
  });

  it("несуществующий id → ошибка", async () => {
    const r = await resolveMaterial(testEnv, "999999");
    expect(r.ok).toBe(false);
  });
});
