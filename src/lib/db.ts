import type { Env } from "../types";

export type InboxStatus = "new" | "used" | "archived";

export interface InboxItem {
  id: number;
  text: string | null;
  status: InboxStatus;
  created_at: string;
}

export interface NewInboxInput {
  text: string;
}

/** Вставка входящего материала. Возвращает id новой записи. */
export async function insertInbox(env: Env, item: NewInboxInput): Promise<number> {
  const res = await env.DB.prepare(`INSERT INTO inbox (text, status) VALUES (?, 'new')`)
    .bind(item.text)
    .run();
  return Number(res.meta.last_row_id);
}

/** Список нового сырья (одним запросом, без N+1). */
export async function listNewInbox(env: Env, limit = 50): Promise<InboxItem[]> {
  const res = await env.DB.prepare(
    `SELECT id, text, status, created_at
     FROM inbox WHERE status = 'new' ORDER BY created_at ASC, id ASC LIMIT ?`,
  )
    .bind(limit)
    .all<InboxItem>();
  return res.results ?? [];
}

/** Одна запись inbox по id. */
export async function getInbox(env: Env, id: number): Promise<InboxItem | null> {
  const row = await env.DB.prepare(
    `SELECT id, text, status, created_at FROM inbox WHERE id = ?`,
  )
    .bind(id)
    .first<InboxItem>();
  return row ?? null;
}

/** Пометить материал использованным. */
export async function markInboxUsed(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE inbox SET status = 'used' WHERE id = ?`).bind(id).run();
}

/** Сохранить черновик. Возвращает id. */
export async function insertDraft(
  env: Env,
  content: string,
  inboxId: number | null,
): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO drafts (inbox_id, content, status) VALUES (?, ?, 'draft')`,
  )
    .bind(inboxId, content)
    .run();
  return Number(res.meta.last_row_id);
}

// --- Состояние диалога владельца (двухшаговые команды) ---

/** Текущее отложенное действие владельца (например, 'draft') или null. */
export async function getPending(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT pending FROM bot_state WHERE owner_id = ?`)
    .bind(env.OWNER_USER_ID)
    .first<{ pending: string | null }>();
  return row?.pending ?? null;
}

/** Поставить отложенное действие: следующее сообщение пойдёт в этот обработчик. */
export async function setPending(env: Env, action: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO bot_state (owner_id, pending, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(owner_id) DO UPDATE SET pending = excluded.pending, updated_at = excluded.updated_at`,
  )
    .bind(env.OWNER_USER_ID, action)
    .run();
}

/** Сбросить отложенное действие. */
export async function clearPending(env: Env): Promise<void> {
  await env.DB.prepare(`UPDATE bot_state SET pending = NULL WHERE owner_id = ?`)
    .bind(env.OWNER_USER_ID)
    .run();
}
