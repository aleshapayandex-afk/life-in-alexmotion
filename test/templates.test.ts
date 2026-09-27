import { describe, it, expect } from "vitest";
import { capText, TEXT_LIMIT } from "../src/templates";

describe("capText — лимит исходящего сообщения", () => {
  it("короткий текст не трогает", () => {
    expect(capText("привет")).toBe("привет");
  });

  it("текст ровно по лимиту не трогает", () => {
    const exact = "a".repeat(TEXT_LIMIT);
    expect(capText(exact)).toBe(exact);
  });

  it("длинный текст обрезает до лимита и помечает", () => {
    const out = capText("a".repeat(TEXT_LIMIT + 500));
    expect(out.length).toBeLessThanOrEqual(TEXT_LIMIT);
    expect(out.endsWith("…обрезано")).toBe(true);
  });

  it("режет по переносу строки, если он рядом с краем", () => {
    const head = "строка\n".repeat(600);
    const out = capText(head + "x".repeat(500));
    expect(out.length).toBeLessThanOrEqual(TEXT_LIMIT);
    expect(out).toContain("строка");
    expect(out.replace("…обрезано", "").trimEnd().endsWith("строка")).toBe(true);
  });

  it("не рвёт HTML-тег пополам", () => {
    // Черновики уходят с parse_mode HTML: половина тега сломает разбор.
    const out = capText("y".repeat(TEXT_LIMIT - 5) + "<b>жирный</b>");
    const tail = out.slice(-40);
    expect(tail).not.toMatch(/<[^>]*$/);
  });
});
