import { SIGNATURE } from "./templates";

/** Подпись жирной — для parse_mode: "HTML". */
const SIGNATURE_HTML = `<b>${SIGNATURE}</b>`;

/**
 * Строка-пункт списка: медали или маркеры. Подряд идущие пункты держим
 * вплотную (один перенос), между остальными блоками — пустая строка.
 */
const LIST_RE = /^(?:[-–—•*>]\s|\d+[.)]\s|[🥇🥈🥉🏅🏆])/u;

function isListItem(line: string): boolean {
  return LIST_RE.test(line);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Убирает подпись с конца — добавим её обратно жирной. */
function stripTrailingSignature(text: string): string {
  const t = text.trimEnd();
  return t.endsWith(SIGNATURE) ? t.slice(0, -SIGNATURE.length).trimEnd() : t;
}

/**
 * Рендерит тело: экранирует HTML, заголовок (первая строка) — жирным,
 * между абзацами пустая строка, подряд идущие пункты списка — вплотную.
 */
function renderBody(lines: string[]): string {
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const rendered = i === 0 ? `<b>${escapeHtml(lines[i]!)}</b>` : escapeHtml(lines[i]!);
    out += rendered;
    if (i < lines.length - 1) {
      const tight = isListItem(lines[i]!) && isListItem(lines[i + 1]!);
      out += tight ? "\n" : "\n\n";
    }
  }
  return out;
}

/**
 * Приводит юникодную пунктуацию к тому, что реально пишет автор.
 *
 * Раньше здесь чинились только «–» и «—», и этого не хватало: живой прогон
 * gpt-oss-120b дал в одном черновике десять узких неразрывных пробелов (U+202F)
 * и неразрывный дефис (U+2011). Они невидимы в редакторе и уезжали бы в канал.
 * Поэтому нормализуем классами, а не перечислением найденных символов.
 */
export function normalizeTypography(raw: string): string {
  return raw
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    // дефисы и тире всех видов, включая неразрывный дефис и знак минуса
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    // пробелы всех видов: неразрывный, узкий неразрывный, типографские
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    // Нулевой ширины и BOM — мусор в тексте поста.
    // ВАЖНО: U+200D (ZWJ) здесь быть НЕ должно — это соединитель внутри
    // составных эмодзи. Без него 🏃‍♂️ распадается на бегуна и знак мужского
    // пола по отдельности, а этот эмодзи у автора в рабочем наборе.
    .replace(/[\u200B\u2060\uFEFF]/g, "");
}

/**
 * Готовит черновик к показу в Telegram:
 *  1) нормализация типографики (ё → е, тире → дефис, спецпробелы → обычный);
 *  2) заголовок (первая строка) жирным;
 *  3) пустая строка между абзацами (списки остаются плотными);
 *  4) подпись «Train. Think. Explore.» жирной.
 * Результат отправлять с parse_mode: "HTML".
 */
export function formatDraft(raw: string): string {
  const body = stripTrailingSignature(normalizeTypography(raw)).trim();
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rendered = renderBody(lines);
  return rendered ? `${rendered}\n\n${SIGNATURE_HTML}` : SIGNATURE_HTML;
}
