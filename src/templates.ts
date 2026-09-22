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

/** Хвост, которым помечаем обрезанное сообщение. */
const TRUNCATION_MARK = "\n\n…обрезано";

/**
 * Приводит исходящее сообщение к лимиту Telegram.
 *
 * Зачем. Длинный список inbox, длинный черновик или длинный ответ модели легко
 * перевалят за 4096 символов, и Bot API ответит 400 — сообщение просто не дойдёт.
 * Лучше обрезать с явной пометкой, чем потерять целиком.
 *
 * Режем по переносу строки, если он есть в разумной близости от края, и никогда
 * не рвём HTML-тег пополам: черновики уходят с parse_mode HTML.
 */
export function capText(text: string, limit: number = TEXT_LIMIT): string {
  if (text.length <= limit) return text;

  const room = limit - TRUNCATION_MARK.length;
  let cut = text.lastIndexOf("\n", room);
  if (cut < room / 2) cut = room;

  const lastOpen = text.lastIndexOf("<", cut);
  const lastClose = text.lastIndexOf(">", cut);
  if (lastOpen > lastClose) cut = lastOpen;

  return text.slice(0, cut).trimEnd() + TRUNCATION_MARK;
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
