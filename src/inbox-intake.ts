import type { Env, TgMessage } from "./types";
import { insertInbox, type NewInboxInput } from "./lib/db";

/**
 * Превращает не-командное текстовое сообщение в запись inbox.
 * Медиа (фото, видео, документы) не принимаются — только текст.
 */
export function parseInboxItem(msg: TgMessage): NewInboxInput | null {
  const text = msg.text?.trim();
  if (text) {
    return { text };
  }
  return null;
}

/** Принять материал в inbox. Возвращает id записи или null, если нечего сохранять. */
export async function intakeMessage(env: Env, msg: TgMessage): Promise<number | null> {
  const item = parseInboxItem(msg);
  if (!item) return null;
  return await insertInbox(env, item);
}
