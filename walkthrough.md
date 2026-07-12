# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented support for attacking specific enemy bases directly, automatic dome dropping when starting an attack, and updated AI system constraints.

---

## 🚀 Newly Implemented Updates

### 1. Attacking Specific Enemy Bases (Атака конкретных вражеских баз)
- **Feature**: Refactored arrow validations inside `js/02-arrows.js`:
  - Allowed drawing attack arrows targeting specific enemy bases (`dstBase.color === 'red'`), both for single base commands and group actions.
  - Previously, attack arrows were only permitted towards Capital area coordinates. Commanders can now direct tactical squads to engage specific enemy camps.

### 2. Auto Dome-Drop on Attack (Снятие защитного купола при атаке)
- **Feature**: Added automatic shield dropping triggers inside `completeArrowDrawing()`:
  - If a base initiates an attack arrow (marching towards an enemy base or Capital cells), the system automatically drops its dome shield (`base.dome = false`).
  - Synchronizes the update to the server and all clients using a real-time WebSocket packet: `sendBaseOp({ kind: 'update', dome: false })`.
  - **Support Arrows**: Drawing assistance lines to friendly bases of the same alliance color does not drop the dome shield.

### 3. AI Instructions Sync (Обновление правил ИИ)
- **Feature**: Updated [ai_instructions.md](file:///C:/Users/пк/Desktop/Z%20ROUTE/ai_instructions.md):
  - Synchronized rules description: bases cannot attack while retaining shield protection, and initiating attacks drops the dome automatically.

---

## Technical Files Modified
- [js/02-arrows.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/02-arrows.js) — Implemented enemy base targets validation and dome drop routines.
- [ai_instructions.md](file:///C:/Users/пк/Desktop/Z%20ROUTE/ai_instructions.md) — Aligned AI constraint logic documentation.
