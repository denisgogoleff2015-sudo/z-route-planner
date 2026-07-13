# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented a daily Victory Showdown (VS) announcement carousel featuring swipe controls and dot indicators to view the entire week's schedule.

---

## 🚀 Newly Implemented Updates

### 1. Interactive Announcement Carousel (Карусель объявлений по дням недели)
- **Feature**: Replaced the static home banner with an interactive carousel (`#home-notification-carousel`):
  - **Swipe Controls (Свайпы по горизонтали)**: Allows sliding right/left to scroll through days. Incorporates `touch-action: pan-y` so vertical page scrolling functions natively while horizontal swipes slide the cards.
  - **Arrow Buttons & Dots**: Clicking arrow buttons or circular dot indicators navigates to the selected day.
  - **Direct Translations**: Allows commanders to view a future day and translate it immediately via DeepSeek API on demand.
  - **Active Day Focus**: Automatically initializes the carousel viewport centered on "today's" active day.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Restructured the announcement banner to support slides, carousel arrows, and dot wrappers.
- [css/03-mobile-i18n.css](file:///C:/Users/пк/Desktop/Z ROUTE/css/03-mobile.css) — Styles for slides, indicators, carousel buttons, and touch-action parameters.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Mapped horizontal swiping thresholds, dot indicators, and targets translations.
