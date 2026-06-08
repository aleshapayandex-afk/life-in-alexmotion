import type { Env, TgMessage } from "./types";
import { replyToOwner, setMyCommands } from "./lib/telegram";
import { getPending, setPending, clearPending } from "./lib/db";
import { intakeMessage } from "./inbox-intake";
import { handleInbox } from "./commands/inbox";
import { handleDraft } from "./commands/draft";
import { handleIdea } from "./commands/idea";

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
    // /draft без аргументов — переходим в режим ожидания материала.
    // Следующее сообщение (номер inbox или тема) уйдёт в Draft Agent.
    if (parsed.command === "/draft" && !parsed.args) {
      await setPending(env, "draft");
      await replyToOwner(
        env,
        "Жду материал для черновика. Пришли отдельным сообщением номер из inbox или тему.",
        fetchImpl,
      );
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
            "/idea — идеи для постов\n" +
            "/draft — сгенерировать черновик (затем пришли номер или тему)\n\n" +
            "Просто пришли текст — сохраню в inbox.\n\n" +
            "Train. Think. Explore.",
          fetchImpl,
        );
        return;
      case "/inbox":
        await handleInbox(env, fetchImpl);
        return;
      case "/draft":
        await handleDraft(env, parsed.args, fetchImpl);
        return;
      case "/idea":
        await handleIdea(env, parsed.args, fetchImpl);
        return;
      default:
        await replyToOwner(env, `Неизвестная команда: ${parsed.command}`, fetchImpl);
        return;
    }
  }

  // Не команда. Если ждём материал для черновика — отдаём его в Draft Agent.
  const pending = await getPending(env);
  if (pending === "draft") {
    await clearPending(env);
    await handleDraft(env, msg.text?.trim() ?? "", fetchImpl);
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
