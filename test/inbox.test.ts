import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { parseInboxItem, intakeMessage } from "../src/inbox-intake";
import { listNewInbox, getInbox } from "../src/lib/db";
import type { Env, TgMessage } from "../src/types";

const testEnv = env as unknown as Env;

function baseMsg(over: Partial<TgMessage>): TgMessage {
  return {
    message_id: 1,
    chat: { id: 1, type: "private" },
    date: 0,
    ...over,
  };
}

describe("parseInboxItem — разбор входящего", () => {
  it("чистый текст → text-запись", () => {
    const item = parseInboxItem(baseMsg({ text: "идея про дисциплину" }));
    expect(item!.text).toBe("идея про дисциплину");
  });

  it("пустое сообщение (нет текста) → null", () => {
    expect(parseInboxItem(baseMsg({}))).toBeNull();
  });

  it("медиа без текста → null (принимаем только текст)", () => {
    const msg = baseMsg({
      photo: [{ file_id: "large", file_unique_id: "u3", width: 1280, height: 960 }],
    });
    expect(parseInboxItem(msg)).toBeNull();
  });
});

describe("intakeMessage — запись в БД", () => {
  it("сохраняет текст и читается через listNewInbox/getInbox", async () => {
    const id = await intakeMessage(
      testEnv,
      baseMsg({ text: "пробежал 10 км в 5:30/км" }),
    );
    expect(id).not.toBeNull();

    const row = await getInbox(testEnv, id!);
    expect(row).not.toBeNull();
    expect(row!.text).toBe("пробежал 10 км в 5:30/км");
    expect(row!.status).toBe("new");

    const list = await listNewInbox(testEnv);
    expect(list.some((i) => i.id === id)).toBe(true);
  });
});
