import { describe, it, expect } from "vitest";
import { STYLE_GUIDE } from "../src/voice";

describe("STYLE_GUIDE — новые правила стиля (2026-07-20)", () => {
  it("запрещает выдумывать факты", () => {
    expect(STYLE_GUIDE).toContain("Никогда не выдумывай факты");
  });

  it("цель по длине — 1000-2000 знаков", () => {
    expect(STYLE_GUIDE).toContain("1000-2000 знаков");
  });

  it("для LIFE цифры необязательны", () => {
    expect(STYLE_GUIDE).toContain(
      "Для LIFE (итоги, рефлексия, благодарность) цифры необязательны",
    );
  });

  it("запрещает служебные ярлыки разделов в тексте поста", () => {
    expect(STYLE_GUIDE).toContain("Не выводи в тексте поста служебные подписи");
  });

  it("содержит новый эталон LIFE без цифр (день рождения)", () => {
    expect(STYLE_GUIDE).toContain("День рождения ⛵🎉");
  });

  it("запрещает короткое тире (en dash), не только длинное", () => {
    expect(STYLE_GUIDE).toContain("«–» короткое/en dash");
  });

  it("запрещает переприсваивать смысл чисел из материала", () => {
    expect(STYLE_GUIDE).toContain(
      "общий призовой фонд конкурса - это не то же самое, что личный выигрыш",
    );
  });

  it("требует список для 3+ результатов", () => {
    expect(STYLE_GUIDE).toContain("оформляй списком по одному на строке");
  });
});
