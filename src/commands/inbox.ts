import type { Env } from "../types";
import { listNewInbox, type InboxItem } from "../lib/db";
import { replyToOwner } from "../lib/telegram";

/** Однострочное превью записи inbox для списка. */
export function formatInboxLine(item: InboxItem): string {
  const preview = (item.text ?? "").replace(/\s+/g, " ").trim();
  const short = preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
  return `#${item.id} 📝 ${short || "(пусто)"}`;
}

/** Собирает текст ответа на /inbox. */
export function renderInboxList(items: InboxItem[]): string {
  if (items.length === 0) {
    return "Inbox пуст. Пришли текстовую заметку — сохраню как сырьё для постов.";
  }
  const lines = items.map(formatInboxLine).join("\n");
  return `Сырьё в inbox (${items.length}):\n\n${lines}\n\nЧерновик: /draft <id>`;
}

/** Обработчик /inbox. */
export async function handleInbox(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const items = await listNewInbox(env);
  await replyToOwner(env, renderInboxList(items), fetchImpl);
}
