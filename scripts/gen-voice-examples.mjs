#!/usr/bin/env node
/**
 * Генератор эталонов голоса для системного промпта Draft Agent.
 *
 * Зачем. Раньше эталонные посты жили копиями внутри STYLE_GUIDE (src/voice.ts)
 * и расходились с реальными постами канала молча. Теперь единственный источник
 * правды — корпус content/posts/, а этот скрипт собирает из него константу,
 * которую вшивает в бандл сборщик Worker.
 *
 * Worker не читает .md как файл, поэтому эталоны попадают в код кодогенерацией,
 * а не импортом: так одинаково работают и wrangler (esbuild), и vitest (vite),
 * и ничего не зависит от совпадения настроек двух сборщиков.
 *
 * Использование:
 *   node scripts/gen-voice-examples.mjs           — перегенерировать файл
 *   node scripts/gen-voice-examples.mjs --check   — проверить, что файл актуален
 *
 * Коды выхода: 0 — всё сходится; 1 — файл устарел или исходник не найден.
 *
 * ПРАВИЛО ОТБОРА: четыре эталона, по одному на рубрику канала. Весь корпус
 * в промпт НЕ идёт: четыре чётких образца работают лучше тридцати четырёх
 * средних, а каждый лишний пост — это контекст в каждом запросе к модели.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "content", "posts");
const OUT = join(ROOT, "src", "voice-examples.generated.ts");

/** Отбор эталонов. Подпись объясняет модели, что именно демонстрирует пример. */
const EXAMPLES = [
  { file: "30_saqqararun.md", note: "Рубленый, честный репортаж (TRAIN)" },
  { file: "29_anonsbota.md", note: "Инженерный разбор своей системы (THINK)" },
  { file: "34_luxor.md", note: "Плавный, бытовой (EXPLORE)" },
  { file: "24_prognozchm.md", note: "Итог с благодарностью и списком результатов (LIFE)" },
];

function readPost(file) {
  try {
    return readFileSync(join(CORPUS, file), "utf8").trim();
  } catch {
    console.error(
      `не найден эталон content/posts/${file}\n` +
        `Файл переименовали или удалили? Поправь список EXAMPLES в этом скрипте.`,
    );
    process.exit(1);
  }
}

/**
 * Линт корпуса: тире любого вида и «ё» запрещены правилами канала (voice.md).
 *
 * Проверяем ВСЮ папку, а не только четыре отобранных файла: корпус кормит
 * и промпт бота, и тон-матчинг «Скилла статей». Один пост с «ё», вставленный
 * из чужого источника, тихо учит обоих нарушать правило - ровно так в корпус
 * когда-то попали 10 «ё» вместе с текстами из старого content/real-posts.md.
 */
function lintCorpus() {
  const problems = [];
  for (const file of readdirSync(CORPUS).filter((f) => f.endsWith(".md")).sort()) {
    const text = readFileSync(join(CORPUS, file), "utf8");
    const dashes = (text.match(/[\u2010-\u2015\u2212]/g) ?? []).length;
    const yo = (text.match(/[ёЁ]/g) ?? []).length;
    if (dashes || yo) {
      const what = [dashes && `тире: ${dashes}`, yo && `«ё»: ${yo}`].filter(Boolean).join(", ");
      problems.push(`  content/posts/${file} — ${what}`);
    }
  }
  if (problems.length) {
    console.error(
      "корпус нарушает правила voice.md (только дефис, только «е»):\n" +
        problems.join("\n") +
        "\nПочини файлы: тире → дефис с пробелами, «ё» → «е».",
    );
    process.exit(1);
  }
}

function render() {
  // JSON.stringify, а не шаблонные строки: в постах встречаются обратные
  // кавычки и знак доллара, на шаблонной строке это сломало бы TypeScript.
  const entries = EXAMPLES.map(({ file, note }) => {
    const text = readPost(file);
    return `  // content/posts/${file}\n  ${JSON.stringify(`${note}:\n«${text}»`)},`;
  }).join("\n");

  return `// СГЕНЕРИРОВАНО: node scripts/gen-voice-examples.mjs
// Не править руками — правки затрёт следующая генерация.
// Источник: content/posts/ (отбор — в шапке скрипта).

/** Эталоны голоса для системного промпта. По одному на рубрику канала. */
export const VOICE_EXAMPLES: readonly string[] = [
${entries}
];
`;
}

lintCorpus();

const want = render();
const check = process.argv.includes("--check");

if (check) {
  let have = null;
  try {
    have = readFileSync(OUT, "utf8");
  } catch {
    console.error("нет src/voice-examples.generated.ts — прогони: npm run gen:voice");
    process.exit(1);
  }
  if (have !== want) {
    console.error(
      "src/voice-examples.generated.ts разошёлся с content/posts/.\n" +
        "Корпус поправили, а эталоны не перегенерировали. Почини: npm run gen:voice",
    );
    process.exit(1);
  }
  console.log(`эталоны актуальны (${EXAMPLES.length} шт. из content/posts/)`);
} else {
  writeFileSync(OUT, want, "utf8");
  console.log(`src/voice-examples.generated.ts обновлён (${EXAMPLES.length} эталона)`);
}
