# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented lazy on-demand translation of daily announcements, cross-linking of announcements to Wiki guides, and full French language (FR) localization.

---

## 🚀 Newly Implemented Updates

### 1. Lazy Daily Notice Translations (Ленивый перевод объявлений)
- **Feature**: Refactored the daily announcement translation system inside `server.js` and `js/09-mobile-i18n.js`:
  - Weekly announcements are saved in English only.
  - Translating notices to target languages (Russian, French, etc.) is triggered **on-demand** upon viewing by hitting the `/api/notifications/day/:day/translate` endpoint.
  - Keeps database updates lightweight, prevents redundant API requests, and caches translations on success.
  - Discards cached translation strings if the English original is edited.

### 2. VS Announcements Wiki Integration (Связывание объявлений и статей)
- **Feature**: Added support for linking daily Victory Showdown (VS) announcements to specific Wiki articles:
  - If a daily announcement has an associated `articleId`, a **«Подробнее» (More Details)** action button is displayed on the Home screen banner.
  - Clicking the button routes the user directly to the corresponding guide, enhancing onboarding guidance.

### 3. French Language (FR) Localization (Полная французская локализация)
- **Feature**: Integrated complete French translations across all modules:
  - Localized grids, legends, sidebars, player cards, articles manager, excel importers, activity exporters, and error dialogs.
  - Added `FR` inside the top fixed header language switcher.
  - Handled French locales (`fr-FR`) for activity report generation timestamps.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Integrated detail actions and translation toggles inside the Home notification banner.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) — Programmed lazy on-demand translation endpoints and language name listings.
- [js/05-sessions-profile.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/05-sessions-profile.js) — Mapped French locale timestamps.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Localized French string hashes and bound detail/translation triggers.
