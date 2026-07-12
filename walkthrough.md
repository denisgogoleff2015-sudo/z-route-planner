# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented a weekly cycle of daily announcements (matching Moscow time shifts), editing interfaces, and dismissible cross-page notification strips.

---

## 🚀 Newly Implemented Updates

### 1. Weekly VS Notification Cycle (Цикл оповещений Victory Showdown)
- **Feature**: Designed a structured announcement loop for Victory Showdown (VS) weekly events:
  - **Moscow Time Sync (Сброс в 5:00 МСК)**: Daily cards shift automatically based on Europe/Moscow timezones. The game day rolls over at **5:00 AM MSK** (4:59 AM still shows yesterday's tasks).
  - **6-Day Loop**: Covers Day 1 (Monday) to Day 6 (Saturday). Sunday is off (no alert displays).
  - **Auto AI Translation**: Commanders edit the entire week in English. The server automatically translates text inputs to Russian via the DeepSeek API proxy, saving records in `notification.json`.
  - Added `notification.json` to git exclusions in `.gitignore`.

### 2. Dismissible Cross-Page Notification Strip (Сквозное оповещение)
- **Feature**: Added a top alert banner `#cross-notification-strip` visible across all pages (e.g. Map view):
  - Displays today's instructions if the player hasn't seen it yet on the Home screen dashboard.
  - Tapping the "Close" cross button caches a date-specific key (`z_notification_seen_date` in localStorage) to prevent the same task from re-appearing, while reset cycles clear it automatically for the next day.

### 3. Mobile Tab Memory (Сохранение вкладки при перезапуске)
- **Feature**: The client now remembers the last visited mobile sub-screen (`z_last_mobile_screen` in localStorage) and opens it automatically upon site reload.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Added daily notification home banners, week editors, and top horizontal header strips.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) — Implemented plaintext DeepSeek API translation routes and week save REST endpoints.
- [css/03-mobile.css](file:///C:/Users/пк/Desktop/Z ROUTE/css/03-mobile.css) — Stylesheets for home cards, notification banners, and strip animations.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Configured Moscow timezone calculations, week edit savings, and visibility states.
- [.gitignore](file:///C:/Users/пк/Desktop/Z%20ROUTE/.gitignore) — Ignored `notification.json`.
