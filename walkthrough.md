# Walkthrough - Z Route Redemption Tactical Map Planner

We have integrated wiki articles directly into the sidebar accordion, and added auto-collapsing sidebar triggers to improve map highlight visibility.

---

## 🚀 Newly Implemented Updates

### 1. Sidebar Wiki Accordion (Интеграция статей в сайдбар)
- **Feature**: Replaced the overlay modal window (`#articles-modal`) with a native sidebar accordion section (`#section-articles`):
  - Articles are rendered and managed directly inside the collapsible side menu, keeping the map visible at all times.
  - Simplified `js/10-articles.js` to perform a single fetch on load.

### 2. Auto-Collapse Sidebar on Save (Сворачивание сайдбара при подсветке базы)
- **Feature**: Saving or creating a player profile now automatically collapses the sidebar (`collapseSidebar()` inside `js/05-sessions-profile.js`):
  - Solves the UX issue where the wide sidebar drawer would cover the map and block the pulsing yellow base highlight (`highlight-ping`) on save.

### 3. Active Status in Onboarding (Активность игрока на онбординге)
- **Feature**: Connected the **«Активен сегодня»** (Active today) checkbox inside the onboarding modal to write correctly to player base data properties.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Restructured articles modal elements to sidebar sections and added onboarding activity selectors.
- [js/05-sessions-profile.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/05-sessions-profile.js) — Triggered `collapseSidebar()` inside `saveProfile()`.
- [js/10-articles.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/10-articles.js) — Streamlined triggers to work inside the sidebar layout.
