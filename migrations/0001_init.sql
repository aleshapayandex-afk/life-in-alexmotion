-- 0001_init.sql — начальная схема Life in AlexMotion
-- Таблицы: posts, inbox, drafts, processed_updates

-- Опубликованные посты (история + контекст стиля для Draft Agent)
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content       TEXT NOT NULL,
  rubric        TEXT,                          -- TRAIN | THINK | EXPLORE | LIFE
  file_id       TEXT,                          -- NULL для текстовых
  channel_msg_id INTEGER,                      -- message_id в канале после публикации
  published_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inbox: входящее сырьё (текст/медиа) от автора
CREATE TABLE IF NOT EXISTS inbox (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT NOT NULL,                -- 'text' | 'photo' | 'video' | 'document'
  text           TEXT,                         -- подпись или текст идеи
  file_id        TEXT,                         -- NULL для чистого текста
  media_group_id TEXT,                         -- для альбомов
  rubric         TEXT,                         -- опционально, если распознали
  status         TEXT NOT NULL DEFAULT 'new',  -- 'new' | 'used' | 'archived'
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox (status, created_at);

-- Черновики (между генерацией и публикацией)
CREATE TABLE IF NOT EXISTS drafts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id   INTEGER REFERENCES inbox(id),     -- источник, если из inbox
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',    -- 'draft' | 'approved' | 'published'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Дедуп обработанных Telegram-апдейтов (идемпотентность)
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id    INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
