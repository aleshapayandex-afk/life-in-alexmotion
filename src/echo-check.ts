/**
 * Детектор дословных заимствований из эталонов голоса.
 *
 * Зачем. Эталоны в системном промпте показывают тон, но модель охотно тащит
 * оттуда готовые формулировки. На живом прогоне gpt-oss-120b перенёс в черновик
 * девять слов подряд из эталона: «формально неплохо, но по ощущениям - один из
 * самых тяжёлых...». Инструкция «не копируй дословно» в промпте есть и не
 * сработала, поэтому проверяем результат кодом.
 *
 * Мы ничего не переписываем автоматически: черновик всё равно идёт владельцу
 * на ревью, ему и решать. Задача детектора - не дать совпадению проскочить
 * незамеченным.
 */

/** Слова в сравнимом виде: регистр, ё и любые дефисы/тире не считаются различием. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[‐-―−-]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** Самая длинная цепочка слов черновика, встречающаяся в эталонах. */
export function findEcho(
  draft: string,
  examples: readonly string[],
  minWords = 5,
): string | null {
  const draftWords = words(draft);
  if (draftWords.length < minWords) return null;

  const haystack = ` ${examples.map((e) => words(e).join(" ")).join(" | ")} `;

  // Сверху вниз: интересует самое длинное совпадение, а не первое попавшееся.
  const maxWords = Math.min(draftWords.length, 15);
  for (let n = maxWords; n >= minWords; n--) {
    for (let i = 0; i + n <= draftWords.length; i++) {
      const phrase = draftWords.slice(i, i + n).join(" ");
      if (haystack.includes(` ${phrase} `)) return phrase;
    }
  }
  return null;
}

/** Готовое предупреждение владельцу или null, если заимствований нет. */
export function echoWarning(
  draft: string,
  examples: readonly string[],
  minWords = 5,
): string | null {
  const echo = findEcho(draft, examples, minWords);
  if (!echo) return null;
  const count = echo.split(" ").length;
  return (
    `⚠️ Совпадение с эталоном, ${count} слов подряд:\n«${echo}»\n\n` +
    `Это фраза из примера в промпте, а не из твоего материала. Перепиши её перед публикацией.`
  );
}
