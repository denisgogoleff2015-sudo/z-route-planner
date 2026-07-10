# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented all requested changes inside the map editor folder [Z ROUTE](file:///C:/Users/пк/Desktop/Z%20ROUTE/).

---

## 🚀 Newly Implemented Updates

### 1. Resilient Image Processing (Отказоустойчивое сохранение изображений)
- **Feature**: Replaced rigid `sharp` image compilation imports in `server.js` with a dynamic fallback pattern:
  - If `sharp` fails to import (e.g. Node.js environment version on the host is older than 20), the entire application **no longer crashes**.
  - Instead, the server outputs a startup warning, falls back to a native `fs.writeFileSync` buffer copy, and retains original images exactly as uploaded.
  - Keeps image uploads functional on old or minimal VPS hosting setups.

### 2. Collaborative Knowledge Wiki (Блок «Статьи»)
- **Feature**: Added a fully integrated articles wiki module (`js/10-articles.js` & `#articles-modal`):
  - Supports organizing guides into collapsible categories (**Устав / Charter**, **Туториалы VS / VS Tutorials**, and **Межконтинентальная война / Intercontinental War**).
  - Uses **Quill.js** for visual text formatting in Russian and English.
  - **AI Claude/DeepSeek Translation**: Commanders can automatically translate their articles from Russian to English in one click via a DeepSeek API proxy route, preserving all HTML formatting tags.

### 3. Multi-Language Localization System (Полный перевод интерфейса)
- **Feature**: Multi-language toggles have been expanded to cover the entire planner:
  - Localized forms, buttons, dropdowns, headers, legend parameters, tool descriptions, and error dialogs in Russian and English.
  - Supports `data-i18n-title` tags for hover titles.

### 4. Smart Base Editing Restrictions (Безопасная работа с картой)
- **Feature**: Prevented modal dialog popups during coordinate lookups:
  - In **«Указатель» (Neutral/Pointer)** mode, clicking on a base only highlights (flashes) it.
  - Editing properties is restricted strictly to the **«Правка» (Edit)** tool.

### 5. Git Repository Management (`.gitignore`)
- **Feature**: Added a `.gitignore` file to ignore database states (`map_state.json`, `articles.json`), credentials (`.env`), uploaded files (`uploads/`), and package folders (`node_modules/`).

---

## 💻 How to Start the Server locally (for future runs)

1. Open PowerShell inside the `Z ROUTE` folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local server:
   ```bash
   npm start
   ```
4. In a separate PowerShell window, start the localtunnel tunnel:
   ```bash
   npx localtunnel --port 3000 --subdomain zog-tactical
   ```
5. Share the links with your alliance members!

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) - Linked Quill, added articles modal, and implemented complete `data-i18n` bindings.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) - Supported try/catch imports for sharp and dynamic write-fallback file strategies.
- [package.json](file:///C:/Users/пк/Desktop/Z ROUTE/package.json) - Added dependencies for `multer`, `sharp`, and `dotenv`.
