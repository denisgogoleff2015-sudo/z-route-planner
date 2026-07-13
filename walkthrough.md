# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented direct multilingual editing for wiki articles, simplified input parameters, and integrated game terminology dictionaries for translations.

---

## 🚀 Newly Implemented Updates

### 1. Direct Multilingual Articles Editing (Редактирование на любом языке)
- **Feature**: Redesigned `/api/articles` to support any active language (`lang` parameter):
  - Commanders write and edit articles directly in their selected language (Russian, French, or English).
  - The server only updates the corresponding lang property key, preserving other translation strings.
  - Swapped language-specific fields (`editor-title-en`, `editor-quill-en`) for generic fields (`editor-title`, `editor-quill`) which bind to the current active language.
  - Retired the redundant Russian Draft box (`#ru-draft-box`) from the layout.

### 2. In-Game Terminology Glossaries (Игровой глоссарий для ИИ)
- **Feature**: Integrated a gaming glossary (`GAME_TERMINOLOGY_NOTE`) into article and notice translations:
  - Instructs DeepSeek to map "fighter" to natural community slang (e.g. Russian "боец"/"бойцы" instead of transliterating it as "файтер" or translating it as "истребитель").
  - Mandates keeping specific named resources unchanged in all targets: `ZOG`, `S72`, `FoE`, `BfE`, `dome`, `capital`, `SvS`, `VS`, `Fighter Parts`, `Fighter XP`, `Hero XP`, `Mission Readiness`, `Drill Ground`, `Hall of Heroes`.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Replaced language-specific editors with unified inputs and removed draft blocks.
- [server.js](file:///C:/Users/пк/Desktop/Z ROUTE/server.js) — Mapped `lang` parameters inside article saves, and injected gaming glossaries.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Mapped localized general header strings.
- [js/10-articles.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/10-articles.js) — Streamlined editors to use unified fields and dynamic lang selectors.
