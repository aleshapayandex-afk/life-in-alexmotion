# Life in AlexMotion — Telegram-бот канала

Cloudflare Worker + D1. Приём материалов (inbox), AI-черновики постов, публикация в канал.
Стек: TypeScript, Wrangler, Vitest. Стиль постов — в `voice.md`.

Слоган: **Train. Think. Explore.**

## Статус

- ✅ **Фаза 0** — контент-фундамент (`voice.md`, `content/posts/`)
- ✅ **Фаза 1** — каркас Worker: webhook + auth (secret_token + user_id) + дедуп + D1
- ✅ **Фаза 2** — inbox (приём текста/фото/видео) + `/inbox` + `/publish`
- ✅ **Фаза 3** — Draft Agent: `/draft` (генерация + voice.md)
- ✅ **Фаза 4** — Cron-дайджест (недельный) + `/idea` (генерация тем)

**MVP задеплоен и работает.** Команды: `/start`, `/inbox`, `/idea`, `/draft`, `/publish`.
Генерация — на **Workers AI** (Llama 3.3 70B, бесплатно). Claude (`lib/claude.ts`)
оставлен как альтернатива для топ-качества: переключается импортом в `commands/draft.ts`
и `commands/idea.ts` + секрет `CLAUDE_API_KEY`.

План: `../thoughts/shared/specs/2026-06-04-life-in-alexmotion-plan.md`

## Структура

```
src/
  index.ts          — точка входа: fetch() (webhook) + scheduled() (cron)
  cron.ts           — недельный дайджест inbox (детерминированный, без Claude)
  auth.ts           — secret_token + проверка владельца
  dedup.ts          — идемпотентность по update_id
  router.ts         — разбор команд, маршрутизация сообщений
  inbox-intake.ts   — приём текста/фото/видео в inbox (file_id)
  templates.ts      — подпись + валидация поста (лимиты 4096/1024)
  voice.ts          — STYLE_GUIDE: рантайм-копия voice.md для Claude
  types.ts          — Env + минимальные типы Telegram
  commands/
    inbox.ts        — /inbox (список сырья)
    publish.ts      — /publish (текст или inbox-id в канал)
    draft.ts        — /draft (генерация черновика через Claude)
    idea.ts         — /idea (генерация тем через Claude)
  lib/
    telegram.ts     — клиент Bot API (ретраи, таймаут, send*)
    ai.ts           — Workers AI (Llama 3.3 70B) — активный провайдер генерации
    claude.ts       — клиент Anthropic (альтернатива, не подключён; для топ-качества)
    db.ts           — обёртки D1 (inbox, posts, drafts)
migrations/
  0001_init.sql     — posts, inbox, drafts, processed_updates
test/
  auth.test.ts      — сценарии 3,4
  dedup.test.ts     — сценарий 1
  inbox.test.ts     — сценарий 7
  publish.test.ts   — сценарии 6,8
  draft.test.ts     — сценарий 2
  cron.test.ts      — сценарий 5
  idea.test.ts      — контекст идей
voice.md            — стиль канала (источник для src/voice.ts)
content/posts/      — корпус реальных постов канала (источник эталонов голоса)
statejnik/          — «Скилл статей»: конфиг, методология, инструменты
```

## Разработка

```powershell
npm install
npm run typecheck
npm test            # vitest
npm run dev         # локальный Worker
```

## Деплой (по явной команде, не автоматически)

### 1. Создать D1 и применить миграции

```powershell
npx wrangler d1 create alexmotion
# вставить database_id в wrangler.toml
npm run db:migrate:remote
```

### 2. Задать секреты (НЕ в git)

```powershell
npx wrangler secret put BOT_TOKEN        # от @BotFather
npx wrangler secret put OWNER_USER_ID    # свой Telegram id (@userinfobot)
npx wrangler secret put WEBHOOK_SECRET   # случайная строка
npx wrangler secret put CLAUDE_API_KEY   # Anthropic API key (Draft Agent)
```

Проверить `CHANNEL_ID` в `wrangler.toml` (для приватного канала — числовой `-100...`).

### 3. Деплой и регистрация webhook

```powershell
npm run deploy
# зарегистрировать webhook с secret_token:
# https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<worker-url>/webhook&secret_token=<WEBHOOK_SECRET>
```

## Безопасность

- Секреты — только в Cloudflare Secrets / `.dev.vars` (в `.gitignore`), не в репозитории.
- Webhook принимает только запросы с верным `secret_token`.
- Команды и приём материалов — только от `OWNER_USER_ID`.
- В канал ничего не публикуется без явной команды `/publish`.
