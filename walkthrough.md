# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented English-base articles editor, deterministic viewport calculations, alliance activity reports exporter, and browser auto-translation protection.

---

## 🚀 Newly Implemented Updates

### 1. English-Base Articles Editor (EN-центричность базы знаний)
- **Feature**: Redesigned the articles database and editor to use English as the primary base language:
  - Removed Russian inputs and secondary Quill editors from the editing modal, simplifying the interface.
  - Articles are now written in English by default, and translated to Russian on the fly directly inside the reading pane.
  - Translations are cached in the articles JSON database.

### 2. Mathematical Mobile Viewport Fitting (Математический расчет центровки)
- **Feature**: Implemented `applyMobileFitToScreen()` to resolve viewport centering race conditions:
  - Calculates scrolling offsets mathematically (`state.gridWidth * state.cellSize * scale`) instead of querying live browser DOM properties (`scrollWidth`/`scrollHeight`) immediately after a CSS `transform` change.
  - Guarantees accurate, centered viewport positions during mobile initializations and home button clicks.

### 3. Alliance Activity Report Exporter (Выгрузка текстовых отчётов)
- **Feature**: Added **«Скачать отчёт активности»** (Export activity) button in the sidebar:
  - Generates a detailed plain-text report of all troop movements (domes, attacks, reinforcements, or idle status) categorized by alliance.
  - Runs client-side without overloading the server.
  - **BOM Protection**: Prepends the Byte Order Mark (`\uFEFF`) to ensure the downloaded `.txt` opens without Cyrillic encoding errors in Notepad or Excel on Windows.

### 4. Auto-Translation Protection (Защита от автопереводчиков)
- **Feature**: Added `translate="no"` and `<meta name="google" content="notranslate">` to the document header.
- Prevents browsers (like Google Chrome) from auto-translating text which would break coordinates, labels, and WebSocket synchronization.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Added translation metadata tags, action button for text reports, and cleaned up editor fields.
- [js/04-viewport-select.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/04-viewport-select.js) — Implemented `applyMobileFitToScreen()`.
- [js/05-sessions-profile.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/05-sessions-profile.js) — Added `exportActivityReport()` and `generateActivityReport()`.
- [js/06-edit-sync.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/06-edit-sync.js) — Streamlined centering bindings.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Mapped localized string arrays for reports.
- [js/10-articles.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/10-articles.js) — Streamlined editor inputs to focus on English.
