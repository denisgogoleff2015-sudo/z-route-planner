# Walkthrough - Z Route Redemption Tactical Map Planner

We have refactored and modularized the tactical map planner into dedicated style and script submodules, and implemented a brand new browser-side Excel roster importer.

---

## 🚀 Newly Implemented Updates

### 1. Refactored Modular Architecture (Модульное разделение кода)
- The monolithic `app.js` (3400+ lines) and `style.css` (1800+ lines) have been split into clean, logically isolated files in the `/js` and `/css` folders:
  - **Stylesheets (`/css`)**:
    - [01-base-layout.css](file:///C:/Users/пк/Desktop/Z%20ROUTE/css/01-base-layout.css) — Core themes, scrollbars, sidebars, and fonts.
    - [02-map-view.css](file:///C:/Users/пк/Desktop/Z%20ROUTE/css/02-map-view.css) — Canvas grids, overlays, bases, and arrow drawing styles.
    - [03-mobile.css](file:///C:/Users/пк/Desktop/Z%20ROUTE/css/03-mobile.css) — Viewports, HUDs, and touch-optimized bottom bar overrides.
    - [04-components.css](file:///C:/Users/пк/Desktop/Z%20ROUTE/css/04-components.css) — Modals, toasts, buttons, and loading previews.
  - **Scripts (`/js`)**:
    - [01-state-grid.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/01-state-grid.js) — Application state, cached DOM bindings, toasts, and coordinate calculators.
    - [02-arrows.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/02-arrows.js) — Arrow path rendering and battery/capital target progress bars.
    - [03-bases-render.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/03-bases-render.js) — Rendering bases overlay, roster widget, tap action logic, and Gray Zone dome enforcement rules.
    - [04-viewport-select.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/04-viewport-select.js) — Interactive pan, pinch-to-zoom, and multi-selection box logic.
    - [05-sessions-profile.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/05-sessions-profile.js) — User onboarding checking flow and registration/edit modal.
    - [06-edit-sync.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/06-edit-sync.js) — WebSockets live sync and collaborative editing action operations.
    - [07-roster-import.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/07-roster-import.js) — Excel spreadsheet parser, previews, and bulk database insert logic.
    - [08-bindings-init.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/08-bindings-init.js) — DOM click events and touch listener initializations.
    - [09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Dictionary definitions, multi-language toggles, and player search box filtering.

### 2. Client-Side Excel Roster Importer (Импорт участников из Excel)
- **Feature**: A new Excel file uploader has been integrated into the sidebar:
  - Select your alliance (ZOG, S72, FoE, FoE2, BfE, Allied).
  - Upload a `.xlsx` spreadsheet containing participant roster data.
  - Automatically parses columns like `Participant` (name), `Base Level/Rank` (level/rank), `Choice` (1=Attack, 2=Reinforce, 3=Blockade/Defense), and `Combat Power` (CP).
  - Generates a preview checkbox list of participants.
  - Click **"Импортировать"** (Import) to automatically update existing players, or register new ones and place them in the free slots of the Green Zone (sorted by CP power).

### 3. Added 'Reinforce' Combat Role (Роль «Подкрепление»)
- **Feature**: Added the **Reinforce (Подкрепление)** role option to the onboarding, profile editor, and Excel parser logic.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Included SheetJS library, replaced legacy single-file scripts and stylesheets links with new modular files, and added the Excel import form.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) — Served static files from root, seamlessly hosting `/js` and `/css` subfolders.
