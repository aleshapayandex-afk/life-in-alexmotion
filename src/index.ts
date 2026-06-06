import type { Env, TgUpdate } from "./types";
import { isValidWebhookSecret, isOwner, extractMessage } from "./auth";
import { markUpdateProcessed } from "./dedup";
import { handleMessage } from "./router";
import { handleScheduled } from "./cron";
import { replyToOwner } from "./lib/telegram";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health-check.
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("ok", { status: 200 });
    }

    // Принимаем только POST /webhook.
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("not found", { status: 404 });
    }

    // 1. Защита webhook: без валидного secret_token не обрабатываем.
    if (!isValidWebhookSecret(request, env)) {
      return new Response("forbidden", { status: 403 });
    }

    // 2. Парсинг апдейта.
    let update: TgUpdate;
    try {
      update = (await request.json()) as TgUpdate;
    } catch {
      return new Response("bad request", { status: 400 });
    }

    // 3. Только владелец. Чужих молча игнорируем (200, чтобы TG не повторял).
    if (!isOwner(update, env)) {
      console.warn("unauthorized update", { update_id: update.update_id });
      return new Response("ok", { status: 200 });
    }

    const msg = extractMessage(update);
    if (!msg) {
      return new Response("ok", { status: 200 });
    }

    // 4. Идемпотентность: дубль update_id — no-op.
    const isNew = await markUpdateProcessed(env, update.update_id);
    if (!isNew) {
      return new Response("ok", { status: 200 });
    }

    // 5. Отвечаем Telegram мгновенно, тяжёлую работу — в waitUntil.
    //    Дедуп уже зафиксирован (повторов не будет), поэтому при падении
    //    обработчика обязательно уведомляем владельца — иначе команда тихо теряется.
    ctx.waitUntil(
      handleMessage(env, msg).catch(async (err) => {
        console.error("handleMessage failed", err);
        try {
          await replyToOwner(env, "⚠️ Ошибка при обработке команды. Попробуй ещё раз.");
        } catch (notifyErr) {
          console.error("owner notify failed", notifyErr);
        }
      }),
    );

    return new Response("ok", { status: 200 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      handleScheduled(env).catch((err) => {
        console.error("scheduled digest failed", err);
      }),
    );
  },
} satisfies ExportedHandler<Env>;
