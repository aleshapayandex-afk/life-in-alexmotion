import { describe, it, expect } from "vitest";
import { findEcho, echoWarning } from "../src/echo-check";
import { VOICE_EXAMPLES } from "../src/voice-examples.generated";

describe("findEcho — заимствования из эталонов", () => {
  it("ловит фразу, которую модель реально утащила на живом прогоне", () => {
    // Дословный фрагмент черновика gpt-oss-120b от 2026-09-22.
    const draft =
      "Пятое место в категории, формально неплохо, но по ощущениям - один из самых тяжёлых стартов за последний год.";
    const echo = findEcho(draft, VOICE_EXAMPLES);
    expect(echo).toContain("формально неплохо");
  });

  it("не срабатывает на своём тексте", () => {
    const draft =
      "Вышел на утренний разогревочный. Ветер в спину, ноги свежие, финишировал спокойно и без борьбы.";
    expect(findEcho(draft, VOICE_EXAMPLES)).toBeNull();
  });

  it("короткие совпадения не считает заимствованием", () => {
    expect(findEcho("было тяжело", ["а было тяжело только в конце"], 5)).toBeNull();
  });

  it("не считает различием регистр, «ё» и вид тире", () => {
    const echo = findEcho("Один из самых тяжелых стартов", ["один из самых тяжёлых стартов"], 5);
    expect(echo).toBe("один из самых тяжелых стартов");
  });

  it("возвращает самое длинное совпадение, а не первое", () => {
    const example = ["раз два три четыре пять шесть семь"];
    expect(findEcho("раз два три четыре пять шесть семь", example, 5)).toBe(
      "раз два три четыре пять шесть семь",
    );
  });
});

describe("echoWarning — сообщение владельцу", () => {
  it("молчит, когда заимствований нет", () => {
    expect(echoWarning("совершенно свой текст без совпадений", VOICE_EXAMPLES)).toBeNull();
  });

  it("называет длину совпадения и саму фразу", () => {
    const warning = echoWarning("формально неплохо, но по ощущениям - один из", VOICE_EXAMPLES);
    expect(warning).toContain("слов подряд");
    expect(warning).toContain("формально неплохо");
  });
});
