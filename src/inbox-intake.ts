import type { Env, TgMessage } from "./types";
import { insertInbox, type NewInboxInput } from "./lib/db";

/**
 * Превращает не-командное сообщение в запись inbox.
 * Чистая функция (без БД) — удобно тестировать.
 *
 * Приоритет типа: photo > video > document > text.
 * Для фото берём последний (самый крупный) размер из массива.
 * Голосовые/видео-кружочки в MVP не поддерживаем (вернёт null).
 */
export function parseInboxItem(msg: TgMessage): NewInboxInput | null {
  const media_group_id = msg.media_group_id ?? null;

  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1]!;
    return {
      kind: "photo",
      text: msg.caption ?? null,
      file_id: largest.file_id,
      media_group_id,
    };
  }

  if (msg.video) {
    return {
      kind: "video",
      text: msg.caption ?? null,
      file_id: msg.video.file_id,
      media_group_id,
    };
  }

  if (msg.document) {
    return {
      kind: "document",
      text: msg.caption ?? null,
      file_id: msg.document.file_id,
      media_group_id,
    };
  }

  const text = msg.text?.trim();
  if (text) {
    return { kind: "text", text, file_id: null, media_group_id };
  }

  return null;
}

/** Принять материал в inbox. Возвращает id записи или null, если нечего сохранять. */
export async function intakeMessage(env: Env, msg: TgMessage): Promise<number | null> {
  const item = parseInboxItem(msg);
  if (!item) return null;
  return await insertInbox(env, item);
}
