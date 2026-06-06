/** Подпись канала. Ровно три слова, без разделителей и @username (см. voice.md). */
export const SIGNATURE = "Train. Think. Explore.";

// Лимиты Telegram.
export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

/** Добавляет подпись, если её ещё нет в конце. */
export function ensureSignature(text: string): string {
  const trimmed = text.trimEnd();
  if (trimmed.endsWith(SIGNATURE)) return trimmed;
  return `${trimmed}\n\n${SIGNATURE}`;
}

export type ValidationResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Готовит и валидирует текст поста.
 * @param hasMedia true — текст пойдёт подписью к медиа (лимит 1024), иначе обычное сообщение (4096).
 */
export function preparePost(rawText: string, hasMedia: boolean): ValidationResult {
  const body = rawText.trim();
  if (!body) {
    return { ok: false, error: "Пустой пост — нечего публиковать." };
  }

  const withSig = ensureSignature(body);
  const limit = hasMedia ? CAPTION_LIMIT : TEXT_LIMIT;

  if (withSig.length > limit) {
    const kind = hasMedia ? "подписи к медиа" : "поста";
    return {
      ok: false,
      error: `Слишком длинно для ${kind}: ${withSig.length}/${limit} символов.`,
    };
  }

  return { ok: true, text: withSig };
}
