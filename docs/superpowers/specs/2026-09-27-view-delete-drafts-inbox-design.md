# Просмотр и удаление записей inbox и drafts — дизайн

Дата: 2026-09-27

## Задача

В Telegram-боте владелец должен иметь возможность:
1. Полностью посмотреть любую запись — как сырую заметку в `inbox`, так и
   AI-сгенерированный черновик в `drafts` (сейчас доступны только усечённые
   превью в `/inbox`, а `drafts` вообще не имеет списка/просмотра).
2. Удалить любую такую запись, с подтверждением через inline-кнопки Telegram.

## Область изменений

Две независимые сущности с идентичным по механике набором операций:
- **inbox** (сырые заметки/готовые тексты) — просмотр + удаление добавляются
  к существующему `/inbox`.
- **drafts** (AI-черновики из `/draft`) — полностью новая команда `/drafts`
  (список) + просмотр + удаление.

Подтверждение удаления в обоих случаях — через inline-keyboard
(`callback_query`), которого в проекте сейчас нет вообще (только текстовые
команды и `pending`-режим для двухшаговых команд). Это отдельное расширение
архитектуры бота: новый тип апдейта, новый роутер для колбэков.

## 1. Новый тип апдейта — callback_query

- `types.ts`: добавить `TgCallbackQuery { id: string; from: TgUser; message?: TgMessage; data?: string }`
  и `callback_query?: TgCallbackQuery` в `TgUpdate`.
- `auth.ts`: `isOwner` должен проверять `from.id` из `message` ИЛИ из
  `callback_query`. `extractMessage` не менять; добавить рядом
  `extractCallbackQuery(update): TgCallbackQuery | undefined`.
- `index.ts`: если в апдейте есть `callback_query` — маршрутизировать в новый
  `handleCallbackQuery`, а не в `handleMessage`. Дедуп по `update_id` уже
  общий для всех типов апдейтов, менять не нужно.

## 2. `lib/telegram.ts` — новые функции

- `answerCallbackQuery(env, callbackQueryId, text?, fetchImpl)` — обязателен
  по правилам Bot API (иначе кнопка «крутится» у пользователя бесконечно).
- `editMessageText(env, chatId, messageId, text, extra, fetchImpl)` — после
  нажатия убираем клавиатуру и показываем результат («Удалено» / «Отменено»)
  в том же сообщении, а не шлём новое.
- `sendMessage`/`replyToOwner` уже принимают `extra: Record<string, unknown>`
  — туда просто передаём `reply_markup`, сигнатуру менять не нужно.

## 3. Общий helper клавиатуры подтверждения

Новый файл `src/lib/confirm-keyboard.ts`:

```ts
type DeleteAction = "del_inbox" | "del_draft";

function buildConfirmKeyboard(action: DeleteAction, id: number) {
  return {
    inline_keyboard: [[
      { text: "✅ Удалить", callback_data: `${action}:${id}` },
      { text: "❌ Отмена", callback_data: "cancel" },
    ]],
  };
}
```

`callback_data` ограничен 64 байтами Bot API — с числовым id укладываемся
всегда.

## 4. Команды inbox (`src/commands/inbox.ts`)

- `/inbox` — без изменений, список остаётся как есть.
- `/inbox_view <id>` — полный текст записи (без обрезки на 60 символов,
  общий лимит Telegram обрежет `capText` внутри `replyToOwner`, как везде).
- `/inbox_del <id>` — показывает полный текст записи + вопрос
  «Удалить запись #id из inbox?» с inline-клавиатурой подтверждения.
- `lib/db.ts`: `deleteInbox(env, id): Promise<void>` — `DELETE FROM inbox WHERE id = ?`.

Ошибки: нечисловой/пустой id → «Пришли номер записи»; несуществующий id →
«Запись #<id> не найдена».

## 5. Команды drafts (новый `src/commands/drafts.ts`)

- `/drafts` — список: `#id (2026-09-27 10:15) превью…` (дата — первые 16
  символов `created_at`), сортировка по `created_at DESC` (новые сверху).
- `/draft_view <id>` — полный черновик через существующий `formatDraft()`
  (HTML, тот же рендер, что при генерации), с префиксом `Черновик #<id>:`.
- `/draft_del <id>` — полный черновик + вопрос «Удалить черновик #<id>?» с
  inline-клавиатурой подтверждения.
- `lib/db.ts`: `listDrafts(env, limit=50)`, `getDraft(env, id)`,
  `deleteDraft(env, id)`.

Ошибки — симметрично inbox: нечисловой/пустой id и несуществующий id.

## 6. Обработка нажатия кнопки

Новый файл `src/callback-router.ts`, `handleCallbackQuery(env, cq, fetchImpl)`:

- парсит `cq.data`: `del_inbox:<id>` / `del_draft:<id>` / `cancel`;
- на `del_inbox:<id>` / `del_draft:<id>` — удаляет запись (если она ещё
  существует), `editMessageText` на сообщении с кнопками → «✅ Удалено.»,
  `answerCallbackQuery`;
- на `cancel` — `editMessageText` → «Отменено.», `answerCallbackQuery`;
- если запись уже не найдена (повторное/двойное нажатие) —
  `answerCallbackQuery` с текстом «Уже удалено», без ошибки, но клавиатуру
  всё равно убираем через `editMessageText`.

Никакого `pending`/`bot_state` для этого не используется: состояние решения
живёт в `callback_data` самой кнопки, это проще и надёжнее текстового «да».

## 7. `/start` и `setMyCommands`

Обновить список команд в `setMyCommands` (`lib/telegram.ts`) и текст
подсказки `/start` (`router.ts`): добавить `/drafts`, `/inbox_view`,
`/inbox_del`, `/draft_view`, `/draft_del`.

## Тесты

По одному файлу/расширению существующего файла на модуль (конвенция
проекта — модуль на файл, `npm test`):
- `lib/db.ts` → тесты на `deleteInbox`, `listDrafts`, `getDraft`, `deleteDraft`.
- `lib/telegram.ts` → тесты на `answerCallbackQuery`, `editMessageText`.
- `commands/inbox.ts` → тесты на `/inbox_view`, `/inbox_del`.
- `commands/drafts.ts` (новый) → тесты на `/drafts`, `/draft_view`, `/draft_del`.
- `callback-router.ts` (новый) → тесты на все три ветки `data` + случай «уже удалено».
- `auth.ts` → тест на `isOwner` с `callback_query`.

## Вне скоупа

- Пагинация `/inbox` и `/drafts` при больших объёмах (сейчас `limit=50`,
  как и было).
- Массовое удаление (несколько id за раз).
- Восстановление удалённых записей (undo) — удаление окончательное, без soft-delete.
