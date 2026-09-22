import type { Env } from "../types";
import { listNewInbox, type InboxItem, type InboxKind } from "../lib/db";
import { replyToOwner } from "../lib/telegram";

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
