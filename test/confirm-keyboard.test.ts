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
