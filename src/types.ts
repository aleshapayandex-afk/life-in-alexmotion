/** Окружение Worker: биндинги D1, переменные и секреты. */
export interface Env {
  DB: D1Database;

  // Несекретные (из wrangler.toml [vars])
  CHANNEL_ID: string;

  // Секреты (wrangler secret put) / в тестах — из miniflare bindings
  BOT_TOKEN: string;
  CLAUDE_API_KEY: string;
  OWNER_USER_ID: string; // строкой; сравниваем с from.id
  WEBHOOK_SECRET: string;
}

// --- Минимальные типы Telegram, которые реально используем ---

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: string;
}

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgVideo {
  file_id: string;
  file_unique_id: string;
  duration: number;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  video?: TgVideo;
  document?: TgDocument;
  media_group_id?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
  edited_message?: TgMessage;
}
