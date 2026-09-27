import type { Env } from "../types";
import { capText } from "../templates";

const API_BASE = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

/**
 * Единая обёртка над Bot API: таймаут + ретраи с backoff на 429/5xx.
 * `fetchImpl` инъектируется для тестируемости (по умолчанию глобальный fetch).
 */
export async function callTelegram(
  env: Env,
  method: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = `${API_BASE}/bot${env.BOT_TOKEN}/${method}`;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.ok) {
        // HTTP 200 ещё не значит успех: Bot API кладёт ошибку в тело {ok:false,description}.
        const body = (await res.json()) as { ok?: boolean; description?: string };
        if (body.ok === false) {
          throw new TelegramError(
            `Telegram ${method}: ${body.description ?? "ok=false"}`,
            200,
          );
        }
        return body;
      }

      // 429 и 5xx — ретраим; 4xx (кроме 429) — нет смысла.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new TelegramError(`Telegram ${method} ${res.status}`, res.status);
        await backoff(attempt);
        continue;
      }
      throw new TelegramError(`Telegram ${method} ${res.status}`, res.status);
    } catch (err) {
      // Перманентные ошибки (4xx кроме 429, и {ok:false}) не ретраим.
      if (err instanceof TelegramError) throw err;
      // Сетевые ошибки/таймаут — ретраим.
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await backoff(attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new TelegramError(`Telegram ${method} failed`, 0);
}

function backoff(attempt: number): Promise<void> {
  const ms = 200 * 2 ** (attempt - 1); // 200, 400, 800...
  return new Promise((r) => setTimeout(r, ms));
}

/** Ответ Bot API на send* — нам нужен message_id отправленного поста. */
export interface SendResult {
  ok: boolean;
  result?: { message_id: number };
}

function messageId(resp: unknown): number | null {
  const r = resp as SendResult | undefined;
  return r?.result?.message_id ?? null;
}

/**
 * Отправка текстового сообщения. `extra` — доп. поля (например, parse_mode).
 *
 * Текст проходит через capText: всё, что бот отвечает владельцу, идёт сюда,
 * поэтому лимит 4096 проверяется один раз в корне, а не в каждой команде.
 * Публикация в канал (postText) намеренно идёт мимо — пост обрезать нельзя.
 */
export function sendMessage(
  env: Env,
  chatId: string | number,
  text: string,
  fetchImpl: typeof fetch = fetch,
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  return callTelegram(
    env,
    "sendMessage",
    { chat_id: chatId, text: capText(text), ...extra },
    fetchImpl,
  );
}

/** Публикация текстового поста в канал. Возвращает message_id или null. */
export async function postText(
  env: Env,
  chatId: string | number,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const resp = await callTelegram(env, "sendMessage", { chat_id: chatId, text }, fetchImpl);
  return messageId(resp);
}

/** Публикация фото (по file_id) с подписью. */
export async function sendPhoto(
  env: Env,
  chatId: string | number,
  fileId: string,
  caption: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const payload: Record<string, unknown> = { chat_id: chatId, photo: fileId };
  if (caption) payload.caption = caption;
  const resp = await callTelegram(env, "sendPhoto", payload, fetchImpl);
  return messageId(resp);
}

/** Публикация видео (по file_id) с подписью. */
export async function sendVideo(
  env: Env,
  chatId: string | number,
  fileId: string,
  caption: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const payload: Record<string, unknown> = { chat_id: chatId, video: fileId };
  if (caption) payload.caption = caption;
  const resp = await callTelegram(env, "sendVideo", payload, fetchImpl);
  return messageId(resp);
}

/** Публикация документа (по file_id) с подписью. */
export async function sendDocument(
  env: Env,
  chatId: string | number,
  fileId: string,
  caption: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const payload: Record<string, unknown> = { chat_id: chatId, document: fileId };
  if (caption) payload.caption = caption;
  const resp = await callTelegram(env, "sendDocument", payload, fetchImpl);
  return messageId(resp);
}

/** Убирает "часики" на нажатой inline-кнопке; text — необязательный тост. */
export function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const payload: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return callTelegram(env, "answerCallbackQuery", payload, fetchImpl);
}

/** Редактирует текст ранее отправленного сообщения (например, снять клавиатуру). */
export function editMessageText(
  env: Env,
  chatId: string | number,
  messageId: number,
  text: string,
  fetchImpl: typeof fetch = fetch,
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  return callTelegram(
    env,
    "editMessageText",
    { chat_id: chatId, message_id: messageId, text: capText(text), ...extra },
    fetchImpl,
  );
}

/** Ответ владельцу в личку (chat_id == OWNER_USER_ID). */
export function replyToOwner(
  env: Env,
  text: string,
  fetchImpl: typeof fetch = fetch,
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  return sendMessage(env, env.OWNER_USER_ID, text, fetchImpl, extra);
}

/** Регистрирует список команд в Telegram (меню "/" в интерфейсе бота). */
export function setMyCommands(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return callTelegram(
    env,
    "setMyCommands",
    {
      commands: [
        { command: "inbox", description: "Показать накопленное сырьё" },
        { command: "idea", description: "Идеи для постов" },
        { command: "draft", description: "Сгенерировать черновик поста" },
      ],
    },
    fetchImpl,
  );
}
