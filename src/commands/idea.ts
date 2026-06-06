import type { Env } from "../types";
import { listNewInbox } from "../lib/db";
import { generateIdeas } from "../lib/claude";
import { replyToOwner } from "../lib/telegram";

/** Собирает контекст для генерации идей: тема от автора или сырьё из inbox. */
export async function buildIdeaContext(env: Env, args: string): Promise<string> {
  const theme = args.trim();
  if (theme) {
    return `Тема, вокруг которой нужны идеи: ${theme}`;
  }

  const items = await listNewInbox(env, 20);
  const material = items
    .map((i) => i.text)
    .filter((t): t is string => !!t && t.trim().length > 0);

  if (material.length === 0) {
    return "Свежего материала нет. Предложи идеи на основе рубрик канала и типичных тем автора (бег, кроссфит, сноуборд, AI, стройка проекта, дисциплина).";
  }
  return `Накопленные заметки автора:\n\n${material.map((m) => `- ${m}`).join("\n")}\n\nПредложи темы для постов на их основе.`;
}

/** Обработчик /idea. Вызывается внутри ctx.waitUntil. */
export async function handleIdea(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await replyToOwner(env, "💡 Придумываю идеи…", fetchImpl);

  let ideas: string;
  try {
    const context = await buildIdeaContext(env, args);
    ideas = await generateIdeas(env, context, fetchImpl);
  } catch (err) {
    console.error("generateIdeas failed", err);
    await replyToOwner(env, "Не получилось придумать идеи (Claude недоступен). Попробуй позже.", fetchImpl);
    return;
  }

  await replyToOwner(env, `Идеи для постов:\n\n${ideas}\n\nСделать черновик: /draft <тема>`, fetchImpl);
}
