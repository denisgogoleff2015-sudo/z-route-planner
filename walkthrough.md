# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented all requested changes and features inside the map editor folder [Z ROUTE](file:///C:/Users/пк/Desktop/Z%20ROUTE/).

---

## 🚀 All Implemented Updates

### 1. Custom Domain Sharing via Localtunnel (Запуск красивой ссылки с ПК)
- **Feature**: You don't need a VPS, credit cards, or complex Docker configurations. The tactical planner can run completely on your local computer, and you can share a public, professional-looking domain link.
- **Current Active Link**:
  - **`https://zog-tactical.loca.lt`**
- **How to bypass first-time entry**:
  - When opening the link for the first time, Localtunnel requests an "Endpoint IP" to prevent phishing.
  - Enter your computer's external IP: **`104.28.222.14`** (or find your current one on [2ip.ru](https://2ip.ru)). Click "Click to Submit", and the map will load!

### 2. Refactored Modular Architecture (Модульное разделение кода)
- The monolithic `app.js` and `style.css` files have been split into clean, logically isolated files in the `/js` and `/css` folders:
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
    - [05-sessions-profile.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/05-sessions-profile.js) — User onboarding checking flow, registration/edit modal, and base grouping.
    - [06-edit-sync.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/06-edit-sync.js) — WebSockets live sync and collaborative editing action operations.
    - [07-roster-import.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/07-roster-import.js) — Excel spreadsheet parser, previews, and bulk database insert logic.
    - [08-bindings-init.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/08-bindings-init.js) — DOM click events and touch listener initializations.
    - [09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Dictionary definitions, multi-language toggles, and player search box filtering.

### 3. Client-Side Excel Roster Importer (Импорт участников из Excel)
- **Feature**: A new Excel file uploader has been integrated into the sidebar:
  - Automatically parses columns like `Participant` (name), `Base Level/Rank` (level/rank), `Choice` (1=Attack, 2=Reinforce, 3=Blockade/Defense), and `Combat Power` (CP).
  - Generates a preview checkbox list of participants.
  - Click **"Импортировать"** (Import) to automatically update existing players, or register new ones and place them in the free slots of the Green Zone.

### 4. Compact Block-Based Map Clustering (Компактная блочная группировка)
- **Feature**: Added a new **«Группировка на карте»** (Map Regrouping) button:
  - Automatically redistributes all bases in the Green Zone into visually isolated clusters.
  - Groups bases by alliance color first, then sub-groups them by combat roles (Attack, Defense, Reinforce, Capture), and finally sorts them alphabetically.
  - Bases are grouped into clean, readable rectangular blocks 3 rows high.
  - **Preserves Arrow Connections**: Recalculates and remaps active arrow start and end coordinate points by base ID so lines remain linked after repositioning.

### 5. Unified Login Gate & Ranks (Единый гейт входа и ранги)
- **Feature**: A new entry gate modal (`#entry-gate-modal`) is presented on the first load:
  - Users enter their **Nickname** and **Rank** (R1 to R5).
  - R4 and R5 ranks (Commanders) require a commander password (`1234` or `1998`) to enter in editor mode.
  - Other ranks enter in read-only **Viewer mode**.
  - Direct links containing `?key=...` automatically bypass this modal.

### 6. Mobile & Performance Optimizations (Оптимизации под мобильные)
- **Dynamic Viewport Height (`100dvh`)**: Prevents layout jumps when browser address bars collapse.
- **Pinch-to-Zoom & Gesture Tolerance**: Implemented programmatic pinch-to-zoom (0.3x to 3.0x) and added a 10px long-press wiggle tolerance.
- **GPU Compositing Layering**: Added `will-change: transform` to the map canvas wrapper to prevent layout repaints during zoom/pan.
- **Arrow Drawing Double-Tap Fix**: Ignores same-cell start/end clicks and uses conditional touchstart `preventDefault()` to prevent browser event duplications.

---

## 💻 How to Start the Server locally (for future runs)

1. Open PowerShell inside the `Z ROUTE` folder.
2. Start the local server:
   ```bash
   npm start
   ```
3. In a separate PowerShell window, start the localtunnel tunnel:
   ```bash
   npx localtunnel --port 3000 --subdomain zog-tactical
   ```
4. Share the links with your alliance members!

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) - Included SheetJS library, replaced legacy links with new modular files, and added the Excel import form.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) - Served static files from root, seamlessly hosting `/js` and `/css` subfolders.
