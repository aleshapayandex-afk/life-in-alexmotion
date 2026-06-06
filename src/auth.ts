import type { Env, TgUpdate, TgMessage } from "./types";

/** Заголовок, которым Telegram подписывает webhook (см. setWebhook secret_token). */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * Проверяет, что запрос пришёл именно от Telegram с нашим secret_token.
 * Секрет передаётся в заголовке поверх TLS; обычного сравнения достаточно
 * для нашей модели угроз.
 */
export function isValidWebhookSecret(request: Request, env: Env): boolean {
  const got = request.headers.get(TELEGRAM_SECRET_HEADER);
  return typeof got === "string" && got === env.WEBHOOK_SECRET;
}

/**
 * Достаёт сообщение из апдейта. Берём только новые сообщения:
 * edited_message игнорируем (правка старого сообщения не должна повторно
 * выполнять команду или плодить дубли в inbox); channel_post не трогаем.
 */
export function extractMessage(update: TgUpdate): TgMessage | undefined {
  return update.message;
}

/**
 * Бот слушается только владельца. Сравниваем from.id с OWNER_USER_ID.
 * Любой другой отправитель (или отсутствие from) — не авторизован.
 */
export function isOwner(update: TgUpdate, env: Env): boolean {
  const msg = extractMessage(update);
  const fromId = msg?.from?.id;
  if (typeof fromId !== "number") return false;
  return String(fromId) === String(env.OWNER_USER_ID);
}
