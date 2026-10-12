# Tolyq Staff — план (поток A, админка)

Стек: Refine 5 + Vite + Ant Design 5 + vite-plugin-pwa. Данные — мок (`src/mock/seed.ts`, in-memory
DataProvider с сохранением в localStorage, `src/providers/data.ts`). Бэкенд (B2) подключается заменой
`dataProvider`/`authProvider`, страницы трогать не нужно.

| Задача | Раздел | Файлы |
|---|---|---|
| A1 Каркас | вход, меню, тема из DESIGN.md, PWA | `App.tsx`, `providers/*`, `theme.ts`, `pages/Login.tsx` |
| A2 Заказы | список/фильтры, статусы, правка состава и веса, курьер, предзаказ, сборочный лист, CSV | `pages/orders` |
| A10 Оплата и накладные | подтверждение переводов, накладные (печать) | `pages/payments`, `pages/invoices` |
| A3 Каталог | товары + фасовки, категории, массовые действия | `pages/products`, `pages/categories` |
| A4 Импорт/экспорт | загрузка CSV, проверка без сохранения, отчёт по строкам, история, экспорт шаблона | `pages/imports` |
| A5 Остатки | таблица, корректировка с причиной, порог, журнал движений | `pages/stock` |
| A6 Клиенты и заявки | клиенты, блокировка, очередь заявок, документы, комментарии | `pages/customers`, `pages/wholesale` |
| A7 Условия | конструктор, области, период, предпросмотр на тестовой корзине | `pages/conditions` |
| A8 Доставка | зоны, тарифы, слоты, самовывоз, курьеры | `pages/delivery`, `pages/couriers` |
| A9 Дашборд/журнал/настройки | KPI, топы, низкие остатки, журнал, реквизиты, счётчики «требует внимания» (B20) | `pages/dashboard`, `pages/audit`, `pages/settings` |

Мок-вход: `admin@tolyq.kz` / `admin123` (блокировка после 5 ошибок).
Сброс мок-данных: `localStorage.removeItem("tolyq-staff-db-v1")`.

## Запуск
`npm run dev` → http://localhost:5173 · сборка с PWA: `npm run build && npm start`.
Самопроверки: `node --experimental-strip-types src/pages/orders/recalc.check.ts`,
`node --experimental-strip-types src/pages/imports/csv.check.ts`, `npx tsx src/pages/conditions/preview.check.ts`.

## Что ждёт бэкенда
Замена `providers/data.ts` и `providers/auth.ts` (B2, B19); дашборд считает в браузере (→ B13);
решение по опт-заявке — два запроса (→ одна транзакция B6); импорт применяется построчно (→ batch B12);
Excel разбирает сервер (B12); подписанные ссылки на документы (B6).
