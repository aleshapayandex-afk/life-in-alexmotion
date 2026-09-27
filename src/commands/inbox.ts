import type { Env } from "../types";
import { listNewInbox, getInbox, type InboxItem, type InboxKind } from "../lib/db";
import { replyToOwner } from "../lib/telegram";
import { buildConfirmKeyboard } from "../lib/confirm-keyboard";

/** Значок по типу записи: сырьё для черновика или уже готовый текст. */
function kindIcon(kind: InboxKind): string {
  return kind === "post" ? "✅" : "📝";
}

/** Однострочное превью записи inbox для списка. */
export function formatInboxLine(item: InboxItem): string {
  const preview = (item.text ?? "").replace(/\s+/g, " ").trim();
  const short = preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
  return `#${item.id} ${kindIcon(item.kind)} ${short || "(пусто)"}`;
}

/** Собирает текст ответа на /inbox. */
export function renderInboxList(items: InboxItem[]): string {
  if (items.length === 0) {
    return "Inbox пуст. Пришли текстовую заметку — сохраню как сырьё для постов.";
  }
  const lines = items.map(formatInboxLine).join("\n");
  // Легенду показываем, только когда в списке реально есть готовые тексты:
  // на обычном inbox из одних заметок она была бы шумом.
  const legend = items.some((i) => i.kind === "post")
    ? "\n\n📝 сырьё — черновик командой /draft <id>\n✅ готовый текст — публикуй как есть"
    : "\n\nЧерновик: /draft <id>";
  return `Inbox (${items.length}):\n\n${lines}${legend}`;
}

/** Обработчик /inbox. */
export async function handleInbox(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const items = await listNewInbox(env);
  await replyToOwner(env, renderInboxList(items), fetchImpl);
}

/** Разбор аргумента команды: только положительное целое число. */
function parseId(args: string): number | null {
  const arg = args.trim();
  return /^\d+$/.test(arg) ? Number(arg) : null;
}

/** Обработчик /inbox_view <id> — полный текст записи. */
export async function handleInboxView(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер записи.", fetchImpl);
    return;
  }
  const item = await getInbox(env, id);
  if (!item) {
    await replyToOwner(env, `Запись #${id} не найдена.`, fetchImpl);
    return;
  }
  await replyToOwner(env, `#${id}:\n\n${item.text ?? "(пусто)"}`, fetchImpl);
}

/** Обработчик /inbox_del <id> — показывает запись и просит подтвердить удаление кнопкой. */
export async function handleInboxDelete(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер записи.", fetchImpl);
    return;
  }
  const item = await getInbox(env, id);
  if (!item) {
    await replyToOwner(env, `Запись #${id} не найдена.`, fetchImpl);
    return;
  }
  await replyToOwner(
    env,
    `Удалить запись #${id} из inbox?\n\n${item.text ?? "(пусто)"}`,
    fetchImpl,
    { reply_markup: buildConfirmKeyboard("del_inbox", id) },
  );
}
