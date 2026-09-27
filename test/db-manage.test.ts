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
