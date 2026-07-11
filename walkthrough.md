# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented WebSocket echo filtration, debounced sidebar roster redrawing, and eliminated heavy GPU layout operations (such as backdrop blur filters and max-height transitions).

---

## 🚀 Newly Implemented Updates

### 1. WebSocket Sync Echo Filtering (Исключение повторного рендеринга)
- **Feature**: Programmed client-side signature checking (`recentOwnOps` set) inside `js/06-edit-sync.js`:
  - Recognizes operations originally initiated by the local user.
  - Skips redundant redraws (`applyBaseOp()`) when receiving the server's broadcast echo of the user's own base placements or movements.

### 2. Debounced Base Roster Redraws (Дебаунс пересборки списка игроков)
- **Feature**: Added `rosterDebounceTimer` (150ms) to single-element appends:
  - When continuously painting multiple bases, the sidebar text list is rebuilt once (150ms after the last block is placed) instead of triggering full HTML rebuilds on every coordinate paint.
  - Prevents stuttering and locks painting performance at 60fps.

### 3. GPU & Layout Thrashing Elimination (Оптимизация CSS и отказ от blur)
- **Feature**: Refactored styling parameters for weak mobile devices:
  - **Removed `backdrop-filter: blur`**: Blurring large backgrounds behind sidebars or legends requires capturing screen buffers and calculating shaders on every single zoom/pan frame. Replaced with higher-opacity backgrounds (`rgba` values `0.92` to `0.97`) which require zero GPU buffer capturing.
  - **Refactored Sidebar Transitions**: Replaced margin-left layout changes with GPU-accelerated `transform: translateX()` transitions, preventing document recalculations.
  - **Refactored Accordions**: Replaced heavy `max-height: 1200px` transitions with instant `display: none` toggle and simple opacity fades.
  - **Removed `transition: all`**: Swapped generic transition rules for targeted properties (e.g. `background-color`, `transform`, `opacity`).

---

## Technical Files Modified
- [css/01-base-layout.css](file:///C:/Users/пк/Desktop/Z ROUTE/css/01-base-layout.css) — Replaced transition parameters and blurred sidebar overlays.
- [css/02-map-view.css](file:///C:/Users/пк/Desktop/Z ROUTE/css/02-map-view.css) — Optimised modal backdrops, legends, sidebars, and accordions layout transitions.
- [js/01-state-grid.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/01-state-grid.js) — Streamlined single place base functions.
- [js/03-bases-render.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/03-bases-render.js) — Integrated debounced roster triggers.
- [js/06-edit-sync.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/06-edit-sync.js) — Implemented websocket echo filtration.
