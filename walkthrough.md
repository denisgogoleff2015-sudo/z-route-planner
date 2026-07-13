# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented manual translation protections, content change warnings, and restored draft blocks to optimize multilingual guide generation.

---

## 🚀 Newly Implemented Updates

### 1. Manual Translation Protection (Защита ручных правок от стирания)
- **Feature**: Developed a content tracking system inside `server.js` using `manualLangs` metadata arrays:
  - English (`en`) remains the master source.
  - When the English source changes, the backend usually clears all translations so they can be regenerated.
  - However, if a translation has been manually edited by a commander (via the new **«Поправить этот перевод»** button), its language key is stored in `manualLangs` and **retained** during source updates instead of being deleted.
  - The language code is flagged under `staleLangs` to alert translators of potential drift.

### 2. Translation Stale Warnings (Оповещения об устаревании перевода)
- **Feature**: Added a warning banner `#article-stale-warning` inside `index.html`:
  - If a player reads a translation that is registered in `staleLangs`, the header alerts them that the English original has changed since this translation was updated.
  - Once a commander opens the editor and edits the translation, the warning flags are cleared.

### 3. Russian Draft Tool Restoration (Возврат черновика на русском)
- **Feature**: Restored the Russian Draft block (`#ru-draft-box`) inside the primary editor view to allow commanders to compose text in Cyrillic and translate it to the English master format.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Integrated translation edit buttons, warnings boxes, and restored draft panels.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) — Mapped `manualLangs` and `staleLangs` arrays in database updates.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Localized translation edit buttons and warnings indicators.
- [js/10-articles.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/10-articles.js) — Linked translation editor triggers and draft translation buttons.
