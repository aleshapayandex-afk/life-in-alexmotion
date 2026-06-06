import type { Env } from "../types";
import { listNewInbox, type InboxItem } from "../lib/db";
import { replyToOwner } from "../lib/telegram";

const KIND_ICON: Record<InboxItem["kind"], string> = {
  text: "📝",
  photo: "🖼️",
  video: "🎬",
  document: "📎",
};

/** Однострочное превью записи inbox для списка. */
export function formatInboxLine(item: InboxItem): string {
  const icon = KIND_ICON[item.kind];
  const preview = (item.text ?? "").replace(/\s+/g, " ").trim();
  const short = preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
  const body = short || (item.file_id ? "(без подписи)" : "(пусто)");
  return `#${item.id} ${icon} ${body}`;
}

/** Собирает текст ответа на /inbox. */
export function renderInboxList(items: InboxItem[]): string {
  if (items.length === 0) {
    return "Inbox пуст. Пришли текст, фото или видео — сохраню как сырьё для постов.";
  }
  const lines = items.map(formatInboxLine).join("\n");
  return `Сырьё в inbox (${items.length}):\n\n${lines}\n\nОпубликовать: /publish <id>`;
}

/** Обработчик /inbox. */
export async function handleInbox(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const items = await listNewInbox(env);
  await replyToOwner(env, renderInboxList(items), fetchImpl);
}
