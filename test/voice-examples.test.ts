import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { VOICE_EXAMPLES } from "../src/voice-examples.generated";
import { buildSystemPrompt } from "../src/lib/ai";
import { handleDraft } from "../src/commands/draft";
import { insertInbox } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

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

  it("эталоны соблюдают правила канала: без тире и без «ё»", () => {
    // Корпус — источник правды для тона, поэтому нарушать правила он не вправе.
    // Весь корпус целиком проверяет lintCorpus в scripts/gen-voice-examples.mjs
    // (падает в npm test); здесь — страховка на те четыре файла, что реально
    // доезжают до модели.
    for (const example of VOICE_EXAMPLES) {
      expect(example).not.toMatch(/[‐-―−]/);
      expect(example).not.toMatch(/[ёЁ]/);
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
