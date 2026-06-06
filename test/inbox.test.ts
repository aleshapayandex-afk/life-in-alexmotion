import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { parseInboxItem, intakeMessage } from "../src/inbox-intake";
import { listNewInbox, getInbox } from "../src/lib/db";
import type { Env, TgMessage } from "../src/types";

const testEnv = env as unknown as Env;

beforeAll(async () => {
  await testEnv.DB.exec(
    "CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, text TEXT, file_id TEXT, media_group_id TEXT, rubric TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now')));",
  );
});

function baseMsg(over: Partial<TgMessage>): TgMessage {
  return {
    message_id: 1,
    chat: { id: 1, type: "private" },
    date: 0,
    ...over,
  };
}

describe("parseInboxItem — разбор входящего (сценарий 7)", () => {
  it("фото с подписью → kind=photo, file_id наибольшего размера, text=caption", () => {
    const msg = baseMsg({
      caption: "Saqqara, песчаная буря",
      photo: [
        { file_id: "small", file_unique_id: "u1", width: 90, height: 60 },
        { file_id: "medium", file_unique_id: "u2", width: 320, height: 240 },
        { file_id: "large", file_unique_id: "u3", width: 1280, height: 960 },
      ],
    });
    const item = parseInboxItem(msg);
    expect(item).not.toBeNull();
    expect(item!.kind).toBe("photo");
    expect(item!.file_id).toBe("large");
    expect(item!.text).toBe("Saqqara, песчаная буря");
  });

  it("видео → kind=video, file_id видео", () => {
    const item = parseInboxItem(
      baseMsg({ video: { file_id: "vid1", file_unique_id: "vu", duration: 12 } }),
    );
    expect(item!.kind).toBe("video");
    expect(item!.file_id).toBe("vid1");
  });

  it("чистый текст → kind=text, file_id=null", () => {
    const item = parseInboxItem(baseMsg({ text: "идея про дисциплину" }));
    expect(item!.kind).toBe("text");
    expect(item!.file_id).toBeNull();
    expect(item!.text).toBe("идея про дисциплину");
  });

  it("альбом → media_group_id сохраняется", () => {
    const item = parseInboxItem(
      baseMsg({
        media_group_id: "mg-42",
        photo: [{ file_id: "p", file_unique_id: "pu", width: 100, height: 100 }],
      }),
    );
    expect(item!.media_group_id).toBe("mg-42");
  });

  it("пустое сообщение (ни текста, ни медиа) → null", () => {
    expect(parseInboxItem(baseMsg({}))).toBeNull();
  });
});

describe("intakeMessage — запись в БД", () => {
  it("сохраняет фото и читается через listNewInbox/getInbox", async () => {
    const id = await intakeMessage(
      testEnv,
      baseMsg({
        caption: "горы",
        photo: [{ file_id: "ski-large", file_unique_id: "su", width: 800, height: 600 }],
      }),
    );
    expect(id).not.toBeNull();

    const row = await getInbox(testEnv, id!);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("photo");
    expect(row!.file_id).toBe("ski-large");
    expect(row!.text).toBe("горы");
    expect(row!.status).toBe("new");

    const list = await listNewInbox(testEnv);
    expect(list.some((i) => i.id === id)).toBe(true);
  });
});
