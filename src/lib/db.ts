import type { Env } from "../types";

export type InboxStatus = "new" | "used" | "archived";

/**
 * Тип записи inbox: сырьё для /draft или уже готовый текст.
 * Смысл колонки задан миграцией 0004 (к удалённой kind из 0001 отношения нет).
 */
export type InboxKind = "raw" | "post";

export interface InboxItem {
  id: number;
  text: string | null;
  kind: InboxKind;
  status: InboxStatus;
  created_at: string;
}

export interface NewInboxInput {
  text: string;
  /** По умолчанию 'raw': всё, что присылает владелец боту, — сырьё. */
  kind?: InboxKind;
}

/** Вставка входящего материала. Возвращает id новой записи. */
export async function insertInbox(env: Env, item: NewInboxInput): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO inbox (text, kind, status) VALUES (?, ?, 'new')`,
  )
    .bind(item.text, item.kind ?? "raw")
    .run();
  return Number(res.meta.last_row_id);
}

/** Список нового сырья (одним запросом, без N+1). */
export async function listNewInbox(env: Env, limit = 50): Promise<InboxItem[]> {
  const res = await env.DB.prepare(
    `SELECT id, text, kind, status, created_at
     FROM inbox WHERE status = 'new' ORDER BY created_at ASC, id ASC LIMIT ?`,
  )
    .bind(limit)
    .all<InboxItem>();
  return res.results ?? [];
}

/** Одна запись inbox по id. */
export async function getInbox(env: Env, id: number): Promise<InboxItem | null> {
  const row = await env.DB.prepare(
    `SELECT id, text, kind, status, created_at FROM inbox WHERE id = ?`,
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

/** Удалить запись inbox. */
export async function deleteInbox(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM inbox WHERE id = ?`).bind(id).run();
}

export interface DraftItem {
  id: number;
  inbox_id: number | null;
  content: string;
  status: string;
  created_at: string;
}

/** Список черновиков, новые сверху. */
export async function listDrafts(env: Env, limit = 50): Promise<DraftItem[]> {
  const res = await env.DB.prepare(
    `SELECT id, inbox_id, content, status, created_at
     FROM drafts ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(limit)
    .all<DraftItem>();
  return res.results ?? [];
}

/** Один черновик по id. */
export async function getDraft(env: Env, id: number): Promise<DraftItem | null> {
  const row = await env.DB.prepare(
    `SELECT id, inbox_id, content, status, created_at FROM drafts WHERE id = ?`,
  )
    .bind(id)
    .first<DraftItem>();
  return row ?? null;
}

/** Удалить черновик. */
export async function deleteDraft(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM drafts WHERE id = ?`).bind(id).run();
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
