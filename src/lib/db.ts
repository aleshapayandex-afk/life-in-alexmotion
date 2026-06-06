import type { Env } from "../types";

export type InboxKind = "text" | "photo" | "video" | "document";
export type InboxStatus = "new" | "used" | "archived";

export interface InboxItem {
  id: number;
  kind: InboxKind;
  text: string | null;
  file_id: string | null;
  media_group_id: string | null;
  rubric: string | null;
  status: InboxStatus;
  created_at: string;
}

export interface NewInboxInput {
  kind: InboxKind;
  text: string | null;
  file_id: string | null;
  media_group_id: string | null;
}

/** Вставка входящего материала. Возвращает id новой записи. */
export async function insertInbox(env: Env, item: NewInboxInput): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO inbox (kind, text, file_id, media_group_id, status)
     VALUES (?, ?, ?, ?, 'new')`,
  )
    .bind(item.kind, item.text, item.file_id, item.media_group_id)
    .run();
  return Number(res.meta.last_row_id);
}

/** Список нового сырья (одним запросом, без N+1). */
export async function listNewInbox(env: Env, limit = 50): Promise<InboxItem[]> {
  const res = await env.DB.prepare(
    `SELECT id, kind, text, file_id, media_group_id, rubric, status, created_at
     FROM inbox WHERE status = 'new' ORDER BY created_at ASC, id ASC LIMIT ?`,
  )
    .bind(limit)
    .all<InboxItem>();
  return res.results ?? [];
}

/** Одна запись inbox по id. */
export async function getInbox(env: Env, id: number): Promise<InboxItem | null> {
  const row = await env.DB.prepare(
    `SELECT id, kind, text, file_id, media_group_id, rubric, status, created_at
     FROM inbox WHERE id = ?`,
  )
    .bind(id)
    .first<InboxItem>();
  return row ?? null;
}

/** Пометить материал использованным. */
export async function markInboxUsed(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE inbox SET status = 'used' WHERE id = ?`).bind(id).run();
}

export interface NewPostInput {
  content: string;
  rubric: string | null;
  file_id: string | null;
  channel_msg_id: number | null;
}

/** Записать опубликованный пост в историю. Возвращает id. */
export async function insertPost(env: Env, post: NewPostInput): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO posts (content, rubric, file_id, channel_msg_id)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(post.content, post.rubric, post.file_id, post.channel_msg_id)
    .run();
  return Number(res.meta.last_row_id);
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

/** Последние N постов (для контекста стиля Draft Agent — Фаза 3). */
export async function getRecentPosts(env: Env, limit = 10): Promise<string[]> {
  const res = await env.DB.prepare(
    `SELECT content FROM posts ORDER BY published_at DESC, id DESC LIMIT ?`,
  )
    .bind(limit)
    .all<{ content: string }>();
  return (res.results ?? []).map((r) => r.content);
}
