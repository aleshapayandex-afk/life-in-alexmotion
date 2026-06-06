import type { Env, TgMessage } from "./types";
import { replyToOwner } from "./lib/telegram";
import { intakeMessage } from "./inbox-intake";
import { handleInbox } from "./commands/inbox";
import { handlePublish } from "./commands/publish";
import { handleDraft } from "./commands/draft";

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
    switch (parsed.command) {
      case "/start":
        await replyToOwner(
          env,
          "Привет! Это бот канала Life in AlexMotion.\n\n" +
            "Команды:\n" +
            "/inbox — показать накопленное сырьё\n" +
            "/draft <id|тема> — сгенерировать черновик\n" +
            "/publish <id|текст> — опубликовать в канал\n\n" +
            "Просто пришли текст, фото или видео — сохраню в inbox.\n\n" +
            "Train. Think. Explore.",
          fetchImpl,
        );
        return;
      case "/inbox":
        await handleInbox(env, fetchImpl);
        return;
      case "/publish":
        await handlePublish(env, parsed.args, fetchImpl);
        return;
      case "/draft":
        await handleDraft(env, parsed.args, fetchImpl);
        return;
      case "/idea":
        await replyToOwner(
          env,
          `Команда ${parsed.command} появится в Фазе 4.`,
          fetchImpl,
        );
        return;
      default:
        await replyToOwner(env, `Неизвестная команда: ${parsed.command}`, fetchImpl);
        return;
    }
  }

  // Не команда — в inbox.
  const id = await intakeMessage(env, msg);
  if (id === null) {
    await replyToOwner(
      env,
      "Не понял материал. Пришли текст, фото, видео или документ.",
      fetchImpl,
    );
    return;
  }
  await replyToOwner(env, `Сохранил в inbox под #${id}. /inbox — список.`, fetchImpl);
}
