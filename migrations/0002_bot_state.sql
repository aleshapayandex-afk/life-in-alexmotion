-- 0002_bot_state.sql — состояние диалога владельца (ожидание ввода для команд)
-- Используется двухшаговыми командами: /draft без аргументов ставит pending='draft',
-- следующее сообщение трактуется как материал (номер inbox или тема).

CREATE TABLE IF NOT EXISTS bot_state (
  owner_id   TEXT PRIMARY KEY,
  pending    TEXT,                          -- например 'draft' или NULL
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
