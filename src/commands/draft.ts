import type { Env } from "../types";
import { getInbox, insertDraft } from "../lib/db";
import { generateDraft } from "../lib/ai";
import { VOICE_EXAMPLES } from "../voice-examples.generated";
import { replyToOwner } from "../lib/telegram";
import { formatDraft } from "../draft-format";
import { echoWarning } from "../echo-check";

/**
 * Определяет материал для черновика по аргументу команды.
 * Число → запись inbox; иначе → тема как есть.
 */
export async function resolveMaterial(
  env: Env,
  args: string,
): Promise<{ ok: true; material: string; inboxId: number | null } | { ok: false; error: string }> {
  const arg = args.trim();
  if (!arg) {
    return { ok: false, error: "Пришли номер из inbox или тему." };
  }

  if (/^\d+$/.test(arg)) {
    const id = Number(arg);
    const item = await getInbox(env, id);
    if (!item) return { ok: false, error: `Запись #${id} не найдена.` };

    const material = item.text?.trim();
    if (!material) {
      return { ok: false, error: `В записи #${id} нет текста для черновика.` };
    }
    return { ok: true, material, inboxId: id };
  }

  return { ok: true, material: arg, inboxId: null };
}

/**
 * Обработчик /draft. Вызывается уже внутри ctx.waitUntil, поэтому может
 * спокойно ждать Claude. Сначала шлёт «думаю…», затем — черновик.
 */
export async function handleDraft(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const resolved = await resolveMaterial(env, args);
  if (!resolved.ok) {
    await replyToOwner(env, resolved.error, fetchImpl);
    return;
  }

  await replyToOwner(env, "🧠 Думаю над черновиком…", fetchImpl);

  let draft: string;
  try {
    draft = await generateDraft(env, resolved.material, VOICE_EXAMPLES);
  } catch (err) {
    console.error("generateDraft failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    await replyToOwner(env, `Не получилось сгенерировать черновик.\n\n${detail}`, fetchImpl);
    return;
  }

  await insertDraft(env, draft, resolved.inboxId);
  await replyToOwner(env, formatDraft(draft), fetchImpl, { parse_mode: "HTML" });

  // Отдельным сообщением, а не внутри черновика: черновик владелец копирует
  // целиком, и предупреждение уехало бы в канал вместе с текстом.
  const warning = echoWarning(draft, VOICE_EXAMPLES);
  if (warning) await replyToOwner(env, warning, fetchImpl);
}
