# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented all requested changes inside the map editor folder [Z ROUTE](file:///C:/Users/пк/Desktop/Z%20ROUTE/):

---

## 🚀 Newly Implemented Updates

### 1. Duplicate Player Highlight & Search (Подсветка дубликатов на карте)
- **Feature**: If you try to save a player profile with a nickname that **already exists** on the tactical map, the system will not create a duplicate base.
- **Visual Alert**:
  - The map will center focus, show a warning toast (e.g. `Игрок "Nickname" уже добавлен! База подсвечена и обновлена.`), and initiate a **pulsing yellow highlight animation** (`highlight-ping`) on the existing base element on the map that flashes 3 times to grab your attention.
  - This allows commanders to quickly search/locate any player base on the map by simply typing their name in the profile section and clicking "Save".

### 2. Secret Key AI Tools Isolation (Скрытие кнопок ИИ)
- The buttons associated with AI functionality (`Paste AI JSON` and `Copy Prompt for AI`) are now hidden by default in normal viewer or commander mode (`?key=1234`).
- **Access Rule**: They will only be displayed and accessible if you open the planner with the secret key **`1998`** (i.e. `http://localhost:3000/?key=1998`).
- Key `1998` grants full commander access rights plus opens the AI integration toolkit panels!

### 3. Developer Credit Footer (Разработчик: DeGoRu)
- The bottom of the sidebar credit footer has been updated to explicitly highlight your nickname:
  - **Разработчик: DeGoRu** in ZOG-cyan branding font styling.

---

## ☁️ How to Deploy on Render (Инструкция по выкладке на Render.com)

Render is a cloud application platform. Since the planner is built on a Node.js express/ws socket server, it runs perfectly on Render's free tier.

### Step 1: Push to GitHub
1. Create a repository on GitHub (e.g. `z-route-tactical`).
2. Initialize git in your local project folder and push the code:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin <your-github-repo-url>
   git branch -M main
   git push -u origin main
   ```

### Step 2: Create a Web Service on Render
1. Go to [Render](https://render.com) and sign in (you can use your GitHub account).
2. Click **New +** at the top right and select **Web Service**.
3. Connect your GitHub repository.
4. Fill in the configuration details:
   - **Name**: `z-route-planner` (or any custom name)
   - **Environment / Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

### Step 3: Deploy!
1. Click **Deploy Web Service** at the bottom of the page.
2. Render will build and start the Node.js server.
3. Once the build log says `Your service is live`, you will get a public URL (e.g., `https://z-route-planner.onrender.com`).
   - Use `https://z-route-planner.onrender.com` for player reader mode.
   - Use `https://z-route-planner.onrender.com/?key=1234` for editor/commander mode.
   - Use `https://z-route-planner.onrender.com/?key=1998` for commander + AI tools mode.

*Note: WebSockets (`ws://` / `wss://`) will work automatically because Render routes WebSocket connections natively on their HTTP ports.*

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) - Set developer credit to DeGoRu.
- [style.css](file:///C:/Users/пк/Desktop/Z%20ROUTE/style.css) - Added yellow flashing `@keyframes pingHighlight` styling.
- [app.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/app.js) - Supported key 1998, hid AI buttons by default, and implemented base flashing animation in `saveProfile()`.
