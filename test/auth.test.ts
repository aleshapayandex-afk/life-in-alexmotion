import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  isValidWebhookSecret,
  isOwner,
  TELEGRAM_SECRET_HEADER,
} from "../src/auth";
import type { Env, TgUpdate } from "../src/types";

const testEnv = env as unknown as Env;

function makeRequest(secret?: string): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set(TELEGRAM_SECRET_HEADER, secret);
  return new Request("https://example.com/webhook", { method: "POST", headers });
}

function updateFrom(userId: number): TgUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: userId, is_bot: false },
      chat: { id: userId, type: "private" },
      date: 0,
      text: "/start",
    },
  };
}

describe("secret_token (сценарий 4)", () => {
  it("принимает запрос с верным secret_token", () => {
    expect(isValidWebhookSecret(makeRequest(testEnv.WEBHOOK_SECRET), testEnv)).toBe(true);
  });

  it("отклоняет неверный secret_token", () => {
    expect(isValidWebhookSecret(makeRequest("wrong"), testEnv)).toBe(false);
  });

  it("отклоняет отсутствующий secret_token", () => {
    expect(isValidWebhookSecret(makeRequest(undefined), testEnv)).toBe(false);
  });
});

describe("проверка владельца (сценарий 3)", () => {
  it("пропускает владельца", () => {
    const ownerId = Number(testEnv.OWNER_USER_ID);
    expect(isOwner(updateFrom(ownerId), testEnv)).toBe(true);
  });

  it("отклоняет чужого пользователя", () => {
    expect(isOwner(updateFrom(999999999), testEnv)).toBe(false);
  });

  it("отклоняет апдейт без from", () => {
    const update: TgUpdate = {
      update_id: 2,
      message: { message_id: 11, chat: { id: 1, type: "private" }, date: 0, text: "hi" },
    };
    expect(isOwner(update, testEnv)).toBe(false);
  });
});

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
