# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented a native mobile dashboard experience with a fixed top header, fullscreen section overlays, and a bottom sheet navigation panel.

---

## 🚀 Newly Implemented Updates

### 1. Mobile Fullscreen Sections & Dashboard (Полноэкранная мобильная навигация)
- **Feature**: Redesigned the mobile UX to use focused fullscreen sheets instead of the long desktop sidebar:
  - **Fixed Top Header**: Contains a branded badge, page title, and menu buttons.
  - **Bottom Navigation Sheet**: Triggers a slide-up menu containing navigation items for **Map**, **Articles**, **Base Roster**, and **Sessions**.
  - **Fullscreen Section Overlays**: Content panels (`#mobile-screen-articles`, `#mobile-screen-roster`, etc.) fill the viewport below the header, disabling accordion collapsibles to show information directly.
  - **Interaction Protection**: Hides the map canvas via CSS (`visibility: hidden`) when sub-sections are active, preventing accidental dragging. Recalculates canvas grid ratios (`recalculateCellSize()`) upon return to the Map sheet.

### 2. Header Language Switching (Переводчик в мобильной шапке)
- **Feature**: Mapped the localization language switch select element to inject itself directly into the new top fixed header (`#mobile-top-header`) on mobile devices.

### 3. Alliance Credits Expansion (Поддержка ZOG и S72)
- **Feature**: Updated footer translation keys to support both **ZOG** and **S72** alliances in the credit strings: `Сделано специально для ZOG и S72` / `Made especially for ZOG and S72`.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Integrated top headers, bottom navigation sheet modals, and fullscreen wrappers.
- [css/03-mobile.css](file:///C:/Users/пк/Desktop/Z ROUTE/css/03-mobile.css) — Stylesheets for top headers, sheets, fullscreen panels, and sidebar hiding metrics.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Mapped fullscreen navigation event triggers and credits translations.
