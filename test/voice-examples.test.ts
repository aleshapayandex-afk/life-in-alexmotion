import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { VOICE_EXAMPLES } from "../src/voice-examples.generated";
import { buildSystemPrompt } from "../src/lib/ai";
import { handleDraft } from "../src/commands/draft";
import { insertInbox } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeAll(async () => {
  await testEnv.DB.exec(
    "CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );
  await testEnv.DB.exec(
    "CREATE TABLE IF NOT EXISTS drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, inbox_id INTEGER, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );
});

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
  await testEnv.DB.exec("DELETE FROM drafts;");
});

describe("VOICE_EXAMPLES — сгенерированные эталоны", () => {
  it("четыре эталона, по одному на рубрику", () => {
    expect(VOICE_EXAMPLES).toHaveLength(4);
    for (const rubric of ["(TRAIN)", "(THINK)", "(EXPLORE)", "(LIFE)"]) {
      expect(VOICE_EXAMPLES.some((e) => e.includes(rubric))).toBe(true);
    }
  });

  it("каждый эталон — подпись плюс непустой текст поста", () => {
    for (const example of VOICE_EXAMPLES) {
      expect(example).toMatch(/^[^\n]+:\n«/);
      expect(example.length).toBeGreaterThan(200);
      expect(example.trimEnd().endsWith("»")).toBe(true);
    }
  });

  it("эталоны не учат модель ставить тире", () => {
    // Корпус — источник правды для тона, поэтому нарушать правила он не вправе.
    // Про «ё»: в 4 файлах корпуса из 34 она есть (10 вхождений, все пришли
    // из удалённого content/real-posts.md). Пока это открытый вопрос к автору,
    // проверки на «ё» здесь нет. Решится — вернуть assert сюда.
    for (const example of VOICE_EXAMPLES) {
      expect(example).not.toMatch(/[—–]/);
    }
  });
});

describe("эталоны доходят до модели", () => {
  it("buildSystemPrompt вставляет все четыре целиком", () => {
    const prompt = buildSystemPrompt(VOICE_EXAMPLES);
    expect(prompt).toContain("ЭТАЛОНЫ ГОЛОСА");
    for (const example of VOICE_EXAMPLES) {
      expect(prompt).toContain(example);
    }
  });

  it("handleDraft передаёт эталоны в системный промпт", async () => {
    const systems: string[] = [];
    const aiEnv = {
      ...testEnv,
      AI: {
        run: async (_model: string, input: { messages: { role: string; content: string }[] }) => {
          const sys = input.messages.find((m) => m.role === "system");
          if (sys) systems.push(sys.content);
          return { response: "Готовый пост\n\nTrain. Think. Explore." };
        },
      },
    } as unknown as Env;

    const id = await insertInbox(aiEnv, { text: "пробежал 10 км за 47:12" });
    await handleDraft(aiEnv, String(id), async () => new Response("{}"));

    expect(systems).toHaveLength(1);
    for (const example of VOICE_EXAMPLES) {
      expect(systems[0]).toContain(example);
    }
  });
});
