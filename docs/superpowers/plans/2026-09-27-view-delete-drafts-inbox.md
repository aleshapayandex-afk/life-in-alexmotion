# Просмотр и удаление записей inbox/drafts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать владельцу бота в Telegram полностью просматривать и удалять (с подтверждением через inline-кнопки) любую запись из `inbox` и из `drafts`.

**Architecture:** Добавляем поддержку `callback_query` (новый тип Telegram-апдейта) как отдельный маршрут рядом с существующим `message`-роутером. Подтверждение удаления не использует текстовый `pending`-режим (как `/draft`), а хранит решение прямо в `callback_data` кнопки — новый файл `callback-router.ts` его разбирает. Команды `/inbox_view`, `/inbox_del` добавляются в существующий `commands/inbox.ts`; команды `/drafts`, `/draft_view`, `/draft_del` — в новый `commands/drafts.ts` (по аналогии с `commands/inbox.ts`).

**Tech Stack:** TypeScript, Cloudflare Workers + D1, Vitest (`@cloudflare/vitest-pool-workers`), Telegram Bot API.

## Global Constraints

- Схему БД не менять — новая миграция не нужна, используются существующие таблицы `inbox` и `drafts`.
- Все новые функции, которые ходят в Telegram, принимают `fetchImpl: typeof fetch = fetch` последним/предпоследним параметром — единый DI-паттерн проекта (см. `lib/telegram.ts`, `commands/draft.ts`).
- `callback_data` ограничен Bot API 64 байтами — формат `del_inbox:<id>` / `del_draft:<id>` / `cancel` всегда укладывается.
- Один тестовый файл на новый модуль/концерн (конвенция `test/`: `draft.test.ts`, `idea.test.ts`, `cron.test.ts` и т.д.).
- Тесты гоняются на реальной схеме через `cloudflare:test` + `test/apply-migrations.ts`, мокается только `fetch` (см. `mockFetch()` в `test/cron.test.ts`).
- Комментарии в коде — только там, где не очевидно «почему» (см. существующий стиль `lib/db.ts`, `draft-format.ts`); не описывать «что» делает код.
- Коммиты — по-русски, один коммит = одна логическая правка.
- Запуск тестов: `npm test` (или `npx vitest run <file>` для одного файла). Тайпчек: `npm run typecheck`.

---

### Task 1: DB-слой — удаление inbox и работа с drafts

**Files:**
- Modify: `src/lib/db.ts`
- Test: `test/db-manage.test.ts` (создать)

**Interfaces:**
- Consumes: существующие `insertInbox(env, {text}): Promise<number>`, `insertDraft(env, content, inboxId): Promise<number>`.
- Produces:
  - `deleteInbox(env: Env, id: number): Promise<void>`
  - `export interface DraftItem { id: number; inbox_id: number | null; content: string; status: string; created_at: string }`
  - `listDrafts(env: Env, limit = 50): Promise<DraftItem[]>`
  - `getDraft(env: Env, id: number): Promise<DraftItem | null>`
  - `deleteDraft(env: Env, id: number): Promise<void>`

- [ ] **Step 1: Написать падающий тест**

Создать `test/db-manage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  insertInbox,
  deleteInbox,
  getInbox,
  insertDraft,
  listDrafts,
  getDraft,
  deleteDraft,
} from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
  await testEnv.DB.exec("DELETE FROM drafts;");
});

describe("deleteInbox", () => {
  it("удаляет запись — getInbox после этого возвращает null", async () => {
    const id = await insertInbox(testEnv, { text: "заметка" });
    await deleteInbox(testEnv, id);
    expect(await getInbox(testEnv, id)).toBeNull();
  });
});

describe("listDrafts / getDraft / deleteDraft", () => {
  it("listDrafts возвращает вставленные черновики, новые сверху", async () => {
    const id1 = await insertDraft(testEnv, "черновик 1", null);
    const id2 = await insertDraft(testEnv, "черновик 2", null);
    const list = await listDrafts(testEnv);
    const ids = list.map((d) => d.id);
    expect(ids.indexOf(id2)).toBeLessThan(ids.indexOf(id1));
  });

  it("getDraft читает содержимое по id", async () => {
    const id = await insertDraft(testEnv, "текст черновика", null);
    const item = await getDraft(testEnv, id);
    expect(item?.content).toBe("текст черновика");
  });

  it("getDraft возвращает null для несуществующего id", async () => {
    expect(await getDraft(testEnv, 999999)).toBeNull();
  });

  it("deleteDraft удаляет запись", async () => {
    const id = await insertDraft(testEnv, "удали меня", null);
    await deleteDraft(testEnv, id);
    expect(await getDraft(testEnv, id)).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/db-manage.test.ts`
Expected: FAIL — `deleteInbox`, `listDrafts`, `getDraft`, `deleteDraft` не существуют (ошибка импорта).

- [ ] **Step 3: Реализовать функции**

В `src/lib/db.ts` добавить после `insertDraft` (после строки 73):

```ts
/** Удалить запись inbox. */
export async function deleteInbox(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM inbox WHERE id = ?`).bind(id).run();
}

export interface DraftItem {
  id: number;
  inbox_id: number | null;
  content: string;
  status: string;
  created_at: string;
}

/** Список черновиков, новые сверху. */
export async function listDrafts(env: Env, limit = 50): Promise<DraftItem[]> {
  const res = await env.DB.prepare(
    `SELECT id, inbox_id, content, status, created_at
     FROM drafts ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(limit)
    .all<DraftItem>();
  return res.results ?? [];
}

/** Один черновик по id. */
export async function getDraft(env: Env, id: number): Promise<DraftItem | null> {
  const row = await env.DB.prepare(
    `SELECT id, inbox_id, content, status, created_at FROM drafts WHERE id = ?`,
  )
    .bind(id)
    .first<DraftItem>();
  return row ?? null;
}

/** Удалить черновик. */
export async function deleteDraft(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM drafts WHERE id = ?`).bind(id).run();
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/db-manage.test.ts`
Expected: PASS (5 тестов)

- [ ] **Step 5: Коммит**

```bash
git add src/lib/db.ts test/db-manage.test.ts
git commit -m "Добавить удаление inbox и CRUD-чтение/удаление для drafts"
```

---

### Task 2: Клавиатура подтверждения удаления

**Files:**
- Create: `src/lib/confirm-keyboard.ts`
- Test: `test/confirm-keyboard.test.ts`

**Interfaces:**
- Consumes: ничего (чистая функция).
- Produces:
  - `export type DeleteAction = "del_inbox" | "del_draft"`
  - `export function buildConfirmKeyboard(action: DeleteAction, id: number): { inline_keyboard: { text: string; callback_data: string }[][] }`

- [ ] **Step 1: Написать падающий тест**

Создать `test/confirm-keyboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildConfirmKeyboard } from "../src/lib/confirm-keyboard";

describe("buildConfirmKeyboard", () => {
  it("del_draft: кнопка удаления содержит callback_data del_draft:<id>", () => {
    const kb = buildConfirmKeyboard("del_draft", 42);
    const [del, cancel] = kb.inline_keyboard[0]!;
    expect(del!.callback_data).toBe("del_draft:42");
    expect(cancel!.callback_data).toBe("cancel");
  });

  it("del_inbox: callback_data del_inbox:<id>", () => {
    const kb = buildConfirmKeyboard("del_inbox", 7);
    expect(kb.inline_keyboard[0]![0]!.callback_data).toBe("del_inbox:7");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/confirm-keyboard.test.ts`
Expected: FAIL — модуль `../src/lib/confirm-keyboard` не найден.

- [ ] **Step 3: Реализовать**

Создать `src/lib/confirm-keyboard.ts`:

```ts
export type DeleteAction = "del_inbox" | "del_draft";

/** Inline-клавиатура «Удалить / Отмена» для подтверждения удаления записи. */
export function buildConfirmKeyboard(
  action: DeleteAction,
  id: number,
): { inline_keyboard: { text: string; callback_data: string }[][] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ Удалить", callback_data: `${action}:${id}` },
        { text: "❌ Отмена", callback_data: "cancel" },
      ],
    ],
  };
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/confirm-keyboard.test.ts`
Expected: PASS (2 теста)

- [ ] **Step 5: Коммит**

```bash
git add src/lib/confirm-keyboard.ts test/confirm-keyboard.test.ts
git commit -m "Добавить inline-клавиатуру подтверждения удаления"
```

---

### Task 3: Telegram-клиент — answerCallbackQuery и editMessageText

**Files:**
- Modify: `src/lib/telegram.ts`
- Test: `test/telegram.test.ts` (создать)

**Interfaces:**
- Consumes: `callTelegram(env, method, payload, fetchImpl)` — уже существует в этом же файле.
- Produces:
  - `answerCallbackQuery(env: Env, callbackQueryId: string, text?: string, fetchImpl?: typeof fetch): Promise<unknown>`
  - `editMessageText(env: Env, chatId: string | number, messageId: number, text: string, fetchImpl?: typeof fetch, extra?: Record<string, unknown>): Promise<unknown>`

- [ ] **Step 1: Написать падающий тест**

Создать `test/telegram.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { answerCallbackQuery, editMessageText } from "../src/lib/telegram";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

function mockFetch() {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("answerCallbackQuery", () => {
  it("шлёт callback_query_id и текст, если он передан", async () => {
    const { fn, calls } = mockFetch();
    await answerCallbackQuery(testEnv, "cbq-1", "Уже удалено", fn);
    expect(calls[0]!.url).toContain("/answerCallbackQuery");
    expect(calls[0]!.body.callback_query_id).toBe("cbq-1");
    expect(calls[0]!.body.text).toBe("Уже удалено");
  });

  it("без текста поле text не отправляется", async () => {
    const { fn, calls } = mockFetch();
    await answerCallbackQuery(testEnv, "cbq-2", undefined, fn);
    expect(calls[0]!.body.text).toBeUndefined();
  });
});

describe("editMessageText", () => {
  it("шлёт chat_id, message_id, текст и доп. поля (reply_markup)", async () => {
    const { fn, calls } = mockFetch();
    await editMessageText(testEnv, 111, 22, "Отменено.", fn, {
      reply_markup: { inline_keyboard: [] },
    });
    expect(calls[0]!.url).toContain("/editMessageText");
    expect(calls[0]!.body.chat_id).toBe(111);
    expect(calls[0]!.body.message_id).toBe(22);
    expect(calls[0]!.body.text).toBe("Отменено.");
    expect(calls[0]!.body.reply_markup).toEqual({ inline_keyboard: [] });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/telegram.test.ts`
Expected: FAIL — `answerCallbackQuery`/`editMessageText` не экспортируются.

- [ ] **Step 3: Реализовать**

В `src/lib/telegram.ts` добавить после `sendDocument` (после строки 166):

```ts
/** Убирает "часики" на нажатой inline-кнопке; text — необязательный тост. */
export function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const payload: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return callTelegram(env, "answerCallbackQuery", payload, fetchImpl);
}

/** Редактирует текст ранее отправленного сообщения (например, снять клавиатуру). */
export function editMessageText(
  env: Env,
  chatId: string | number,
  messageId: number,
  text: string,
  fetchImpl: typeof fetch = fetch,
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  return callTelegram(
    env,
    "editMessageText",
    { chat_id: chatId, message_id: messageId, text: capText(text), ...extra },
    fetchImpl,
  );
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/telegram.test.ts`
Expected: PASS (3 теста)

- [ ] **Step 5: Коммит**

```bash
git add src/lib/telegram.ts test/telegram.test.ts
git commit -m "Добавить answerCallbackQuery и editMessageText в Telegram-клиент"
```

---

### Task 4: Поддержка callback_query в типах и авторизации

**Files:**
- Modify: `src/types.ts`
- Modify: `src/auth.ts`
- Test: `test/auth.test.ts` (дополнить)

**Interfaces:**
- Consumes: `TgUser`, `TgMessage`, `TgUpdate` (уже определены в `types.ts`).
- Produces:
  - `export interface TgCallbackQuery { id: string; from: TgUser; message?: TgMessage; data?: string }`
  - `TgUpdate.callback_query?: TgCallbackQuery`
  - `export function extractCallbackQuery(update: TgUpdate): TgCallbackQuery | undefined`
  - `isOwner(update: TgUpdate, env: Env): boolean` — теперь проверяет `from.id` и из `message`, и из `callback_query` (сигнатура не меняется).

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `test/auth.test.ts` (после существующего `describe("проверка владельца...")`, перед закрывающей структурой файла — просто новый блок в конце файла):

```ts
describe("проверка владельца — callback_query", () => {
  it("пропускает владельца по callback_query.from.id", () => {
    const ownerId = Number(testEnv.OWNER_USER_ID);
    const update: TgUpdate = {
      update_id: 3,
      callback_query: {
        id: "cbq-1",
        from: { id: ownerId, is_bot: false },
        data: "cancel",
      },
    };
    expect(isOwner(update, testEnv)).toBe(true);
  });

  it("отклоняет чужого в callback_query", () => {
    const update: TgUpdate = {
      update_id: 4,
      callback_query: { id: "cbq-2", from: { id: 999999999, is_bot: false }, data: "cancel" },
    };
    expect(isOwner(update, testEnv)).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL — TypeScript ошибка: `callback_query` не существует в типе `TgUpdate`.

- [ ] **Step 3: Реализовать**

В `src/types.ts` добавить перед `export interface TgUpdate` (перед строкой 74):

```ts
export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

```

И изменить `TgUpdate` (строки 74-79), добавив поле:

```ts
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
```

В `src/auth.ts` добавить после `extractMessage` (после строки 23):

```ts
/** Достаёт callback_query из апдейта (нажатие inline-кнопки). */
export function extractCallbackQuery(update: TgUpdate): TgCallbackQuery | undefined {
  return update.callback_query;
}
```

И заменить `isOwner` (строки 29-34) на:

```ts
/**
 * Бот слушается только владельца. Сравниваем from.id с OWNER_USER_ID.
 * from берём из message ИЛИ из callback_query — апдейт содержит один из них.
 */
export function isOwner(update: TgUpdate, env: Env): boolean {
  const fromId = extractMessage(update)?.from?.id ?? extractCallbackQuery(update)?.from?.id;
  if (typeof fromId !== "number") return false;
  return String(fromId) === String(env.OWNER_USER_ID);
}
```

Обновить импорт типа в начале `src/auth.ts` (строка 1):

```ts
import type { Env, TgUpdate, TgMessage, TgCallbackQuery } from "./types";
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/auth.test.ts`
Expected: PASS (все тесты файла, включая новые 2)

- [ ] **Step 5: Коммит**

```bash
git add src/types.ts src/auth.ts test/auth.test.ts
git commit -m "Поддержать callback_query в типах и проверке владельца"
```

---

### Task 5: /inbox_view и /inbox_del

**Files:**
- Modify: `src/commands/inbox.ts`
- Test: `test/inbox-manage.test.ts` (создать)

**Interfaces:**
- Consumes: `getInbox(env, id): Promise<InboxItem | null>`, `deleteInbox(env, id): Promise<void>` (Task 1), `buildConfirmKeyboard("del_inbox", id)` (Task 2), `replyToOwner(env, text, fetchImpl, extra?)` (существует).
- Produces:
  - `export async function handleInboxView(env: Env, args: string, fetchImpl?: typeof fetch): Promise<void>`
  - `export async function handleInboxDelete(env: Env, args: string, fetchImpl?: typeof fetch): Promise<void>`

- [ ] **Step 1: Написать падающий тест**

Создать `test/inbox-manage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleInboxView, handleInboxDelete } from "../src/commands/inbox";
import { insertInbox, getInbox } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
});

function mockFetch() {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("handleInboxView", () => {
  it("показывает полный текст записи", async () => {
    const id = await insertInbox(testEnv, { text: "длинная заметка про горы и бег" });
    const { fn, calls } = mockFetch();
    await handleInboxView(testEnv, String(id), fn);
    expect(String(calls[0]!.body.text)).toContain("длинная заметка про горы и бег");
  });

  it("несуществующий id → «не найдена»", async () => {
    const { fn, calls } = mockFetch();
    await handleInboxView(testEnv, "999999", fn);
    expect(String(calls[0]!.body.text)).toContain("не найдена");
  });

  it("нечисловой аргумент → просьба прислать номер", async () => {
    const { fn, calls } = mockFetch();
    await handleInboxView(testEnv, "abc", fn);
    expect(String(calls[0]!.body.text)).toContain("номер");
  });
});

describe("handleInboxDelete", () => {
  it("показывает текст и клавиатуру подтверждения, запись НЕ удаляется сразу", async () => {
    const id = await insertInbox(testEnv, { text: "удали меня" });
    const { fn, calls } = mockFetch();
    await handleInboxDelete(testEnv, String(id), fn);

    expect(String(calls[0]!.body.text)).toContain("удали меня");
    expect(calls[0]!.body.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      `del_inbox:${id}`,
    );
    expect(await getInbox(testEnv, id)).not.toBeNull();
  });

  it("несуществующий id → «не найдена», без клавиатуры", async () => {
    const { fn, calls } = mockFetch();
    await handleInboxDelete(testEnv, "999999", fn);
    expect(String(calls[0]!.body.text)).toContain("не найдена");
    expect(calls[0]!.body.reply_markup).toBeUndefined();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/inbox-manage.test.ts`
Expected: FAIL — `handleInboxView`/`handleInboxDelete` не экспортируются из `../src/commands/inbox`.

- [ ] **Step 3: Реализовать**

В `src/commands/inbox.ts` изменить импорты (строки 1-3) на:

```ts
import type { Env } from "../types";
import { listNewInbox, getInbox, deleteInbox, type InboxItem, type InboxKind } from "../lib/db";
import { replyToOwner } from "../lib/telegram";
import { buildConfirmKeyboard } from "../lib/confirm-keyboard";
```

И добавить в конец файла (после `handleInbox`):

```ts
/** Разбор аргумента команды: только положительное целое число. */
function parseId(args: string): number | null {
  const arg = args.trim();
  return /^\d+$/.test(arg) ? Number(arg) : null;
}

/** Обработчик /inbox_view <id> — полный текст записи. */
export async function handleInboxView(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер записи.", fetchImpl);
    return;
  }
  const item = await getInbox(env, id);
  if (!item) {
    await replyToOwner(env, `Запись #${id} не найдена.`, fetchImpl);
    return;
  }
  await replyToOwner(env, `#${id}:\n\n${item.text ?? "(пусто)"}`, fetchImpl);
}

/** Обработчик /inbox_del <id> — показывает запись и просит подтвердить удаление кнопкой. */
export async function handleInboxDelete(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер записи.", fetchImpl);
    return;
  }
  const item = await getInbox(env, id);
  if (!item) {
    await replyToOwner(env, `Запись #${id} не найдена.`, fetchImpl);
    return;
  }
  await replyToOwner(
    env,
    `Удалить запись #${id} из inbox?\n\n${item.text ?? "(пусто)"}`,
    fetchImpl,
    { reply_markup: buildConfirmKeyboard("del_inbox", id) },
  );
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/inbox-manage.test.ts`
Expected: PASS (5 тестов)

- [ ] **Step 5: Коммит**

```bash
git add src/commands/inbox.ts test/inbox-manage.test.ts
git commit -m "Добавить /inbox_view и /inbox_del"
```

---

### Task 6: /drafts, /draft_view, /draft_del

**Files:**
- Create: `src/commands/drafts.ts`
- Test: `test/drafts.test.ts`

**Interfaces:**
- Consumes: `listDrafts`, `getDraft`, `type DraftItem` (Task 1, из `../lib/db`), `buildConfirmKeyboard("del_draft", id)` (Task 2), `replyToOwner` (существует), `formatDraft(raw: string): string` (существует, `../draft-format`).
- Produces:
  - `export function renderDraftsList(items: DraftItem[]): string`
  - `export async function handleDrafts(env: Env, fetchImpl?: typeof fetch): Promise<void>`
  - `export async function handleDraftView(env: Env, args: string, fetchImpl?: typeof fetch): Promise<void>`
  - `export async function handleDraftDelete(env: Env, args: string, fetchImpl?: typeof fetch): Promise<void>`

- [ ] **Step 1: Написать падающий тест**

Создать `test/drafts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  handleDrafts,
  handleDraftView,
  handleDraftDelete,
  renderDraftsList,
} from "../src/commands/drafts";
import { insertDraft, getDraft, type DraftItem } from "../src/lib/db";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM drafts;");
});

function mockFetch() {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function draftItem(over: Partial<DraftItem>): DraftItem {
  return {
    id: 1,
    inbox_id: null,
    content: "текст",
    status: "draft",
    created_at: "2026-09-27 10:15:00",
    ...over,
  };
}

describe("renderDraftsList", () => {
  it("пустой список", () => {
    expect(renderDraftsList([])).toContain("Черновиков нет");
  });

  it("строка содержит id, дату и превью", () => {
    const text = renderDraftsList([draftItem({ id: 5, content: "Заголовок черновика" })]);
    expect(text).toContain("#5");
    expect(text).toContain("2026-09-27 10:15");
    expect(text).toContain("Заголовок черновика");
  });
});

describe("handleDrafts", () => {
  it("шлёт список сохранённых черновиков", async () => {
    await insertDraft(testEnv, "первый черновик", null);
    const { fn, calls } = mockFetch();
    await handleDrafts(testEnv, fn);
    expect(String(calls[0]!.body.text)).toContain("первый черновик");
  });
});

describe("handleDraftView", () => {
  it("показывает полный текст черновика с HTML-разметкой", async () => {
    const id = await insertDraft(testEnv, "Заголовок\n\nТело черновика", null);
    const { fn, calls } = mockFetch();
    await handleDraftView(testEnv, String(id), fn);
    expect(calls[0]!.body.parse_mode).toBe("HTML");
    expect(String(calls[0]!.body.text)).toContain("Тело черновика");
  });

  it("несуществующий id → «не найден»", async () => {
    const { fn, calls } = mockFetch();
    await handleDraftView(testEnv, "999999", fn);
    expect(String(calls[0]!.body.text)).toContain("не найден");
  });
});

describe("handleDraftDelete", () => {
  it("показывает черновик и клавиатуру подтверждения, НЕ удаляет сразу", async () => {
    const id = await insertDraft(testEnv, "черновик на удаление", null);
    const { fn, calls } = mockFetch();
    await handleDraftDelete(testEnv, String(id), fn);

    expect(String(calls[0]!.body.text)).toContain("черновик на удаление");
    expect(calls[0]!.body.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      `del_draft:${id}`,
    );
    expect(await getDraft(testEnv, id)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/drafts.test.ts`
Expected: FAIL — модуль `../src/commands/drafts` не найден.

- [ ] **Step 3: Реализовать**

Создать `src/commands/drafts.ts`:

```ts
import type { Env } from "../types";
import { listDrafts, getDraft, type DraftItem } from "../lib/db";
import { replyToOwner } from "../lib/telegram";
import { formatDraft } from "../draft-format";
import { buildConfirmKeyboard } from "../lib/confirm-keyboard";

/** Однострочное превью черновика для списка: id, дата, начало текста. */
function formatDraftLine(item: DraftItem): string {
  const preview = item.content.replace(/\s+/g, " ").trim();
  const short = preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
  const date = item.created_at.slice(0, 16);
  return `#${item.id} (${date}) ${short || "(пусто)"}`;
}

/** Собирает текст ответа на /drafts. */
export function renderDraftsList(items: DraftItem[]): string {
  if (items.length === 0) {
    return "Черновиков нет. Сгенерируй командой /draft.";
  }
  const lines = items.map(formatDraftLine).join("\n");
  return `Черновики (${items.length}):\n\n${lines}\n\n/draft_view <id> — полный текст\n/draft_del <id> — удалить`;
}

/** Разбор аргумента команды: только положительное целое число. */
function parseId(args: string): number | null {
  const arg = args.trim();
  return /^\d+$/.test(arg) ? Number(arg) : null;
}

/** Обработчик /drafts. */
export async function handleDrafts(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const items = await listDrafts(env);
  await replyToOwner(env, renderDraftsList(items), fetchImpl);
}

/** Обработчик /draft_view <id> — полный черновик. */
export async function handleDraftView(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер черновика.", fetchImpl);
    return;
  }
  const item = await getDraft(env, id);
  if (!item) {
    await replyToOwner(env, `Черновик #${id} не найден.`, fetchImpl);
    return;
  }
  await replyToOwner(env, `Черновик #${id}:\n\n${formatDraft(item.content)}`, fetchImpl, {
    parse_mode: "HTML",
  });
}

/** Обработчик /draft_del <id> — показывает черновик и просит подтвердить удаление кнопкой. */
export async function handleDraftDelete(
  env: Env,
  args: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const id = parseId(args);
  if (id === null) {
    await replyToOwner(env, "Пришли номер черновика.", fetchImpl);
    return;
  }
  const item = await getDraft(env, id);
  if (!item) {
    await replyToOwner(env, `Черновик #${id} не найден.`, fetchImpl);
    return;
  }
  await replyToOwner(env, `Удалить черновик #${id}?\n\n${formatDraft(item.content)}`, fetchImpl, {
    parse_mode: "HTML",
    reply_markup: buildConfirmKeyboard("del_draft", id),
  });
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/drafts.test.ts`
Expected: PASS (7 тестов)

- [ ] **Step 5: Коммит**

```bash
git add src/commands/drafts.ts test/drafts.test.ts
git commit -m "Добавить /drafts, /draft_view и /draft_del"
```

---

### Task 7: Обработка нажатия inline-кнопки (callback-router)

**Files:**
- Create: `src/callback-router.ts`
- Test: `test/callback-router.test.ts`

**Interfaces:**
- Consumes:
  - `getInbox(env, id): Promise<InboxItem | null>`, `deleteInbox(env, id): Promise<void>` (Task 1)
  - `getDraft(env, id): Promise<DraftItem | null>`, `deleteDraft(env, id): Promise<void>` (Task 1)
  - `answerCallbackQuery(env, callbackQueryId, text?, fetchImpl?)`, `editMessageText(env, chatId, messageId, text, fetchImpl?, extra?)` (Task 3)
  - `TgCallbackQuery` (Task 4, из `./types`)
- Produces: `export async function handleCallbackQuery(env: Env, cq: TgCallbackQuery, fetchImpl?: typeof fetch): Promise<void>`

- [ ] **Step 1: Написать падающий тест**

Создать `test/callback-router.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleCallbackQuery } from "../src/callback-router";
import { insertInbox, getInbox, insertDraft, getDraft } from "../src/lib/db";
import type { Env, TgCallbackQuery } from "../src/types";

const testEnv = env as unknown as Env;

beforeEach(async () => {
  await testEnv.DB.exec("DELETE FROM inbox;");
  await testEnv.DB.exec("DELETE FROM drafts;");
});

function mockFetch() {
  const calls: { url: string; body: any }[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function cq(data: string): TgCallbackQuery {
  return {
    id: "cbq-1",
    from: { id: 111111, is_bot: false },
    message: { message_id: 5, chat: { id: 111111, type: "private" }, date: 0 },
    data,
  };
}

describe("handleCallbackQuery — del_inbox", () => {
  it("удаляет запись, редактирует сообщение и отвечает на callback", async () => {
    const id = await insertInbox(testEnv, { text: "на удаление" });
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq(`del_inbox:${id}`), fn);

    expect(await getInbox(testEnv, id)).toBeNull();
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toContain("удалена");
    expect(edit.body.reply_markup).toEqual({ inline_keyboard: [] });
    expect(calls.some((c) => c.url.includes("/answerCallbackQuery"))).toBe(true);
  });

  it("повторное нажатие на уже удалённую запись — без ошибки", async () => {
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq("del_inbox:999999"), fn);
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toContain("Уже удалено");
  });
});

describe("handleCallbackQuery — del_draft", () => {
  it("удаляет черновик", async () => {
    const id = await insertDraft(testEnv, "черновик", null);
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq(`del_draft:${id}`), fn);

    expect(await getDraft(testEnv, id)).toBeNull();
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toContain("удалён");
  });
});

describe("handleCallbackQuery — cancel", () => {
  it("ничего не удаляет, сообщение меняет на «Отменено.»", async () => {
    const id = await insertInbox(testEnv, { text: "не трогать" });
    const { fn, calls } = mockFetch();
    await handleCallbackQuery(testEnv, cq("cancel"), fn);

    expect(await getInbox(testEnv, id)).not.toBeNull();
    const edit = calls.find((c) => c.url.includes("/editMessageText"))!;
    expect(String(edit.body.text)).toBe("Отменено.");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run test/callback-router.test.ts`
Expected: FAIL — модуль `../src/callback-router` не найден.

- [ ] **Step 3: Реализовать**

Создать `src/callback-router.ts`:

```ts
import type { Env, TgCallbackQuery } from "./types";
import { getInbox, deleteInbox, getDraft, deleteDraft } from "./lib/db";
import { answerCallbackQuery, editMessageText } from "./lib/telegram";

const NO_KEYBOARD = { reply_markup: { inline_keyboard: [] } };

/**
 * Обработка нажатия inline-кнопки. Решение об удалении хранится прямо в
 * callback_data ("del_inbox:<id>" | "del_draft:<id>" | "cancel") — отдельный
 * pending-режим в bot_state тут не нужен.
 */
export async function handleCallbackQuery(
  env: Env,
  cq: TgCallbackQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const data = cq.data ?? "";
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;

  if (chatId === undefined || messageId === undefined) {
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  if (data === "cancel") {
    await editMessageText(env, chatId, messageId, "Отменено.", fetchImpl, NO_KEYBOARD);
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  const inboxMatch = /^del_inbox:(\d+)$/.exec(data);
  if (inboxMatch) {
    const id = Number(inboxMatch[1]);
    const existing = await getInbox(env, id);
    if (!existing) {
      await editMessageText(env, chatId, messageId, "Уже удалено.", fetchImpl, NO_KEYBOARD);
      await answerCallbackQuery(env, cq.id, "Уже удалено", fetchImpl);
      return;
    }
    await deleteInbox(env, id);
    await editMessageText(
      env,
      chatId,
      messageId,
      `✅ Запись #${id} удалена.`,
      fetchImpl,
      NO_KEYBOARD,
    );
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  const draftMatch = /^del_draft:(\d+)$/.exec(data);
  if (draftMatch) {
    const id = Number(draftMatch[1]);
    const existing = await getDraft(env, id);
    if (!existing) {
      await editMessageText(env, chatId, messageId, "Уже удалено.", fetchImpl, NO_KEYBOARD);
      await answerCallbackQuery(env, cq.id, "Уже удалено", fetchImpl);
      return;
    }
    await deleteDraft(env, id);
    await editMessageText(
      env,
      chatId,
      messageId,
      `✅ Черновик #${id} удалён.`,
      fetchImpl,
      NO_KEYBOARD,
    );
    await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
    return;
  }

  // Неизвестный callback_data — просто закрываем "часики" у кнопки.
  await answerCallbackQuery(env, cq.id, undefined, fetchImpl);
}
```

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run test/callback-router.test.ts`
Expected: PASS (4 теста)

- [ ] **Step 5: Коммит**

```bash
git add src/callback-router.ts test/callback-router.test.ts
git commit -m "Добавить обработку callback_query для подтверждения удаления"
```

---

### Task 8: Подключить новые команды в router.ts

**Files:**
- Modify: `src/router.ts`

**Interfaces:**
- Consumes: `handleInboxView`, `handleInboxDelete` (Task 5, из `./commands/inbox`); `handleDrafts`, `handleDraftView`, `handleDraftDelete` (Task 6, из `./commands/drafts`).
- Produces: обновлённый `handleMessage` — без изменения сигнатуры.

Роутер (`router.ts`, `commands/inbox.ts`, `commands/drafts.ts`) не покрыт unit-тестами и в текущем проекте (см. `test/` — нет `router.test.ts`), поэтому здесь тестового шага нет: корректность проверяется тестами Task 5/6 (сами обработчики) и финальной ручной/полной прогонкой тестов в Task 10.

- [ ] **Step 1: Обновить импорты в `src/router.ts`**

Заменить строки 1-7:

```ts
import type { Env, TgMessage } from "./types";
import { replyToOwner, setMyCommands } from "./lib/telegram";
import { getPending, setPending, clearPending } from "./lib/db";
import { intakeMessage } from "./inbox-intake";
import { handleInbox, handleInboxView, handleInboxDelete } from "./commands/inbox";
import { handleDraft } from "./commands/draft";
import { handleDrafts, handleDraftView, handleDraftDelete } from "./commands/drafts";
import { handleIdea } from "./commands/idea";
```

- [ ] **Step 2: Добавить новые case'ы в switch и обновить /start**

В `src/router.ts` заменить блок `switch (parsed.command) { ... }` (строки 53-80) на:

```ts
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
```

- [ ] **Step 3: Обновить список команд в `setMyCommands` (`src/lib/telegram.ts`)**

Заменить блок `commands: [...]` (строки 187-191) на:

```ts
      commands: [
        { command: "inbox", description: "Показать накопленное сырьё" },
        { command: "inbox_view", description: "Полный текст записи inbox" },
        { command: "inbox_del", description: "Удалить запись inbox" },
        { command: "idea", description: "Идеи для постов" },
        { command: "draft", description: "Сгенерировать черновик поста" },
        { command: "drafts", description: "Список сохранённых черновиков" },
        { command: "draft_view", description: "Полный текст черновика" },
        { command: "draft_del", description: "Удалить черновик" },
      ],
```

- [ ] **Step 4: Тайпчек**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/router.ts src/lib/telegram.ts
git commit -m "Подключить /inbox_view, /inbox_del, /drafts, /draft_view, /draft_del в роутер"
```

---

### Task 9: Маршрутизация callback_query в index.ts

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `extractCallbackQuery(update)` (Task 4, из `./auth`), `handleCallbackQuery(env, cq, fetchImpl?)` (Task 7, из `./callback-router`).
- Produces: обновлённый `fetch()` — обрабатывает апдейты с `callback_query` отдельной веткой.

- [ ] **Step 1: Заменить `src/index.ts` целиком**

```ts
import type { Env, TgUpdate } from "./types";
import { isValidWebhookSecret, isOwner, extractMessage, extractCallbackQuery } from "./auth";
import { markUpdateProcessed } from "./dedup";
import { handleMessage } from "./router";
import { handleCallbackQuery } from "./callback-router";
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

    // 4. Идемпотентность: дубль update_id — no-op. Общая для всех типов
    //    апдейтов (message и callback_query).
    const isNew = await markUpdateProcessed(env, update.update_id);
    if (!isNew) {
      return new Response("ok", { status: 200 });
    }

    // 5. Нажатие inline-кнопки — отдельная ветка, до разбора message.
    const cq = extractCallbackQuery(update);
    if (cq) {
      ctx.waitUntil(
        handleCallbackQuery(env, cq).catch((err) => {
          console.error("handleCallbackQuery failed", err);
        }),
      );
      return new Response("ok", { status: 200 });
    }

    const msg = extractMessage(update);
    if (!msg) {
      return new Response("ok", { status: 200 });
    }

    // 6. Отвечаем Telegram мгновенно, тяжёлую работу — в waitUntil.
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
```

- [ ] **Step 2: Тайпчек**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add src/index.ts
git commit -m "Маршрутизировать callback_query отдельной веткой в webhook"
```

---

### Task 10: Обновить README и прогнать полный набор тестов

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Обновить структуру и список команд в README.md**

Заменить строку 16:

```markdown
**MVP задеплоен и работает.** Команды: `/start`, `/inbox`, `/inbox_view`, `/inbox_del`, `/idea`, `/draft`, `/drafts`, `/draft_view`, `/draft_del`.
```

Заменить строку 40 (`inbox.ts        — /inbox (список сырья и готовых текстов)`) на:

```
    inbox.ts        — /inbox, /inbox_view, /inbox_del (сырьё и готовые тексты)
```

После строки 42 (`idea.ts         — /idea (генерация тем)`) добавить:

```
    drafts.ts       — /drafts, /draft_view, /draft_del (список/просмотр/удаление черновиков)
```

После строки, описывающей `router.ts` в дереве структуры (строка про `router.ts`), добавить пункт про новый файл — найти строку `router.ts        — разбор команд, маршрутизация сообщений` и добавить после неё:

```
  callback-router.ts — обработка нажатий inline-кнопок (подтверждение удаления)
```

- [ ] **Step 2: Прогнать полный набор тестов**

Run: `npm test`
Expected: все тесты проходят (существующие + новые из Task 1, 2, 3, 4, 5, 6, 7), включая `gen:voice --check`.

- [ ] **Step 3: Тайпчек всего проекта**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add README.md
git commit -m "Обновить README: новые команды и файлы"
```
