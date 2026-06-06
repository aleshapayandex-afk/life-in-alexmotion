import type { Env } from "../types";
import { STYLE_GUIDE } from "../voice";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * Системные блоки: стабильный STYLE_GUIDE кешируется (prompt caching),
 * блок с недавними постами добавляется отдельно как свежий контекст.
 */
export function buildSystem(recentPosts: string[]): SystemBlock[] {
  const blocks: SystemBlock[] = [
    { type: "text", text: STYLE_GUIDE, cache_control: { type: "ephemeral" } },
  ];
  if (recentPosts.length > 0) {
    const ctx =
      "НЕДАВНИЕ ПОСТЫ КАНАЛА (для согласованности тона, не копируй дословно):\n\n" +
      recentPosts.map((p, i) => `[${i + 1}]\n${p}`).join("\n\n---\n\n");
    blocks.push({ type: "text", text: ctx });
  }
  return blocks;
}

interface ClaudeResponse {
  content?: { type: string; text?: string }[];
}

function extractText(resp: unknown): string {
  const r = resp as ClaudeResponse;
  const text = r.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new ClaudeError("Пустой ответ Claude", 0);
  return text.trim();
}

/**
 * Генерация черновика поста по материалу.
 * @param material сырьё из inbox или тема поста.
 * @param recentPosts последние посты для контекста стиля.
 * @param fetchImpl инъекция fetch для тестов.
 */
export async function generateDraft(
  env: Env,
  material: string,
  recentPosts: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = {
    model: env.CLAUDE_MODEL ?? DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystem(recentPosts),
    messages: [
      {
        role: "user",
        content: `Материал для поста:\n\n${material}\n\nНапиши готовый пост в стиле канала.`,
      },
    ],
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.CLAUDE_API_KEY,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        return extractText(await res.json());
      }

      if (res.status === 429 || res.status >= 500) {
        lastErr = new ClaudeError(`Claude ${res.status}`, res.status);
        await backoff(attempt);
        continue;
      }
      throw new ClaudeError(`Claude ${res.status}`, res.status);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await backoff(attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new ClaudeError("Claude недоступен", 0);
}

function backoff(attempt: number): Promise<void> {
  const ms = 200 * 2 ** (attempt - 1);
  return new Promise((r) => setTimeout(r, ms));
}
