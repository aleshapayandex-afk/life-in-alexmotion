import type { Env } from "../types";
import { getInbox, insertPost, markInboxUsed } from "../lib/db";
import {
  postText,
  sendPhoto,
  sendVideo,
  sendDocument,
  replyToOwner,
} from "../lib/telegram";
import { preparePost, SIGNATURE, CAPTION_LIMIT } from "../templates";

/** Публикация литерального текста в канал. */
export async function publishText(
  env: Env,
  rawText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const prepared = preparePost(rawText, false);
  if (!prepared.ok) return { ok: false, message: prepared.error };

  const msgId = await postText(env, env.CHANNEL_ID, prepared.text, fetchImpl);
  await insertPost(env, {
    content: prepared.text,
    rubric: null,
    file_id: null,
    channel_msg_id: msgId,
  });
  return { ok: true, message: "Опубликовано ✅" };
}

/** Публикация материала из inbox по id (текст или медиа через file_id). */
export async function publishInboxItem(
  env: Env,
  id: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const item = await getInbox(env, id);
  if (!item) return { ok: false, message: `Запись #${id} не найдена.` };
  if (item.status === "used") {
    return { ok: false, message: `Запись #${id} уже опубликована.` };
  }

  // Текстовая запись — как обычный пост.
  if (item.kind === "text") {
    const prepared = preparePost(item.text ?? "", false);
    if (!prepared.ok) return { ok: false, message: prepared.error };
    const msgId = await postText(env, env.CHANNEL_ID, prepared.text, fetchImpl);
    await insertPost(env, {
      content: prepared.text,
      rubric: item.rubric,
      file_id: null,
      channel_msg_id: msgId,
    });
    await markInboxUsed(env, id);
    return { ok: true, message: "Опубликовано ✅" };
  }

  // Медиа: подпись = текст+подпись, либо только подпись, если текста нет.
  const hasCaptionText = !!item.text && item.text.trim().length > 0;
  let caption: string;
  if (hasCaptionText) {
    const prepared = preparePost(item.text!, true);
    if (!prepared.ok) return { ok: false, message: prepared.error };
    caption = prepared.text;
  } else {
    caption = SIGNATURE; // короче лимита заведомо
  }

  if (caption.length > CAPTION_LIMIT) {
    return { ok: false, message: `Подпись длиннее ${CAPTION_LIMIT} символов.` };
  }

  const fileId = item.file_id!;
  let msgId: number | null = null;
  switch (item.kind) {
    case "photo":
      msgId = await sendPhoto(env, env.CHANNEL_ID, fileId, caption, fetchImpl);
      break;
    case "video":
      msgId = await sendVideo(env, env.CHANNEL_ID, fileId, caption, fetchImpl);
      break;
    case "document":
      msgId = await sendDocument(env, env.CHANNEL_ID, fileId, caption, fetchImpl);
      break;
  }

  await insertPost(env, {
    content: caption,
    rubric: item.rubric,
    file_id: fileId,
    channel_msg_id: msgId,
  });
  await markInboxUsed(env, id);
  return { ok: true, message: "Опубликовано ✅" };
}

/** Обработчик /publish: аргумент - число (id из inbox) или текст. */
export async function handlePublish(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const arg = args.trim();
  if (!arg) {
    await replyToOwner(
      env,
      "Использование:\n/publish <id> — опубликовать материал из inbox\n/publish <текст> — опубликовать текст",
      fetchImpl,
    );
    return;
  }

  const result = /^\d+$/.test(arg)
    ? await publishInboxItem(env, Number(arg), fetchImpl)
    : await publishText(env, arg, fetchImpl);

  await replyToOwner(env, result.message, fetchImpl);
}
