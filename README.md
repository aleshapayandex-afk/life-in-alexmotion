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
  cron.ts           — недельный дайджест inbox (детерминированный, без модели)
  auth.ts           — secret_token + проверка владельца
  dedup.ts          — идемпотентность по update_id
  router.ts         — разбор команд, маршрутизация сообщений
  inbox-intake.ts   — приём текстовых заметок в inbox
  templates.ts      — подпись, лимиты Telegram, capText (обрезка исходящих)
  draft-format.ts   — нормализация типографики + HTML-рендер черновика
  echo-check.ts     — детектор дословных заимствований из эталонов
  voice.ts          — STYLE_GUIDE: правила стиля, рантайм-копия voice.md
  voice-examples.generated.ts — эталоны из content/posts (npm run gen:voice)
  types.ts          — Env + минимальные типы Telegram
  commands/
    inbox.ts        — /inbox (список сырья и готовых текстов)
    draft.ts        — /draft (генерация черновика)
    idea.ts         — /idea (генерация тем)
  lib/
    telegram.ts     — клиент Bot API (ретраи, таймаут, send*)
    ai.ts           — Workers AI (gpt-oss-120b) — активный провайдер генерации
    claude.ts       — клиент Anthropic (альтернатива, не подключён)
    db.ts           — обёртки D1 (inbox, drafts, bot_state)
scripts/
  gen-voice-examples.mjs — эталоны голоса из content/posts; --check в npm test
migrations/
  0001_init.sql       — posts, inbox, drafts, processed_updates
  0002_bot_state.sql  — bot_state (режим ожидания материала)
  0003_drop_unused.sql— drop posts и медиа-колонок после удаления /publish
  0004_inbox_kind.sql — inbox.kind: 'raw' (сырьё) | 'post' (готовый текст)
test/
  apply-migrations.ts — setup: накатывает migrations/ на тестовую D1
  ...                 — по модулю на файл, запуск: npm test
voice.md            — стиль канала (источник правил для src/voice.ts)
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
