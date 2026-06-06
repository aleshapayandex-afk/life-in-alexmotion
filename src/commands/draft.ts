import type { Env } from "../types";
import { getInbox, getRecentPosts, insertDraft } from "../lib/db";
import { generateDraft } from "../lib/claude";
import { replyToOwner } from "../lib/telegram";

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
    return { ok: false, error: "Укажи тему или id из inbox: /draft <id|тема>" };
  }

  if (/^\d+$/.test(arg)) {
    const id = Number(arg);
    const item = await getInbox(env, id);
    if (!item) return { ok: false, error: `Запись #${id} не найдена.` };

    const parts: string[] = [];
    if (item.text) parts.push(item.text);
    if (item.kind !== "text") parts.push(`(прикреплён ${item.kind})`);
    if (parts.length === 0) {
      return { ok: false, error: `В записи #${id} нет текста для черновика.` };
    }
    return { ok: true, material: parts.join("\n"), inboxId: id };
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
    const recent = await getRecentPosts(env, 10);
    draft = await generateDraft(env, resolved.material, recent, fetchImpl);
  } catch (err) {
    console.error("generateDraft failed", err);
    const detail = err instanceof Error ? err.message : String(err);
    await replyToOwner(env, `Не получилось сгенерировать черновик.\n\n${detail}`, fetchImpl);
    return;
  }

  const draftId = await insertDraft(env, draft, resolved.inboxId);
  await replyToOwner(
    env,
    `Черновик #${draftId}:\n\n${draft}\n\n— — —\nОтредактируй и опубликуй: /publish <текст>`,
    fetchImpl,
  );
}
