import type { Env } from "./types";
import { listNewInbox } from "./lib/db";
import { formatInboxLine } from "./commands/inbox";
import { replyToOwner } from "./lib/telegram";

/**
 * Недельный дайджест. Детерминированный, без Claude:
 * напоминает о накопленном в inbox сырье. Если inbox пуст — ничего не шлёт.
 *
 * Возвращает true, если дайджест был отправлен (для тестов/логов).
 */
export async function handleScheduled(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const items = await listNewInbox(env, 50);
  if (items.length === 0) {
    return false; // нечего напоминать — молчим (сценарий 5)
  }

  const lines = items.map(formatInboxLine).join("\n");
  const text =
    `📬 Недельный дайджест\n\n` +
    `В inbox накопилось материала: ${items.length}\n\n` +
    `${lines}\n\n` +
    `Сделать черновик: /draft <id>\nНужны идеи: /idea`;

  await replyToOwner(env, text, fetchImpl);
  return true;
}
