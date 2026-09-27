import type { Env } from "../types";
import { listDrafts, getDraft, type DraftItem } from "../lib/db";
import { replyToOwner } from "../lib/telegram";
import { formatDraft } from "../draft-format";
import { buildConfirmKeyboard } from "../lib/confirm-keyboard";

/** Однострочное превью черновика для списка: id, дата, начало текста. */
function formatDraftLine(item: DraftItem): string {
  const preview = item.content.replace(/\s+/g, " ").trim();
  const short = preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
  const date = item.created_at.slice(0, 16);
  return `#${item.id} (${date}) ${short || "(пусто)"}`;
}

/** Собирает текст ответа на /drafts. */
export function renderDraftsList(items: DraftItem[]): string {
  if (items.length === 0) {
    return "Черновиков нет. Сгенерируй командой /draft.";
  }
  const lines = items.map(formatDraftLine).join("\n");
  return `Черновики (${items.length}):\n\n${lines}\n\n/draft_view <id> — полный текст\n/draft_del <id> — удалить`;
}

/** Разбор аргумента команды: только положительное целое число. */
function parseId(args: string): number | null {
  const arg = args.trim();
  return /^\d+$/.test(arg) ? Number(arg) : null;
}

/** Обработчик /drafts. */
export async function handleDrafts(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const items = await listDrafts(env);
  await replyToOwner(env, renderDraftsList(items), fetchImpl);
}

/** Обработчик /draft_view <id> — полный черновик. */
export async function handleDraftView(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер черновика.", fetchImpl);
    return;
  }
  const item = await getDraft(env, id);
  if (!item) {
    await replyToOwner(env, `Черновик #${id} не найден.`, fetchImpl);
    return;
  }
  await replyToOwner(env, `Черновик #${id}:\n\n${formatDraft(item.content)}`, fetchImpl, {
    parse_mode: "HTML",
  });
}

/** Обработчик /draft_del <id> — показывает черновик и просит подтвердить удаление кнопкой. */
export async function handleDraftDelete(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер черновика.", fetchImpl);
    return;
  }
  const item = await getDraft(env, id);
  if (!item) {
    await replyToOwner(env, `Черновик #${id} не найден.`, fetchImpl);
    return;
  }
  await replyToOwner(env, `Удалить черновик #${id}?\n\n${formatDraft(item.content)}`, fetchImpl, {
    parse_mode: "HTML",
    reply_markup: buildConfirmKeyboard("del_draft", id),
  });
}
