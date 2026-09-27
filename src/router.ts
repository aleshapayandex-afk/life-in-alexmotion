import type { Env, TgMessage } from "./types";
import { replyToOwner, setMyCommands } from "./lib/telegram";
import { getPending, setPending, clearPending } from "./lib/db";
import { intakeMessage } from "./inbox-intake";
import { handleInbox, handleInboxView, handleInboxDelete } from "./commands/inbox";
import { handleDraft } from "./commands/draft";
import { handleDrafts, handleDraftView, handleDraftDelete } from "./commands/drafts";
import { handleIdea } from "./commands/idea";

/**
 * Команды вида «/cmd <id>», у которых пустой аргумент переводит бота в
 * режим ожидания: следующее сообщение (номер) уходит в тот же обработчик,
 * а не в inbox. Ключ — команда без ведущего «/».
 */
const PENDING_COMMANDS: Record<
  string,
  { prompt: string; handler: (env: Env, args: string, fetchImpl: typeof fetch) => Promise<void> }
> = {
  draft: {
    prompt: "Жду материал для черновика. Пришли отдельным сообщением номер из inbox или тему.",
    handler: handleDraft,
  },
  inbox_view: { prompt: "Пришли номер записи.", handler: handleInboxView },
  inbox_del: { prompt: "Пришли номер записи.", handler: handleInboxDelete },
  draft_view: { prompt: "Пришли номер черновика.", handler: handleDraftView },
  draft_del: { prompt: "Пришли номер черновика.", handler: handleDraftDelete },
};

/** Разбор «/command аргументы» из текста сообщения. */
export function parseCommand(
  text: string | undefined,
): { command: string; args: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.search(/\s/);
  const rawCmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  // Поддержка формата /cmd@botname
  const command = rawCmd.split("@")[0]!.toLowerCase();
  return { command, args };
}

/**
 * Обработка одного авторизованного сообщения владельца.
 * Команды → обработчики; всё остальное (текст/фото/видео) → inbox.
 */
export async function handleMessage(
  env: Env,
  msg: TgMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const parsed = parseCommand(msg.text);

  if (parsed) {
    // Команда без аргумента из PENDING_COMMANDS — переходим в режим ожидания:
    // следующее сообщение (номер) уйдёт в тот же обработчик.
    const pendingKey = parsed.command.slice(1);
    const pendingEntry = PENDING_COMMANDS[pendingKey];
    if (pendingEntry && !parsed.args) {
      await setPending(env, pendingKey);
      await replyToOwner(env, pendingEntry.prompt, fetchImpl);
      return;
    }

    // Любая другая команда отменяет режим ожидания.
    await clearPending(env);

    switch (parsed.command) {
      case "/start":
        await setMyCommands(env, fetchImpl);
        await replyToOwner(
          env,
          "Привет! Это бот канала Life in AlexMotion.\n\n" +
            "Команды:\n" +
            "/inbox — показать накопленное сырьё\n" +
            "/inbox_view <id> — полный текст записи\n" +
            "/inbox_del <id> — удалить запись\n" +
            "/idea — идеи для постов\n" +
            "/draft — сгенерировать черновик (затем пришли номер или тему)\n" +
            "/drafts — список сохранённых черновиков\n" +
            "/draft_view <id> — полный текст черновика\n" +
            "/draft_del <id> — удалить черновик\n\n" +
            "Просто пришли текст — сохраню в inbox.\n\n" +
            "Train. Think. Explore.",
          fetchImpl,
        );
        return;
      case "/inbox":
        await handleInbox(env, fetchImpl);
        return;
      case "/inbox_view":
        await handleInboxView(env, parsed.args, fetchImpl);
        return;
      case "/inbox_del":
        await handleInboxDelete(env, parsed.args, fetchImpl);
        return;
      case "/draft":
        await handleDraft(env, parsed.args, fetchImpl);
        return;
      case "/drafts":
        await handleDrafts(env, fetchImpl);
        return;
      case "/draft_view":
        await handleDraftView(env, parsed.args, fetchImpl);
        return;
      case "/draft_del":
        await handleDraftDelete(env, parsed.args, fetchImpl);
        return;
      case "/idea":
        await handleIdea(env, parsed.args, fetchImpl);
        return;
      default:
        await replyToOwner(env, `Неизвестная команда: ${parsed.command}`, fetchImpl);
        return;
    }
  }

  // Не команда. Если ждём номер/материал для одной из PENDING_COMMANDS —
  // отдаём текст сообщения в её обработчик, а не в inbox.
  const pending = await getPending(env);
  const pendingEntry = pending ? PENDING_COMMANDS[pending] : undefined;
  if (pendingEntry) {
    await clearPending(env);
    await pendingEntry.handler(env, msg.text?.trim() ?? "", fetchImpl);
    return;
  }

  // Иначе — в inbox.
  const id = await intakeMessage(env, msg);
  if (id === null) {
    await replyToOwner(
      env,
      "Принимаю только текстовые заметки. Фото и видео добавляй напрямую в канал.",
      fetchImpl,
    );
    return;
  }
  await replyToOwner(env, `Сохранил в inbox под #${id}. /inbox — список.`, fetchImpl);
}
