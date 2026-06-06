import type { Env } from "./types";

/**
 * Идемпотентность обработки апдейтов.
 *
 * Telegram повторяет доставку, если webhook не ответил 200 вовремя.
 * Помечаем update_id как обработанный атомарной вставкой:
 *  - первая вставка успешна  -> это новый апдейт, обрабатываем;
 *  - конфликт по PRIMARY KEY -> дубль, пропускаем.
 *
 * Возвращает true, если апдейт новый (нужно обрабатывать).
 */
export async function markUpdateProcessed(
  env: Env,
  updateId: number,
): Promise<boolean> {
  const res = await env.DB.prepare(
    "INSERT OR IGNORE INTO processed_updates (update_id) VALUES (?)",
  )
    .bind(updateId)
    .run();

  // D1 meta.changes === 1 -> строка вставлена (новый апдейт).
  // === 0 -> запись уже была (дубль).
  return (res.meta?.changes ?? 0) > 0;
}
