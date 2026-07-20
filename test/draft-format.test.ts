import { describe, it, expect } from "vitest";
import { formatDraft } from "../src/draft-format";

describe("formatDraft", () => {
  it("заменяет ё → е (и Ё → Е)", () => {
    const out = formatDraft("Привёз медаль. Ёлка.\n\nTrain. Think. Explore.");
    expect(out).toContain("Привез медаль");
    expect(out).toContain("Елка");
    expect(out).not.toMatch(/[ёЁ]/);
  });

  it("подпись становится жирной (HTML) и не дублируется", () => {
    const out = formatDraft("Текст поста.\n\nTrain. Think. Explore.");
    expect(out.endsWith("<b>Train. Think. Explore.</b>")).toBe(true);
    // ровно одна подпись
    expect(out.split("Train. Think. Explore.").length - 1).toBe(1);
  });

  it("добавляет подпись, если её не было", () => {
    const out = formatDraft("Короткий пост без подписи.");
    expect(out.endsWith("<b>Train. Think. Explore.</b>")).toBe(true);
  });

  it("заголовок (первая строка) становится жирным", () => {
    const out = formatDraft("Onerun 2026\nТекст поста.\nTrain. Think. Explore.");
    expect(out.startsWith("<b>Onerun 2026</b>")).toBe(true);
  });

  it("вставляет пустую строку между абзацами", () => {
    const out = formatDraft("Заголовок\nПервый абзац.\nВторой абзац.\nTrain. Think. Explore.");
    expect(out).toContain("<b>Заголовок</b>\n\nПервый абзац.\n\nВторой абзац.");
  });

  it("пункты списка держит вплотную, но отбивает от текста", () => {
    const raw = [
      "Итог:",
      "🥇 1 место - 10 км",
      "🥇 1 место - 3 км",
      "🥈 2 место - кроссфит",
      "Вымотался сильно.",
      "Train. Think. Explore.",
    ].join("\n");
    const out = formatDraft(raw);
    // медали вплотную друг к другу
    expect(out).toContain("🥇 1 место - 10 км\n🥇 1 место - 3 км\n🥈 2 место - кроссфит");
    // блок списка отбит пустой строкой от заголовка и от текста после
    expect(out).toContain("<b>Итог:</b>\n\n🥇 1 место - 10 км");
    expect(out).toContain("🥈 2 место - кроссфит\n\nВымотался сильно.");
  });

  it("заменяет тире (длинное и короткое) на дефис", () => {
    const out = formatDraft(
      "Заголовок – с тире\nТекст — с длинным тире и – с коротким.\nTrain. Think. Explore.",
    );
    expect(out).not.toMatch(/[–—]/);
    expect(out).toContain("Заголовок - с тире");
    expect(out).toContain("Текст - с длинным тире и - с коротким.");
  });

  it("экранирует HTML-спецсимволы в теле", () => {
    const out = formatDraft("Темп < 3:40 & набор > 100 м.\nTrain. Think. Explore.");
    expect(out).toContain("Темп &lt; 3:40 &amp; набор &gt; 100 м.");
    // подпись остаётся валидным тегом
    expect(out.endsWith("<b>Train. Think. Explore.</b>")).toBe(true);
  });
});
