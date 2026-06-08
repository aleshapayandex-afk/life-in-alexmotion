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
 * Готовит черновик к показу в Telegram:
 *  1) ё → е (у автора нет ё);
 *  2) заголовок (первая строка) жирным;
 *  3) пустая строка между абзацами (списки остаются плотными);
 *  4) подпись «Train. Think. Explore.» жирной.
 * Результат отправлять с parse_mode: "HTML".
 */
export function formatDraft(raw: string): string {
  const noYo = raw.replace(/ё/g, "е").replace(/Ё/g, "Е");
  const body = stripTrailingSignature(noYo).trim();
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rendered = renderBody(lines);
  return rendered ? `${rendered}\n\n${SIGNATURE_HTML}` : SIGNATURE_HTML;
}
