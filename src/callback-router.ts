import type { Env, TgCallbackQuery } from "./types";
import { getInbox, deleteInbox, getDraft, deleteDraft } from "./lib/db";
import { answerCallbackQuery, editMessageText } from "./lib/telegram";

const NO_KEYBOARD = { reply_markup: { inline_keyboard: [] } };

/**
 * Обработка нажатия inline-кнопки. Решение об удалении хранится прямо в
 * callback_data ("del_inbox:<id>" | "del_draft:<id>" | "cancel") — отдельный
 * pending-режим в bot_state тут не нужен.
 */
export async function handleCallbackQuery(
  env: Env,
  cq: TgCallbackQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const data = cq.data ?? "";
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;

  if (chatId === undefined || messageId === undefined) {
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  if (data === "cancel") {
    await editMessageText(env, chatId, messageId, "Отменено.", fetchImpl, NO_KEYBOARD);
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  const inboxMatch = /^del_inbox:(\d+)$/.exec(data);
  if (inboxMatch) {
    const id = Number(inboxMatch[1]);
    const existing = await getInbox(env, id);
    if (!existing) {
      await editMessageText(env, chatId, messageId, "Уже удалено.", fetchImpl, NO_KEYBOARD);
      await answerCallbackQuery(env, cq.id, "Уже удалено", fetchImpl);
      return;
    }
    await deleteInbox(env, id);
    await editMessageText(
      env,
      chatId,
      messageId,
      `✅ Запись #${id} удалена.`,
      fetchImpl,
      NO_KEYBOARD,
    );
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  const draftMatch = /^del_draft:(\d+)$/.exec(data);
  if (draftMatch) {
    const id = Number(draftMatch[1]);
    const existing = await getDraft(env, id);
    if (!existing) {
      await editMessageText(env, chatId, messageId, "Уже удалено.", fetchImpl, NO_KEYBOARD);
      await answerCallbackQuery(env, cq.id, "Уже удалено", fetchImpl);
      return;
    }
    await deleteDraft(env, id);
    await editMessageText(
      env,
      chatId,
      messageId,
      `✅ Черновик #${id} удалён.`,
      fetchImpl,
      NO_KEYBOARD,
    );
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  // Неизвестный callback_data — просто закрываем "часики" у кнопки.
  await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
}
