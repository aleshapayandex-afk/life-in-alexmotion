import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { buildSystemPrompt, generateDraft, generateIdeas } from "../src/lib/ai";
import { STYLE_GUIDE } from "../src/voice";
import type { Env } from "../src/types";
import type { AiRunner } from "../src/lib/ai";

const testEnv = env as unknown as Env;

/** Мок-runner: пишет вызовы, возвращает заданный ответ. */
function mockRunner(response = "Готовый пост\n\nTrain. Think. Explore.") {
  const calls: { model: string; input: any }[] = [];
  const runner: AiRunner = async (model, input) => {
    calls.push({ model, input });
    return { response };
  };
  return { runner, calls };
}

describe("buildSystemPrompt", () => {
  it("без постов = STYLE_GUIDE", () => {
    expect(buildSystemPrompt([])).toBe(STYLE_GUIDE);
  });

  it("с постами добавляет контекст", () => {
    const s = buildSystemPrompt(["Пост 1", "Пост 2"]);
    expect(s).toContain(STYLE_GUIDE);
    expect(s).toContain("Пост 1");
    expect(s).toContain("НЕДАВНИЕ ПОСТЫ");
  });
});

describe("generateDraft (Workers AI)", () => {
  it("шлёт system+user и возвращает текст", async () => {
    const { runner, calls } = mockRunner();
    const text = await generateDraft(testEnv, "пробежал 10 км за 47:12", [], runner);

    expect(text).toContain("Train. Think. Explore.");
    expect(calls).toHaveLength(1);
    const msgs = calls[0]!.input.messages;
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain(STYLE_GUIDE);
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("47:12");
  });

  it("пустой ответ модели → ошибка", async () => {
    const empty: AiRunner = async () => ({ response: "" });
    await expect(generateDraft(testEnv, "тема", [], empty)).rejects.toThrow();
  });
});

describe("generateIdeas (Workers AI)", () => {
  it("возвращает идеи и передаёт контекст в user", async () => {
    const { runner, calls } = mockRunner("[TRAIN] про дисциплину утром");
    const ideas = await generateIdeas(testEnv, "тема: сноуборд", runner);

    expect(ideas).toContain("TRAIN");
    expect(calls[0]!.input.messages[1].content).toContain("сноуборд");
  });
});
