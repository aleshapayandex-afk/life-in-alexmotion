export type DeleteAction = "del_inbox" | "del_draft";

/** Inline-клавиатура «Удалить / Отмена» для подтверждения удаления записи. */
export function buildConfirmKeyboard(
  action: DeleteAction,
  id: number,
): { inline_keyboard: { text: string; callback_data: string }[][] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ Удалить", callback_data: `${action}:${id}` },
        { text: "❌ Отмена", callback_data: "cancel" },
      ],
    ],
  };
}
