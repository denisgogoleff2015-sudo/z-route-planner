# Walkthrough - Z Route Redemption Tactical Map Planner

We have implemented peeking carousel side-card previews, 3D perspective transforms, and direct tap-to-switch navigation.

---

## 🚀 Newly Implemented Updates

### 1. 3D Peeking Carousel Previews (Боковые карточки-превью с загибом)
- **Feature**: Replaced basic navigation arrows inside the daily announcement carousel with peeking preview cards (`#carousel-card-prev` and `#carousel-card-next`):
  - **3D Rotations (Эффект глубины)**: Applied `perspective: 1000px` to the carousel wrapper, styling side cards with:
    - Left Card: `transform: translateX(-18%) scale(0.86) rotateY(22deg)` and `opacity: 0.5`
    - Right Card: `transform: translateX(18%) scale(0.86) rotateY(-22deg)` and `opacity: 0.5`
    - Uses cheap GPU properties (`transform`, `opacity`) to ensure zero performance overhead during scrolling.
  - **Truncated Previews**: Dynamically renders the day label (e.g. `Day 2`) and up to 3 lines of task details (`-webkit-line-clamp: 3`) on side-cards.
  - **Tap Switch**: Directly clicking a peeking preview card slides it into focus.

---

## Technical Files Modified
- [index.html](file:///C:/Users/пк/Desktop/Z ROUTE/index.html) — Swapped arrow elements for preview overlays.
- [css/03-mobile.css](file:///C:/Users/пк/Desktop/Z ROUTE/css/03-mobile.css) — Mapped perspective, absolute position parameters, line clamping, and GPU transform transitions.
- [js/09-mobile-i18n.js](file:///C:/Users/пк/Desktop/Z%20ROUTE/js/09-mobile-i18n.js) — Mapped side-card renderer sequences and tap listeners.
