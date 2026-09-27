import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { markUpdateProcessed } from "../src/dedup";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

describe("идемпотентность по update_id (сценарий 1)", () => {
  it("первый раз — новый апдейт (true)", async () => {
    const isNew = await markUpdateProcessed(testEnv, 1001);
    expect(isNew).toBe(true);
  });

  it("повтор того же update_id — дубль (false)", async () => {
    await markUpdateProcessed(testEnv, 2002);
    const second = await markUpdateProcessed(testEnv, 2002);
    expect(second).toBe(false);
  });

  it("разные update_id независимы", async () => {
    expect(await markUpdateProcessed(testEnv, 3003)).toBe(true);
    expect(await markUpdateProcessed(testEnv, 3004)).toBe(true);
  });
});
