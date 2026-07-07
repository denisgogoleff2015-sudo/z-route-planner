# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented all requested changes inside the map editor folder [Z ROUTE](file:///C:/Users/пк/Desktop/Z%20ROUTE/):

---

## 🚀 Newly Implemented Updates

### 1. Custom Domain Sharing via Localtunnel (Запуск красивой ссылки с ПК)
- **Feature**: You don't need a VPS, credit cards, or complex Docker configurations. The tactical planner can run completely on your local computer, and you can share a public, professional-looking domain link.
- **Current Active Link**:
  - **`https://zog-tactical.loca.lt`**
- **How to bypass first-time entry**:
  - When opening the link for the first time, Localtunnel requests an "Endpoint IP" to prevent phishing.
  - Enter your computer's external IP: **`104.28.222.14`** (or find your current one on [2ip.ru](https://2ip.ru)). Click "Click to Submit", and the map will load!

### 2. Duplicate Player Highlight & Search (Подсветка дубликатов на карте)
- If you save a player profile with a nickname that already exists on the map, the system triggers a warning toast and initiates a yellow pulsing highlight animation (`highlight-ping`) on the existing base element on the map that flashes 3 times to show you exactly where the base is located.

### 3. Secret Key AI Tools Isolation (Скрытие кнопок ИИ)
- The buttons associated with AI functionality (`Paste AI JSON` and `Copy Prompt for AI`) are hidden by default.
- They will only be displayed and accessible if you open the planner with the secret key **`1998`** (i.e. `https://zog-tactical.loca.lt/?key=1998`).

### 4. Developer Credit Footer (Разработчик: DeGoRu)
- The bottom of the sidebar credit footer displays: **Разработчик: DeGoRu** in a sleek styled block with a beating heart animation.

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
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) - Set developer credit to DeGoRu.
- [style.css](file:///C:/Users/пк/Desktop/Z%20ROUTE/style.css) - Added yellow flashing `@keyframes pingHighlight` styling.
- [app.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/app.js) - Supported key 1998, hid AI buttons by default, and implemented base flashing animation in `saveProfile()`.
- [Dockerfile](file:///C:/Users/пк/Desktop/Z%20ROUTE/Dockerfile) - Added for Docker/Hugging Face compatibility if needed in the future.
