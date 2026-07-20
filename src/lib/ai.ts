import type { Env } from "../types";
import { STYLE_GUIDE } from "../voice";

// Сильнейшая доступная инструктивная модель Workers AI на сегодня.
const DEFAULT_MODEL = "@cf/openai/gpt-oss-120b";
const MAX_TOKENS = 1024;

/** Инъекция вызова модели для тестируемости (по умолчанию — env.AI.run). */
export type AiRunner = (model: string, input: unknown) => Promise<unknown>;

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

/** Системный промпт: стиль канала + недавние посты для согласованности тона. */
export function buildSystemPrompt(recentPosts: string[]): string {
  if (recentPosts.length === 0) return STYLE_GUIDE;
  const ctx = recentPosts.map((p, i) => `[${i + 1}]\n${p}`).join("\n\n---\n\n");
  return `${STYLE_GUIDE}\n\nНЕДАВНИЕ ПОСТЫ КАНАЛА (для согласованности тона, не копируй дословно):\n\n${ctx}`;
}

const IDEAS_SYSTEM = `Ты помогаешь автору Telegram-канала «Life in AlexMotion» придумывать темы для постов. Рубрики: TRAIN (бег, кроссфит, сноуборд), THINK (AI, технологии, стройка проекта, системное мышление), EXPLORE (путешествия, локации), LIFE (дисциплина, рефлексия). Тон автора — честный, конкретный, с цифрами, без коучинговых штампов.
Предложи 3 короткие идеи для постов. Формат: каждая идея — одна строка «[РУБРИКА] суть в 5-10 словах». Без вступлений и пояснений.`;

/** Общее ядро: вызов модели чата, возврат текста. */
async function run(
  env: Env,
  system: string,
  user: string,
  runner: AiRunner,
): Promise<string> {
  const model = env.CF_MODEL ?? DEFAULT_MODEL;
  const res = (await runner(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: MAX_TOKENS,
  })) as { response?: string; choices?: { message?: { content?: string } }[] };

  const text = res?.response?.trim() ?? res.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("Пустой ответ модели");
  return text;
}

/** Генерация черновика поста по материалу. */
export function generateDraft(
  env: Env,
  material: string,
  recentPosts: string[],
  runner: AiRunner = (m, i) => env.AI.run(m, i),
): Promise<string> {
  return run(
    env,
    buildSystemPrompt(recentPosts),
    `Материал:\n\n${material}\n\nЗадача - написать пост для канала «Life in AlexMotion» в этом стиле. Найди историю внутри материала, не пересказывай его. Верни только текст поста, без пояснений.`,
    runner,
  );
}

/** Генерация 2-3 тем для постов. */
export function generateIdeas(
  env: Env,
  context: string,
  runner: AiRunner = (m, i) => env.AI.run(m, i),
): Promise<string> {
  return run(env, IDEAS_SYSTEM, context, runner);
}
