/** Ukrainian names of the admin journal's actions (apps/api writes the keys). */
const ACTION_NAMES: Record<string, string> = {
  login: "Вхід",
  login_failed: "Невдала спроба входу",
  logout: "Вихід",
  hide_miniature: "Сховано мініатюру",
  show_miniature: "Показано мініатюру",
  remove_miniature: "Видалено мініатюру",
  dismiss_reports: "Відхилено скарги",
  add_stop_words: "Додано стоп-слова",
  remove_stop_word: "Видалено стоп-слово",
  ban_collection: "Забанено колекцію",
  unban_collection: "Розбанено колекцію",
};

export function actionName(action: string): string {
  return ACTION_NAMES[action] ?? action;
}
