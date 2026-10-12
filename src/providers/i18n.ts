// Russian strings for Refine's built-in UI (buttons, notifications, titles).
// ponytail: flat dictionary, no i18n library; add react-i18next when Kazakh lands (V2).
import type { I18nProvider } from "@refinedev/core";
import { resources } from "../resources";

const ru: Record<string, string> = {
  "buttons.create": "Создать",
  "buttons.save": "Сохранить",
  "buttons.logout": "Выйти",
  "buttons.delete": "Удалить",
  "buttons.edit": "Изменить",
  "buttons.cancel": "Отмена",
  "buttons.confirm": "Вы уверены?",
  "buttons.filter": "Фильтр",
  "buttons.clear": "Сбросить",
  "buttons.refresh": "Обновить",
  "buttons.show": "Открыть",
  "buttons.undo": "Отменить",
  "buttons.import": "Импорт",
  "buttons.clone": "Копировать",
  "buttons.export": "Экспорт",
  "buttons.notAccessTitle": "Нет доступа",
  "actions.list": "Список",
  "actions.create": "Создание",
  "actions.edit": "Редактирование",
  "actions.show": "Просмотр",
  "actions.clone": "Копирование",
  "notifications.success": "Готово",
  "notifications.error": "Ошибка (код {{statusCode}})",
  "notifications.createSuccess": "Создано",
  "notifications.createError": "Не удалось создать (код {{statusCode}})",
  "notifications.editSuccess": "Сохранено",
  "notifications.editError": "Не удалось сохранить (код {{statusCode}})",
  "notifications.deleteSuccess": "Удалено",
  "notifications.deleteError": "Не удалось удалить (код {{statusCode}})",
  "notifications.undoable": "Можно отменить в течение {{seconds}} с",
  "warnWhenUnsavedChanges": "Есть несохранённые изменения. Уйти со страницы?",
  "pages.error.info": "Страница не найдена",
  "pages.error.backHome": "На главную",
  "pages.error.404": "Такой страницы нет.",
  "table.actions": "Действия",
  "dashboard.title": "Дашборд",
};

const ACTION_TITLE: Record<string, (label: string) => string> = {
  list: (l) => l,
  create: (l) => `${l}: создание`,
  edit: (l) => `${l}: редактирование`,
  show: (l) => l,
};
// Refine asks for "<resource>.titles.<action>" (page headers, "back to list" buttons).
const titleOf = (key: string) => {
  const m = key.match(/^(.+)\.titles\.(\w+)$/);
  const r = m && resources.find((x) => ("identifier" in x ? x.identifier : x.name) === m[1] || x.name === m[1]);
  const label = r?.meta?.label;
  return m && label ? (ACTION_TITLE[m[2]]?.(label) ?? label) : undefined;
};

export const i18nProvider: I18nProvider = {
  translate: (key, options, defaultMessage) => {
    const s = ru[key] ?? titleOf(key) ?? (typeof options === "string" ? options : defaultMessage) ?? key;
    return typeof options === "object" && options
      ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => String((options as Record<string, unknown>)[k] ?? ""))
      : s;
  },
  changeLocale: async () => {},
  getLocale: () => "ru",
};
