// ===== 09/9: МОБИЛЬНЫЙ UI (аккордеон, pinch-zoom, нижняя панель), I18N, ОНБОРДИНГ ===== (грузить последним)
// -------------------------------------------------------------
// MOBILE ACCORDION & TOUCH GESTURES BINDINGS
// -------------------------------------------------------------

// Sidebar collapsible sections accordion toggle logic
document.querySelectorAll('.section-title').forEach(title => {
    title.addEventListener('click', () => {
        const section = title.closest('.section');
        if (section) {
            section.classList.toggle('collapsed');
        }
    });
});

// -------------------------------------------------------------
// PINCH-TO-ZOOM (два пальца) для мобильных устройств
// -------------------------------------------------------------
// Плавный зум К ТОЧКЕ между пальцами + пан двумя пальцами.
// На время жеста отключаем CSS-transition (класс no-anim), иначе рывки.
let pinchStartDist = null;
let pinchPrevScale = 1;
let pinchPrevMid = null;
let pinchContRect = null; // кэш getBoundingClientRect() на весь жест — контейнер не двигается во время зума
let pinchRafPending = false;
let pinchLatestMid = null;
let pinchLatestDist = null;

function touchDistance(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}
function touchMidpoint(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
}

DOM.mapContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchPrevScale = state.zoomScale;
        pinchPrevMid = touchMidpoint(e.touches[0], e.touches[1]);
        // Считаем rect ОДИН раз на весь жест, а не на каждый touchmove — контейнер
        // не двигается и не меняет размер во время пинча, пересчитывать нечего.
        pinchContRect = DOM.mapContainer.getBoundingClientRect();
        state.isPanning = false; // гасим однопальцевый пан
        DOM.mapCanvasWrapper.classList.add('no-anim'); // без transition во время жеста
    }
}, { passive: true });

// Применяет накопленные изменения ровно один раз за кадр отрисовки — если браузер
// прислал несколько touchmove между кадрами, лишние DOM-записи не делаются.
function applyPinchFrame() {
    pinchRafPending = false;
    if (!pinchStartDist || !pinchLatestMid || !pinchContRect) return;

    const cont = DOM.mapContainer;
    const mid = pinchLatestMid;

    const rawScale = pinchPrevScale * (pinchLatestDist / pinchStartDist);
    const newScale = Math.max(0.3, Math.min(3.0, rawScale));

    const midX = mid.x - pinchContRect.left;
    const midY = mid.y - pinchContRect.top;

    const k = newScale / state.zoomScale;
    let newScrollLeft = (cont.scrollLeft + midX) * k - midX;
    let newScrollTop  = (cont.scrollTop  + midY) * k - midY;

    newScrollLeft += (pinchPrevMid.x - mid.x);
    newScrollTop  += (pinchPrevMid.y - mid.y);

    state.zoomScale = newScale;
    DOM.mapCanvasWrapper.style.transform = `scale(${newScale})`;
    cont.scrollLeft = newScrollLeft;
    cont.scrollTop = newScrollTop;

    pinchPrevMid = mid;
}

window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
        pinchLatestMid = touchMidpoint(e.touches[0], e.touches[1]);
        pinchLatestDist = touchDistance(e.touches[0], e.touches[1]);
        if (!pinchRafPending) {
            pinchRafPending = true;
            requestAnimationFrame(applyPinchFrame);
        }
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2 && pinchStartDist) {
        pinchStartDist = null;
        pinchPrevMid = null;
        pinchContRect = null;
        pinchLatestMid = null;
        pinchLatestDist = null;
        DOM.mapCanvasWrapper.classList.remove('no-anim'); // возвращаем плавность кнопкам
        DOM.zoomLevelText.innerText = `${Math.round(state.zoomScale * 100)}%`;
    }
});

// Долгое нажатие → рисование баз протяжкой / выделение протяжкой. Проблема,
// которую решает: раньше ЛЮБОЕ касание клетки сетки на тач-устройстве сразу
// запускало симуляцию скролла (см. ниже) — из-за этого протяжка пальцем при
// активном инструменте "База-*" или "Выбор" просто двигала карту, а не рисовала
// базы/выделяла рамкой. Быстрый свайп по-прежнему скроллит как раньше; если же
// палец задержался на месте ~380мс — переключаемся в режим рисования/выделения.
let paintHoldTimer = null;
let paintArmed = false;
let paintStartX = 0, paintStartY = 0;
let paintedCellsThisGesture = new Set();
let paintPlacedCount = 0;
const PAINT_HOLD_MS = 380;
const PAINT_CANCEL_PX = 10;

function cellFromTouchPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.grid-cell') : null;
}

// Panning touchstart trigger (один палец)
DOM.mapContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (e.target === DOM.mapContainer || e.target.classList.contains('grid-cell')) {
        const touch = e.touches[0];
        const simulatedEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 1 // Simulate scroll/middle click to invoke panning
        });
        DOM.mapContainer.dispatchEvent(simulatedEvent);

        const onGridCell = e.target.classList.contains('grid-cell');
        const isPaintTool = !isViewerMode && onGridCell && state.activeTool.startsWith('base-');
        const isSelectTool = !isViewerMode && onGridCell && state.activeTool === 'select';

        if (isPaintTool || isSelectTool) {
            paintStartX = touch.clientX;
            paintStartY = touch.clientY;
            paintArmed = false;
            paintedCellsThisGesture.clear();
            clearTimeout(paintHoldTimer);
            paintHoldTimer = setTimeout(() => {
                paintArmed = true;
                state.isPanning = false; // отменяем уже запущенный "скролл" — палец не двигался, значит это не свайп
                DOM.mapContainer.style.cursor = 'grab';
                DOM.mapCanvasWrapper.classList.remove('no-anim');
                if (navigator.vibrate) navigator.vibrate(15); // тактильная подсказка, если поддерживается
                if (isSelectTool) startMarquee(paintStartX, paintStartY);
            }, PAINT_HOLD_MS);
        }
    }
}, { passive: true });

// Пока не "вооружились" (ждём долгое нажатие) — следим за сдвигом пальца,
// чтобы отменить таймер при обычном быстром свайпе (это скролл, не рисование).
// Как только "вооружились" — для инструмента "База-*" красим клетку под пальцем.
window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    if (paintHoldTimer && !paintArmed) {
        const dx = touch.clientX - paintStartX, dy = touch.clientY - paintStartY;
        if (Math.hypot(dx, dy) > PAINT_CANCEL_PX) {
            clearTimeout(paintHoldTimer);
            paintHoldTimer = null;
        }
    }

    if (paintArmed && state.activeTool.startsWith('base-')) {
        const cell = cellFromTouchPoint(touch.clientX, touch.clientY);
        if (cell) {
            const key = cell.dataset.row + '-' + cell.dataset.col;
            if (!paintedCellsThisGesture.has(key)) {
                paintedCellsThisGesture.add(key);
                const r = parseInt(cell.dataset.row), c = parseInt(cell.dataset.col);
                const occupied = state.bases.some(b => b.row === r && b.col === c);
                if (!occupied) {
                    const placed = placeBase(r, c, state.activeTool.split('-')[1], { silent: true });
                    if (placed) paintPlacedCount++;
                }
            }
        }
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });

window.addEventListener('touchend', () => {
    clearTimeout(paintHoldTimer);
    paintHoldTimer = null;
    if (paintArmed && paintPlacedCount > 0) {
        showToast(`${t('paint.placed')}: ${paintPlacedCount}`, 'success');
    }
    paintArmed = false;
    paintPlacedCount = 0;
    paintedCellsThisGesture.clear();
});
window.addEventListener('touchcancel', () => {
    clearTimeout(paintHoldTimer);
    paintHoldTimer = null;
    paintArmed = false;
    paintPlacedCount = 0;
    paintedCellsThisGesture.clear();
});

// Global touchmove and touchend listener translates touch movements to MouseEvent coordinates
window.addEventListener('touchmove', (e) => {
    if (state.isDraggingBase || state.isPanning || state.isMarquee) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const simulatedEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        window.dispatchEvent(simulatedEvent);
        
        if (e.cancelable) {
            e.preventDefault(); // prevent native scroll overlay
        }
    }
}, { passive: false });

window.addEventListener('touchend', () => {
    if (state.isDraggingBase || state.isPanning || state.isMarquee) {
        const simulatedEvent = new MouseEvent('mouseup', {});
        window.dispatchEvent(simulatedEvent);
    }
});

// =============================================================
// МОБИЛЬНАЯ НИЖНЯЯ ПАНЕЛЬ (портрет / узкие экраны ≤700px)
// Десктоп не затрагивается: панель существует только на мобиле (CSS),
// а обвязка ниже безопасна и на десктопе (кнопок просто не видно).
// =============================================================
// =============================================================
// НОВАЯ МОБИЛЬНАЯ НАВИГАЦИЯ: шапка + нижнее меню + полноэкранные разделы
// (Главная / Карта / Статьи / Состав / Сессии). См. CSS в 03-mobile.css —
// там же объяснение, почему сайдбар на мобиле больше не выезжающая панель.
// =============================================================
let currentMobileScreen = 'home';

function showMobileScreen(name) {
    currentMobileScreen = name;
    // "notif-edit" — временный экран (нужны свежие данные через renderWeekEditor(),
    // которые заполняются только при явном открытии кнопкой) — не запоминаем его
    // как "последний раздел", иначе при следующем визите он откроется пустым.
    if (name !== 'notif-edit') {
        localStorage.setItem('z_last_mobile_screen', name);
    }

    document.body.classList.toggle('mobile-screen-map', name === 'map');

    document.querySelectorAll('.mobile-fullscreen-section').forEach(el => {
        el.classList.toggle('active', el.id === `mobile-screen-${name}`);
    });

    document.querySelectorAll('.mobile-nav-item[data-mobile-screen]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mobileScreen === name);
    });

    closeMobileNavSheet();
    updateCrossNotificationStrip();

    // При возврате на карту — досчитываем размеры (вдруг сменилась высота
    // видимой области из-за появления/исчезновения шапки других разделов).
    if (name === 'map' && typeof recalculateCellSize === 'function') {
        requestAnimationFrame(() => recalculateCellSize());
    }
}

function openMobileNavSheet() {
    const sheet = document.getElementById('mobile-nav-sheet');
    if (sheet) sheet.classList.add('open');
}
function closeMobileNavSheet() {
    const sheet = document.getElementById('mobile-nav-sheet');
    if (sheet) sheet.classList.remove('open');
}

// ===== Недельный цикл уведомлений VS (Пн=1 ... Сб=6, Вс — без уведомления) =====
let weeklyNotifications = {}; // { "1": {en,ru}, ..., "6": {en,ru} }
const VS_DAY_LABELS_RU = { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота' };
const VS_DAY_LABELS_EN = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const VS_DAY_LABELS_FR = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' };

// Определяет текущий игровой день по московскому времени (сброс в 5 утра —
// до этого часа ещё считается "вчерашний" день). Возвращает { dayNum, dateKey }:
// dayNum 0 = воскресенье (нет уведомления), 1-6 = День 1..6; dateKey — уникальный
// ключ конкретной календарной даты (с учётом сдвига на сброс), нужен, чтобы
// отличить "видел День 1 на этой неделе" от "видел День 1 неделю назад".
function getCurrentVsDayInfo() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(now);
    const get = type => parts.find(p => p.type === type).value;
    const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    let dayNum = weekdayMap[get('weekday')];
    const hour = parseInt(get('hour'));
    let dateKey = `${get('year')}-${get('month')}-${get('day')}`;

    if (hour < 5) {
        // До 5 утра — ещё вчерашний игровой день. Сдвигаем dayNum на -1 (по кругу),
        // а dateKey — на календарные сутки назад (та же логика, что дала бы
        // Intl-форматтеру дату "вчера" по Москве).
        dayNum = (dayNum + 6) % 7; // Mon(1)->Sun(0), Sun(0)->Sat(6), etc.
        const y = new Date(now.getTime() - 24 * 3600 * 1000);
        const yFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
        dateKey = yFmt.format(y);
    }
    return { dayNum, dateKey };
}

function getTodayNotification() {
    const { dayNum } = getCurrentVsDayInfo();
    if (dayNum === 0) return null; // воскресенье — без уведомления
    return weeklyNotifications[String(dayNum)] || null;
}

async function loadNotification() {
    try {
        const res = await fetch('/api/notifications/week');
        weeklyNotifications = await res.json() || {};
    } catch (e) {
        weeklyNotifications = {};
    }
    renderHomeNotification();
    updateCrossNotificationStrip();
}

function renderHomeNotification() {
    const banner = document.getElementById('home-notification-banner');
    const addBtn = document.getElementById('btn-add-notification');
    if (!banner || !addBtn) return;

    const { dayNum } = getCurrentVsDayInfo();
    const today = getTodayNotification();

    if (today) {
        const dayLabels = LANG === 'ru' ? VS_DAY_LABELS_RU : (LANG === 'fr' ? VS_DAY_LABELS_FR : VS_DAY_LABELS_EN);
        const dayPrefix = `${t('home.dayLabel')} ${dayNum} (${dayLabels[dayNum]}): `;
        const hasTranslation = LANG === 'en' || !!today[LANG];
        document.getElementById('home-notification-text').textContent = dayPrefix + (today[LANG] || today.en || '');
        banner.style.display = 'flex';
        addBtn.style.display = 'none';

        // Перевод по требованию — только если для текущего языка сайта его ещё
        // нет (как у статей), не переводим все языки заранее на каждое сохранение.
        const translateBtn = document.getElementById('btn-translate-notification');
        if (translateBtn) translateBtn.style.display = (!hasTranslation && !isViewerMode) ? 'inline' : 'none';
        if (!hasTranslation && isViewerMode) {
            // Зритель не может перевести сам — молча показываем английский (banner
            // уже это делает через today.en fallback), без лишнего тоста тут:
            // не хочется дёргать зрителя всплывающим окном на каждой Главной.
        }

        // "Подробнее" — переход к привязанной статье, если она указана для этого дня
        const detailsBtn = document.getElementById('btn-notification-details');
        if (detailsBtn) {
            if (today.articleId && articlesCache.some(a => a.id === today.articleId)) {
                detailsBtn.style.display = 'inline';
                detailsBtn.dataset.articleId = today.articleId;
            } else {
                detailsBtn.style.display = 'none';
            }
        }
    } else {
        banner.style.display = 'none';
        addBtn.style.display = isViewerMode ? 'none' : 'flex';
    }
}

// Полоска на других разделах — только если сегодняшний день ещё не видели
// именно на Главной (ключ — конкретная календарная дата, не просто номер дня,
// иначе "видел День 1" не сбрасывалось бы неделю за неделей).
function updateCrossNotificationStrip() {
    const strip = document.getElementById('cross-notification-strip');
    if (!strip) return;

    const { dateKey } = getCurrentVsDayInfo();
    const today = getTodayNotification();

    if (currentMobileScreen === 'home' || !today) {
        strip.classList.remove('visible');
        if (currentMobileScreen === 'home' && today) {
            localStorage.setItem('z_notification_seen_date', dateKey);
        }
        return;
    }

    const seenDate = localStorage.getItem('z_notification_seen_date') || '';
    if (seenDate !== dateKey) {
        document.getElementById('cross-notification-text').textContent = today[LANG] || today.en || '';
        strip.classList.add('visible');
    } else {
        strip.classList.remove('visible');
    }
}

function renderWeekEditor() {
    const container = document.getElementById('notif-day-fields');
    if (!container) return;
    const dayLabels = LANG === 'ru' ? VS_DAY_LABELS_RU : (LANG === 'fr' ? VS_DAY_LABELS_FR : VS_DAY_LABELS_EN);
    const tutorials = articlesCache.filter(a => a.category === 'vs_tutorial');
    let html = '';
    for (let d = 1; d <= 6; d++) {
        const dayData = weeklyNotifications[String(d)] || {};
        const existingText = dayData.en || '';
        const existingArticleId = dayData.articleId || '';
        html += `
            <div style="margin-bottom:18px;">
                <label class="section-hint" style="display:block;margin-bottom:6px;">${t('home.dayLabel')} ${d} (${dayLabels[d]})</label>
                <textarea data-day="${d}" placeholder="${t('home.notificationPlaceholder')}" style="width:100%;min-height:60px;background:#10141e;border:1px solid var(--border-color);color:#fff;padding:8px 10px;border-radius:6px;font-size:12px;resize:vertical;margin-bottom:6px;">${existingText.replace(/</g, '&lt;')}</textarea>
                <select data-day-article="${d}" style="width:100%;background:#10141e;border:1px solid var(--border-color);color:#fff;padding:6px 8px;border-radius:6px;font-size:11px;">
                    <option value="">${t('home.noLinkedArticle')}</option>
                    ${tutorials.map(a => {
                        const title = (a.title && (a.title.en || a.title.ru)) || '(untitled)';
                        const selected = a.id === existingArticleId ? 'selected' : '';
                        return `<option value="${a.id}" ${selected}>${escapeHtml(title)}</option>`;
                    }).join('')}
                </select>
            </div>`;
    }
    container.innerHTML = html;
}

async function saveWeekNotifications() {
    const days = {};
    document.querySelectorAll('#notif-day-fields textarea[data-day]').forEach(ta => {
        const d = ta.dataset.day;
        const articleSelect = document.querySelector(`select[data-day-article="${d}"]`);
        days[d] = { text: ta.value.trim(), articleId: articleSelect ? (articleSelect.value || null) : null };
    });
    try {
        const res = await fetch('/api/notifications/week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secretKey: getSecretKey(), days })
        });
        const data = await res.json();
        if (res.ok) {
            weeklyNotifications = data;
            renderHomeNotification();
            updateCrossNotificationStrip();
            showToast(t('home.weekSaved'), 'success');
            showMobileScreen('home');
        } else {
            showToast(data.error || t('home.weekSaveError'), 'error');
        }
    } catch (e) {
        showToast(t('home.weekSaveError'), 'error');
    }
}

// Перевод сегодняшнего дня по требованию (кнопка на баннере Главной) — та же
// логика, что у статей: переводим и сохраняем один раз, следующий читатель на
// этом языке уже получит готовый вариант без повторного обращения к API.
async function translateTodayNotification() {
    if (isViewerMode) return;
    const { dayNum } = getCurrentVsDayInfo();
    if (!dayNum) return;
    const btn = document.getElementById('btn-translate-notification');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`/api/notifications/day/${dayNum}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secretKey: getSecretKey(), targetLang: LANG })
        });
        const data = await res.json();
        if (res.ok) {
            weeklyNotifications[String(dayNum)] = data;
            renderHomeNotification();
            showToast(t('home.notificationSaved'), 'success');
        } else {
            showToast(data.error || t('home.notificationError'), 'error');
        }
    } catch (e) {
        showToast(t('home.notificationError'), 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

(function initMobileNav() {
    // Раньше запускалось только на мобиле — теперь эта же модель навигации
    // (шапка + полноэкранные разделы) работает и на десктопе, разница только
    // в CSS (см. @media (min-width: 701px) в 03-mobile.css).

    // Первый визит — Главная. При возврате открываем тот раздел, где были
    // в прошлый раз (кроме случая, когда там уже сохранена Главная — тогда
    // просто остаёмся на ней).
    const savedScreen = localStorage.getItem('z_last_mobile_screen');
    showMobileScreen(savedScreen || 'home');

    loadNotification();

    const menuBtn = document.getElementById('btn-mobile-menu');
    if (menuBtn) menuBtn.addEventListener('click', openMobileNavSheet);

    const backdrop = document.getElementById('mobile-nav-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeMobileNavSheet);

    // Пункты нижнего меню И карточки на Главной используют один и тот же
    // атрибут data-mobile-screen — обрабатываются одним обработчиком.
    document.querySelectorAll('[data-mobile-screen]').forEach(btn => {
        btn.addEventListener('click', () => showMobileScreen(btn.dataset.mobileScreen));
    });

    const switchUserBtn = document.getElementById('mobile-switch-user');
    if (switchUserBtn) switchUserBtn.addEventListener('click', () => {
        const original = document.getElementById('btn-switch-user');
        if (original) original.click();
    });

    // Редактирование недели — открывает отдельный экран с 6 полями сразу
    // (не поштучные prompt-ы — командиру заполнять/править всю неделю разом).
    const openWeekEditor = () => {
        if (isViewerMode) return;
        renderWeekEditor();
        showMobileScreen('notif-edit');
    };
    const editBtn = document.getElementById('btn-edit-notification');
    if (editBtn) editBtn.addEventListener('click', openWeekEditor);
    const addBtn = document.getElementById('btn-add-notification');
    if (addBtn) addBtn.addEventListener('click', openWeekEditor);

    const backBtn = document.getElementById('btn-notif-edit-back');
    if (backBtn) backBtn.addEventListener('click', () => showMobileScreen('home'));

    const saveWeekBtn = document.getElementById('btn-save-week');
    if (saveWeekBtn) saveWeekBtn.addEventListener('click', saveWeekNotifications);

    const translateNotifBtn = document.getElementById('btn-translate-notification');
    if (translateNotifBtn) translateNotifBtn.addEventListener('click', translateTodayNotification);

    // "Подробнее" — открывает раздел Статьи и сразу нужную статью (не просто
    // категорию), раз для этого дня она явно привязана в редакторе недели.
    const detailsBtn = document.getElementById('btn-notification-details');
    if (detailsBtn) detailsBtn.addEventListener('click', () => {
        const articleId = detailsBtn.dataset.articleId;
        if (!articleId) return;
        showMobileScreen('articles');
        if (typeof openArticleView === 'function') openArticleView(articleId);
    });

    const dismissBtn = document.getElementById('btn-cross-notification-dismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', () => {
        const { dateKey } = getCurrentVsDayInfo();
        localStorage.setItem('z_notification_seen_date', dateKey);
        document.getElementById('cross-notification-strip').classList.remove('visible');
    });
})();

(function initMobileBar() {
    // isMobile() теперь глобальная функция (см. 01-state-grid.js) — раньше была
    // объявлена только тут внутри IIFE, из-за чего вызовы из других файлов падали.

    // На мобиле сайдбар по умолчанию закрыт, карта — во весь экран
    if (isMobile() && DOM.sidebar && !DOM.sidebar.classList.contains('collapsed')) {
        DOM.sidebar.classList.add('collapsed');
        const tgl = document.getElementById('btn-toggle-sidebar');
        if (tgl) tgl.classList.add('collapsed');
    }

    // Запасной вариант на случай, если WebSocket почему-то не пришлёт map_update
    // вовремя — тот же расчёт, но не сработает повторно, если уже применился
    // по факту прихода реальных данных (см. 06-edit-sync.js).
    if (isMobile()) {
        setTimeout(() => {
            if (mobileFitApplied) return;
            mobileFitApplied = true;
            applyMobileFitToScreen();
        }, 300); // после первичного рендера сетки
    }

    const bar = document.getElementById('mobile-bar');
    if (!bar) return;

    const colorRow = document.getElementById('mb-color-row');

    // Подсветка активного инструмента на мобильной панели
    function refreshMbActive() {
        bar.querySelectorAll('[data-mtool]').forEach(btn => {
            btn.classList.toggle('active-tool', btn.dataset.mtool === state.activeTool);
        });
    }

    // Инструменты: стрелка / выбор / купол / ластик / правка / цвета баз.
    // Повторный тап по уже активному инструменту сбрасывает на нейтральный —
    // это и есть способ "отменить"/выйти из инструмента без отдельной кнопки-указателя.
    bar.querySelectorAll('[data-mtool]').forEach(btn => {
        btn.addEventListener('click', () => {
            const isColorSwatch = btn.classList.contains('mb-color');
            if (!isColorSwatch && state.activeTool === btn.dataset.mtool) {
                setTool('neutral');
            } else {
                setTool(btn.dataset.mtool);
            }
            // после выбора цвета — прячем цветовой ряд
            if (isColorSwatch && colorRow) colorRow.classList.remove('open');
            refreshMbActive();
        });
    });

    // Кнопка «База» — показать/спрятать ряд цветов
    const baseToolBtn = document.getElementById('mb-base-tool');
    if (baseToolBtn && colorRow) {
        baseToolBtn.addEventListener('click', () => colorRow.classList.toggle('open'));
    }

    // Игрок: «Моя база» — режим постановки своей базы
    const myBaseBtn = document.getElementById('mb-my-base');
    if (myBaseBtn) {
        myBaseBtn.addEventListener('click', () => {
            if (typeof startPlaceMyBase === 'function') startPlaceMyBase();
            else setTool('place-user-base');
            showToast('Тапни по клетке в Зелёной зоне, чтобы поставить базу', 'info');
        });
    }

    // Игрок: «Профиль» — открыть модалку профиля (секция-профиль в сайдбаре
    // была убрана ещё раньше как дублирующая; кнопка вела в никуда).
    const profileBtn = document.getElementById('mb-profile');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (typeof openOnboardingModal === 'function') openOnboardingModal(true);
        });
    }

    // «К столице» / «Вся карта» — подгоняем масштаб под экран и центрируем на карту.
    // Раньше центрировался элемент .viewport (overflow: hidden, там нечего скроллить) —
    // из-за этого кнопка визуально не работала. Скроллится #map-container.
    const homeBtn = document.getElementById('mb-zoom-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => applyMobileFitToScreen());
    }

    // Командир: «Ещё» — в новой модели навигации "полного сайдбара" на мобиле
    // больше нет (см. .mobile-fullscreen-section в CSS), поэтому открываем то,
    // что и заменило эту роль — нижнее меню с разделами (Статьи/Состав/Сессии).
    const moreBtn = document.getElementById('mb-more');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            if (typeof openMobileNavSheet === 'function') openMobileNavSheet();
        });
    }

    // ДОЛГОЕ НАЖАТИЕ по базе (мобайл) = панель редактирования
    let lpTimer = null;
    let lpStartX = 0, lpStartY = 0;
    const LP_MOVE_TOLERANCE = 10; // px — естественное дрожание пальца не должно отменять long-press

    document.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        // Долгое нажатие открывает редактирование только в режиме "Указатель"
        // (нейтральный инструмент). Раньше срабатывало ВСЕГДА, независимо от
        // активного инструмента — из-за этого, например, чуть задержанный тап по
        // конечной точке стрелки одновременно и рисовал стрелку, и открывал
        // редактирование базы (два независимых действия на один и тот же тап).
        if (state.activeTool !== 'neutral') return;
        const baseEl = e.target.closest('.base-block');
        if (!baseEl) return;
        const t = e.touches[0];
        lpStartX = t.clientX;
        lpStartY = t.clientY;
        lpTimer = setTimeout(() => {
            if (state.activeTool !== 'neutral') return; // инструмент могли сменить за время удержания
            const row = parseInt(baseEl.dataset.row);
            const col = parseInt(baseEl.dataset.col);
            const base = state.bases.find(b => b.row === row && b.col === col);
            if (base && !isViewerMode && typeof openEditBaseModal === 'function') {
                // Long-press уже выполнил действие — когда палец отпустят, не даём
                // touchend/click открыть/переключить то же самое повторно.
                state.suppressNextBaseClick = true;
                openEditBaseModal(base);
            }
        }, 550);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!lpTimer) return;
        const t = e.touches[0];
        if (!t) return;
        const dx = t.clientX - lpStartX;
        const dy = t.clientY - lpStartY;
        if (Math.sqrt(dx * dx + dy * dy) > LP_MOVE_TOLERANCE) {
            clearTimeout(lpTimer);
            lpTimer = null;
        }
    }, { passive: true });

    ['touchend', 'touchcancel'].forEach(ev =>
        document.addEventListener(ev, () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true })
    );
})();

// =============================================================
// I18N (RU/EN) + ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА
// =============================================================
const I18N = {
    ru: {
        'mb.myBase':'Моя база','mb.profile':'Профиль','mb.home':'К столице','mb.base':'База',
        'mb.arrow':'Стрелка','mb.eraser':'Ластик','mb.edit':'Правка','mb.more':'Ещё',
        'mb.select':'Выбор','mb.dome':'Купол','mb.neutral':'Указатель',
        'ob.title':'Профиль игрока','ob.hint':'Введи свой игровой ник — найдём тебя на карте или создадим профиль.',
        'ob.continue':'Продолжить','ob.skip':'Пропустить','ob.create':'Создать профиль',
        'ob.notFound':'Профиль не найден. Заполни данные — создадим новый.',
        'ob.enterNick':'Введи никнейм','ob.found':'Твоя база подсвечена на карте!',
        'hud.capital':'Столица','hud.turrets':'Батареи',
        'ob.editTitle':'Редактирование профиля','ob.save':'Сохранить',
        'sa.title':'Активность состава','sa.searchPlaceholder':'Поиск игрока...',
        'sa.noPlayers':'Нет активных игроков','sa.empty':'Активность пуста',
        'sa.group.other':'Другие','sa.action.help':'помощь','sa.action.assault':'штурм',
        'sa.action.cell':'клетка','sa.action.reserve':'В резерве','sa.status.dome':'КУПОЛ',
        'sa.status.shield':'ЩИТ','sa.status.inactive':'НЕАКТИВЕН','sa.status.active':'АКТИВЕН',
        'sa.role.attack':'Атака','sa.role.defense':'Защита','sa.role.capture':'Захват','sa.role.reinforce':'Подкрепление','sa.action.label':'Направление:',

        // Профиль игрока
        'profile.title':'Профиль игрока','profile.nickname':'Никнейм','profile.allied':'Союзники (вне топ-5)',
        'profile.level':'Ур.','profile.active':'Активен сегодня','profile.save':'Сохранить профиль',
        'profile.placeMyBase':'Поставить свою базу','profile.switchUser':'Не я? Сменить пользователя',
        // Список баз
        'roster.title':'Список баз','roster.regroup':'Группировка на карте',
        'roster.regroupTitle':'Расставить базы на карте кучками по альянсу и роли, вместо одной линии',
        'roster.exportActivity':'Выгрузить активность','roster.exportActivityTitle':'Скачать список: кто под куполом, атакует, помогает или штурмует столицу',
        // Импорт из Excel
        'import.title':'Импорт из Excel',
        'import.hint':'Загрузи .xlsx со списком участников (колонки: Participant, Base Level/Rank, Choice, Combat Power, Registered Combat Role).',
        'import.chooseFile':'Выбрать файл','import.confirm':'Импортировать',
        // Легенда карты
        'legend.title':'Легенда карты','legend.hint':'Справочник по зонам поля боя и координатам.',
        'legend.neutral':'Нейтральная зона','legend.neutralDesc':'Немаркированные пограничные координаты',
        'legend.green':'Зелёная зона','legend.greenDesc':'Безопасный сектор (разрешена постановка личной базы)',
        'legend.gray':'Серая зона (спорная)','legend.grayDesc':'Зона пустошей (щиты/купола баз запрещены)',
        'legend.capital':'Центр столицы','legend.capitalDesc':'Главная цель столицы (постановка базы запрещена)',
        // Разместить базы
        'bases.title':'Разместить базы','bases.hint':'Выбери цвет, затем кликни по сетке — или зажми и веди пальцем/мышью, чтобы расставить сразу несколько баз подряд.',
        'bases.support':'Поддержка и союзники:','bases.enemy':'Вражеские силы:',
        'bases.allied':'Союзная база (Циан)','bases.redEnemy':'Вражеская база (Красный)',
        // Операции
        'ops.title':'Операции','ops.neutral':'Выбор / Перемещение базы (Нейтральный)',
        'ops.arrow':'Нарисовать стрелку движения','ops.dome':'Переключить купол базы (силовое поле)',
        'ops.eraser':'Ластик (удалить базу/стрелку)','ops.select':'Мультивыбор (рамка, 1 альянс)',
        'ops.edit':'Редактировать базу (панель редактирования)',
        // Сессии
        'sessions.title':'Сессии','sessions.namePlaceholder':'Название сессии','sessions.saveLocal':'Сохранить локально',
        'sessions.loadMap':'Загрузить карту','sessions.exportJson':'Экспорт JSON','sessions.importJson':'Импорт JSON',
        'sessions.pasteAi':'Вставить JSON от ИИ','sessions.importPlayer':'Импорт базы игрока','sessions.aiPrompt':'Скопировать промпт для ИИ',
        // HUD прогресса захвата
        'hud.title':'Прогресс захвата','hud.nw':'NW турель','hud.ne':'NE турель','hud.sw':'SW турель','hud.se':'SE турель',
        // Шапка карты
        'header.activeTool':'Активный инструмент:','header.selected':'Выделено баз:','header.clearSelection':'Снять выделение',
        'header.zoomOut':'Уменьшить','header.zoomIn':'Увеличить','header.clearMap':'Очистить карту',
        // Гейт входа
        'gate.title':'Вход в планировщик','gate.hint':'Представься, чтобы продолжить. Командование (R4/R5) войдёт по паролю.',
        'gate.nickname':'Никнейм','gate.password':'Пароль командования','gate.submit':'Войти',
        'toggleSidebar':'Свернуть/развернуть сайдбар',
        // Статьи
        'articles.title':'Статьи','articles.new':'Новая статья','articles.back':'Назад к списку',
        'articles.edit':'Редактировать','articles.delete':'Удалить','articles.cancel':'Отмена',
        'articles.category':'Раздел','articles.titleRu':'Заголовок (RU)','articles.titleEn':'Заголовок (EN)',
        'articles.addImage':'Добавить фото','articles.translate':'Перевести на EN (ИИ)','articles.translateThis':'Перевести эту статью (ИИ)','articles.save':'Сохранить статью',
        'articles.ruDraftLabel':'Черновик на русском (необязательно)','articles.ruDraftTitlePlaceholder':'Заголовок по-русски',
        'articles.ruDraftContentPlaceholder':'Текст статьи по-русски...','articles.translateDraft':'Перевести черновик на английский',
        'articles.needRuDraft':'Заполни заголовок и текст черновика (RU)',
        'articles.cat.charter':'Устав','articles.cat.vs':'Туториалы VS','articles.cat.war':'Межконтинентальная война',
        'articles.empty':'Статей пока нет','articles.confirmDelete':'Удалить статью безвозвратно?',
        'articles.translating':'Переводим статью через ИИ...','articles.translated':'Перевод готов — проверь и подправь при необходимости',
        'articles.translateError':'Не удалось перевести — проверь, что на сервере настроен DEEPSEEK_API_KEY',
        'articles.saved':'Статья сохранена','articles.deleted':'Статья удалена','articles.needTitleContent':'Заполни заголовок и текст (EN)',
        'articles.noTranslation':'Перевод для этого языка ещё не готов',
        // Отчёт активности (выгрузка)
        'report.underDome':'Под куполом','report.baseWord':'база','report.cellWord':'клетка',
        'report.captureTarget':'Столица/турель','report.capture':'Захват','report.attack':'Атака','report.help':'Помощь',
        'report.noActivity':'Без активности','report.title':'Активность альянсов на тактической карте',
        'report.generated':'Сформировано','report.noName':'(без имени)','report.other':'Прочие',
        'report.noBasesError':'На карте пока нет баз для отчёта','report.downloaded':'Отчёт активности скачан',
        'paint.placed':'Поставлено баз',
        'footer.credit':'Сделано специально для ZOG и S72','footer.developer':'Разработчик',
        'nav.map':'Карта','nav.roster':'Состав',
        'nav.home':'Главная','home.addNotification':'Добавить уведомление на сегодня',
        'home.notificationPlaceholder':'Что сделать сегодня по VS? (кратко, на английском)',
        'home.notificationSaved':'Уведомление обновлено','home.notificationCleared':'Уведомление убрано',
        'home.notificationError':'Не удалось сохранить уведомление',
        'home.dayLabel':'День','home.saveWeek':'Сохранить всю неделю',
        'home.editWeekHint':'Заполни один раз — цикл будет повторяться каждую неделю. Пустой день просто не покажется. Пиши по-английски — перевод на другие языки делается по кнопке при чтении, не заранее.',
        'home.weekSaved':'Неделя сохранена','home.weekSaveError':'Не удалось сохранить',
        'home.noLinkedArticle':'Без привязанной статьи','home.moreDetails':'Подробнее',
        'home.translateNotification':'Перевести'
    },
    en: {
        'mb.myBase':'My base','mb.profile':'Profile','mb.home':'To capital','mb.base':'Base',
        'mb.arrow':'Arrow','mb.eraser':'Eraser','mb.edit':'Edit','mb.more':'More',
        'mb.select':'Select','mb.dome':'Dome','mb.neutral':'Pointer',
        'ob.title':'Player profile','ob.hint':'Enter your in-game nickname — we will find you on the map or create a profile.',
        'ob.continue':'Continue','ob.skip':'Skip','ob.create':'Create profile',
        'ob.notFound':'Profile not found. Fill in the details to create a new one.',
        'ob.enterNick':'Enter a nickname','ob.found':'Your base is highlighted on the map!',
        'hud.capital':'Capital','hud.turrets':'Batteries',
        'ob.editTitle':'Edit Profile','ob.save':'Save',
        'sa.title':'Squad Activity','sa.searchPlaceholder':'Search player...',
        'sa.noPlayers':'No active players','sa.empty':'Activity is empty',
        'sa.group.other':'Other','sa.action.help':'help','sa.action.assault':'assault',
        'sa.action.cell':'cell','sa.action.reserve':'In reserve','sa.status.dome':'DOME',
        'sa.status.shield':'SHIELD','sa.status.inactive':'INACTIVE','sa.status.active':'ACTIVE',
        'sa.role.attack':'Attack','sa.role.defense':'Defense','sa.role.capture':'Capture','sa.role.reinforce':'Reinforce','sa.action.label':'Direction:',

        // Player profile
        'profile.title':'Player Profile','profile.nickname':'Nickname','profile.allied':'Allies (outside top-5)',
        'profile.level':'Lvl.','profile.active':'Active today','profile.save':'Save profile',
        'profile.placeMyBase':'Place my base','profile.switchUser':'Not you? Switch user',
        // Base roster
        'roster.title':'Base List','roster.regroup':'Group on map',
        'roster.regroupTitle':'Arrange bases on the map into clusters by alliance and role, instead of one line',
        'roster.exportActivity':'Export activity','roster.exportActivityTitle':'Download a list of who is domed, attacking, reinforcing, or capturing',
        // Excel import
        'import.title':'Import from Excel',
        'import.hint':'Upload a .xlsx roster (columns: Participant, Base Level/Rank, Choice, Combat Power, Registered Combat Role).',
        'import.chooseFile':'Choose file','import.confirm':'Import',
        // Map legend
        'legend.title':'Map Legend','legend.hint':'Reference guide for battlefield zones and coordinates.',
        'legend.neutral':'Neutral Zone','legend.neutralDesc':'Unmapped border coordinates',
        'legend.green':'Green Zone','legend.greenDesc':'Safe sector (personal base placement allowed)',
        'legend.gray':'Contested Gray Zone','legend.grayDesc':'Wasteland zone (no base shields/domes allowed)',
        'legend.capital':'Capital Center','legend.capitalDesc':'Main capital objective (no base placement)',
        // Place bases
        'bases.title':'Place Bases','bases.hint':'Select a color, then click on the grid — or press and drag your finger/mouse to place several bases in a row.',
        'bases.support':'Support & Allies:','bases.enemy':'Enemy Hostilities:',
        'bases.allied':'Allied Base (Cyan)','bases.redEnemy':'Enemy Red Base',
        // Operations
        'ops.title':'Operations','ops.neutral':'Select / Move Base (Neutral)',
        'ops.arrow':'Draw Movement Arrow','ops.dome':'Toggle Base Dome (Forcefield)',
        'ops.eraser':'Eraser (Delete Base/Arrow)','ops.select':'Multi-Select (marquee, 1 alliance)',
        'ops.edit':'Edit Base (edit panel)',
        // Sessions
        'sessions.title':'Sessions','sessions.namePlaceholder':'Session Name','sessions.saveLocal':'Save Local',
        'sessions.loadMap':'Load Map','sessions.exportJson':'Export JSON','sessions.importJson':'Import JSON',
        'sessions.pasteAi':'Paste AI JSON','sessions.importPlayer':'Import Player Base','sessions.aiPrompt':'Copy Prompt for AI',
        // Capture progress HUD
        'hud.title':'Capture Progress','hud.nw':'NW Turret','hud.ne':'NE Turret','hud.sw':'SW Turret','hud.se':'SE Turret',
        // Map header
        'header.activeTool':'Active Tool:','header.selected':'Bases selected:','header.clearSelection':'Clear selection',
        'header.zoomOut':'Zoom Out','header.zoomIn':'Zoom In','header.clearMap':'Clear Map',
        // Entry gate
        'gate.title':'Sign in to the planner','gate.hint':'Introduce yourself to continue. Leadership (R4/R5) signs in with a password.',
        'gate.nickname':'Nickname','gate.password':'Command password','gate.submit':'Enter',
        'toggleSidebar':'Toggle sidebar',
        // Articles
        'articles.title':'Articles','articles.new':'New Article','articles.back':'Back to list',
        'articles.edit':'Edit','articles.delete':'Delete','articles.cancel':'Cancel',
        'articles.category':'Category','articles.titleRu':'Title (RU)','articles.titleEn':'Title (EN)',
        'articles.addImage':'Add photo','articles.translate':'Translate to EN (AI)','articles.translateThis':'Translate this article (AI)','articles.save':'Save article',
        'articles.ruDraftLabel':'Russian draft (optional)','articles.ruDraftTitlePlaceholder':'Title in Russian',
        'articles.ruDraftContentPlaceholder':'Article text in Russian...','articles.translateDraft':'Translate draft to English',
        'articles.needRuDraft':'Fill in the draft title and text (RU)',
        'articles.cat.charter':'Charter','articles.cat.vs':'VS Tutorials','articles.cat.war':'Intercontinental War',
        'articles.empty':'No articles yet','articles.confirmDelete':'Delete this article permanently?',
        'articles.translating':'Translating via AI...','articles.translated':'Translation ready — review and edit if needed',
        'articles.translateError':'Translation failed — check that DEEPSEEK_API_KEY is configured on the server',
        'articles.saved':'Article saved','articles.deleted':'Article deleted','articles.needTitleContent':'Fill in the title and content (EN)',
        'articles.noTranslation':'Translation for this language is not ready yet',
        // Activity report (export)
        'report.underDome':'Under Dome','report.baseWord':'base','report.cellWord':'cell',
        'report.captureTarget':'Capital/Turret','report.capture':'Capture','report.attack':'Attack','report.help':'Reinforce',
        'report.noActivity':'No activity','report.title':'Alliance activity on the tactical map',
        'report.generated':'Generated','report.noName':'(no name)','report.other':'Other',
        'report.noBasesError':'No bases on the map yet for a report','report.downloaded':'Activity report downloaded',
        'paint.placed':'Bases placed',
        'footer.credit':'Made especially for ZOG and S72','footer.developer':'Developer',
        'nav.map':'Map','nav.roster':'Roster',
        'nav.home':'Home','home.addNotification':'Add today\'s notification',
        'home.notificationPlaceholder':'What to do today for VS? (short, in English)',
        'home.notificationSaved':'Notification updated','home.notificationCleared':'Notification cleared',
        'home.notificationError':'Failed to save notification',
        'home.dayLabel':'Day','home.saveWeek':'Save whole week',
        'home.editWeekHint':'Fill in once — the cycle repeats every week. An empty day just won\'t show. Write in English — translation to other languages happens on demand when reading, not upfront.',
        'home.weekSaved':'Week saved','home.weekSaveError':'Failed to save',
        'home.noLinkedArticle':'No linked article','home.moreDetails':'More details',
        'home.translateNotification':'Translate'
    },
    fr: {
        'mb.myBase':'Ma base','mb.profile':'Profil','mb.home':'Vers la capitale','mb.base':'Base',
        'mb.arrow':'Flèche','mb.eraser':'Gomme','mb.edit':'Modifier','mb.more':'Plus',
        'mb.select':'Sélection','mb.dome':'Dôme','mb.neutral':'Curseur',
        'ob.title':'Profil du joueur','ob.hint':'Entre ton pseudo en jeu — on te retrouvera sur la carte ou on créera un profil.',
        'ob.continue':'Continuer','ob.skip':'Passer','ob.create':'Créer le profil',
        'ob.notFound':'Profil introuvable. Remplis les détails pour en créer un nouveau.',
        'ob.enterNick':'Entre un pseudo','ob.found':'Ta base est surlignée sur la carte !',
        'hud.capital':'Capitale','hud.turrets':'Batteries',
        'ob.editTitle':'Modifier le profil','ob.save':'Enregistrer',
        'sa.title':'Activité de la garnison','sa.searchPlaceholder':'Rechercher un joueur...',
        'sa.noPlayers':'Aucun joueur actif','sa.empty':'Aucune activité',
        'sa.group.other':'Autre','sa.action.help':'aide','sa.action.assault':'assaut',
        'sa.action.cell':'case','sa.action.reserve':'En réserve','sa.status.dome':'DÔME',
        'sa.status.shield':'BOUCLIER','sa.status.inactive':'INACTIF','sa.status.active':'ACTIF',
        'sa.role.attack':'Attaque','sa.role.defense':'Défense','sa.role.capture':'Capture','sa.role.reinforce':'Renfort','sa.action.label':'Direction :',

        // Profil du joueur
        'profile.title':'Profil du joueur','profile.nickname':'Pseudo','profile.allied':'Alliés (hors top 5)',
        'profile.level':'Niv.','profile.active':'Actif aujourd\'hui','profile.save':'Enregistrer le profil',
        'profile.placeMyBase':'Placer ma base','profile.switchUser':'Pas toi ? Changer d\'utilisateur',
        // Liste des bases
        'roster.title':'Liste des bases','roster.regroup':'Regrouper sur la carte',
        'roster.regroupTitle':'Regrouper les bases sur la carte par alliance et par rôle, plutôt qu\'en une seule ligne',
        'roster.exportActivity':'Exporter l\'activité','roster.exportActivityTitle':'Télécharger la liste : qui est sous dôme, attaque, renforce ou capture',
        // Import Excel
        'import.title':'Import depuis Excel',
        'import.hint':'Charge un fichier .xlsx (colonnes : Participant, Niveau/Rang de base, Choix, Puissance de combat, Rôle de combat déclaré).',
        'import.chooseFile':'Choisir un fichier','import.confirm':'Importer',
        // Légende de la carte
        'legend.title':'Légende de la carte','legend.hint':'Guide de référence pour les zones du champ de bataille et les coordonnées.',
        'legend.neutral':'Zone neutre','legend.neutralDesc':'Coordonnées frontalières non cartographiées',
        'legend.green':'Zone verte','legend.greenDesc':'Secteur sûr (placement de base personnelle autorisé)',
        'legend.gray':'Zone grise contestée','legend.grayDesc':'Zone désolée (boucliers/dômes de base interdits)',
        'legend.capital':'Centre de la capitale','legend.capitalDesc':'Objectif principal de la capitale (placement de base interdit)',
        // Placer des bases
        'bases.title':'Placer des bases','bases.hint':'Choisis une couleur, puis clique sur la grille — ou maintiens et fais glisser ton doigt/ta souris pour placer plusieurs bases d\'affilée.',
        'bases.support':'Soutien et alliés :','bases.enemy':'Forces ennemies :',
        'bases.allied':'Base alliée (Cyan)','bases.redEnemy':'Base ennemie rouge',
        // Opérations
        'ops.title':'Opérations','ops.neutral':'Sélectionner / Déplacer une base (Neutre)',
        'ops.arrow':'Dessiner une flèche de mouvement','ops.dome':'Activer/désactiver le dôme de base (bouclier)',
        'ops.eraser':'Gomme (supprimer base/flèche)','ops.select':'Sélection multiple (cadre, 1 alliance)',
        'ops.edit':'Modifier la base (panneau d\'édition)',
        // Sessions
        'sessions.title':'Sessions','sessions.namePlaceholder':'Nom de la session','sessions.saveLocal':'Enregistrer localement',
        'sessions.loadMap':'Charger la carte','sessions.exportJson':'Exporter en JSON','sessions.importJson':'Importer un JSON',
        'sessions.pasteAi':'Coller un JSON de l\'IA','sessions.importPlayer':'Importer la base d\'un joueur','sessions.aiPrompt':'Copier le prompt pour l\'IA',
        // HUD de progression de capture
        'hud.title':'Progression de la capture','hud.nw':'Tourelle NO','hud.ne':'Tourelle NE','hud.sw':'Tourelle SO','hud.se':'Tourelle SE',
        // En-tête de la carte
        'header.activeTool':'Outil actif :','header.selected':'Bases sélectionnées :','header.clearSelection':'Effacer la sélection',
        'header.zoomOut':'Zoom arrière','header.zoomIn':'Zoom avant','header.clearMap':'Effacer la carte',
        // Portail d'entrée
        'gate.title':'Connexion au planificateur','gate.hint':'Présente-toi pour continuer. Le commandement (R4/R5) se connecte avec un mot de passe.',
        'gate.nickname':'Pseudo','gate.password':'Mot de passe de commandement','gate.submit':'Entrer',
        'toggleSidebar':'Afficher/masquer le panneau',
        // Articles
        'articles.title':'Articles','articles.new':'Nouvel article','articles.back':'Retour à la liste',
        'articles.edit':'Modifier','articles.delete':'Supprimer','articles.cancel':'Annuler',
        'articles.category':'Catégorie','articles.titleRu':'Titre (RU)','articles.titleEn':'Titre (EN)',
        'articles.addImage':'Ajouter une photo','articles.translate':'Traduire en EN (IA)','articles.translateThis':'Traduire cet article (IA)','articles.save':'Enregistrer l\'article',
        'articles.ruDraftLabel':'Brouillon en russe (facultatif)','articles.ruDraftTitlePlaceholder':'Titre en russe',
        'articles.ruDraftContentPlaceholder':'Texte de l\'article en russe...','articles.translateDraft':'Traduire le brouillon en anglais',
        'articles.needRuDraft':'Remplis le titre et le texte du brouillon (RU)',
        'articles.cat.charter':'Charte','articles.cat.vs':'Tutoriels VS','articles.cat.war':'Guerre intercontinentale',
        'articles.empty':'Aucun article pour l\'instant','articles.confirmDelete':'Supprimer cet article définitivement ?',
        'articles.translating':'Traduction via IA...','articles.translated':'Traduction prête — vérifie et corrige si nécessaire',
        'articles.translateError':'Échec de la traduction — vérifie que DEEPSEEK_API_KEY est configuré sur le serveur',
        'articles.saved':'Article enregistré','articles.deleted':'Article supprimé','articles.needTitleContent':'Remplis le titre et le contenu (EN)',
        'articles.noTranslation':'La traduction pour cette langue n\'est pas encore prête',
        // Rapport d'activité (export)
        'report.underDome':'Sous dôme','report.baseWord':'base','report.cellWord':'case',
        'report.captureTarget':'Capitale/Tourelle','report.capture':'Capture','report.attack':'Attaque','report.help':'Renfort',
        'report.noActivity':'Aucune activité','report.title':'Activité de l\'alliance sur la carte tactique',
        'report.generated':'Généré le','report.noName':'(sans nom)','report.other':'Autres',
        'report.noBasesError':'Aucune base sur la carte pour l\'instant','report.downloaded':'Rapport d\'activité téléchargé',
        'paint.placed':'Bases placées',
        'footer.credit':'Fait spécialement pour ZOG et S72','footer.developer':'Développeur',
        'nav.map':'Carte','nav.roster':'Effectif',
        'nav.home':'Accueil','home.addNotification':'Ajouter une annonce du jour',
        'home.notificationPlaceholder':'Que faire aujourd\'hui pour le VS ? (bref, en anglais)',
        'home.notificationSaved':'Annonce mise à jour','home.notificationCleared':'Annonce supprimée',
        'home.notificationError':'Échec de l\'enregistrement de l\'annonce',
        'home.dayLabel':'Jour','home.saveWeek':'Enregistrer toute la semaine',
        'home.editWeekHint':'Remplis une seule fois — le cycle se répète chaque semaine. Un jour vide ne s\'affichera simplement pas. Écris en anglais — la traduction vers d\'autres langues se fait à la demande à la lecture, pas à l\'avance.',
        'home.weekSaved':'Semaine enregistrée','home.weekSaveError':'Échec de l\'enregistrement',
        'home.noLinkedArticle':'Aucun article lié','home.moreDetails':'Plus de détails',
        'home.translateNotification':'Traduire'
    }
};
let LANG = localStorage.getItem('z_lang') || 'en';
function t(key) { return (I18N[LANG] && I18N[LANG][key]) || I18N.ru[key] || key; }
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
}
(function initLangSwitcher() {
    // Раньше на десктопе жил в шапке карты (.viewport-header) — теперь везде
    // одна и та же новая верхняя шапка, видна независимо от открытого раздела.
    const header = document.getElementById('mobile-top-header')
        || document.querySelector('.viewport-header')
        || document.body;
    const sel = document.createElement('select');
    sel.id = 'lang-switcher';
    sel.innerHTML = '<option value="ru">RU</option><option value="en">EN</option><option value="fr">FR</option>';
    sel.value = LANG;
    sel.style.cssText = 'margin-left:auto;background:#10141e;color:#fff;border:1px solid var(--border-color);border-radius:6px;padding:3px 6px;font-size:11px;';
    sel.addEventListener('change', () => {
        localStorage.setItem('z_lang', sel.value);
        location.reload();
    });
    header.appendChild(sel);
    applyI18n();
})();

// =============================================================
// ОНБОРДИНГ ИГРОКА: найти себя по нику или создать профиль
// =============================================================
function focusBaseOnMap(b) {
    const vp = DOM.mapContainer;
    const px = (b.col + 0.5) * state.cellSize * state.zoomScale;
    const py = (b.row + 0.5) * state.cellSize * state.zoomScale;
    vp.scrollLeft = px - vp.clientWidth / 2;
    vp.scrollTop = py - vp.clientHeight / 2;
    const el = DOM.basesOverlay.querySelector(`.base-block[data-row="${b.row}"][data-col="${b.col}"]`);
    if (el) {
        el.classList.add('highlight-ping');
        setTimeout(() => el.classList.remove('highlight-ping'), 3000);
    }
}
(function initOnboarding() {
    // Раньше эта IIFE сама решала, когда показать модалку (viewer + не онбордился +
    // таймаут 1200мс). Теперь показом управляет единый гейт входа (см. showEntryGateModal
    // и continueToProfileStep) — тут остаётся только разводка кнопок submit/skip.
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;
    const nickInput = document.getElementById('ob-nickname');
    const extra = document.getElementById('ob-extra');
    const hint = document.getElementById('ob-hint');
    const submit = document.getElementById('ob-submit');
    const skip = document.getElementById('ob-skip');

    submit.addEventListener('click', () => {
        const nick = nickInput.value.trim();
        if (!nick) { showToast(t('ob.enterNick'), 'error'); return; }
        const found = state.bases.find(b => b.player && b.player.name
            && b.player.name.toLowerCase() === nick.toLowerCase());
        if (found) {
            DOM.profileNickname.value = nick;
            localStorage.setItem('z_onboard_done', '1');
            modal.classList.remove('active');
            if (extra.style.display === 'flex') {
                // Открыто в режиме редактирования (кнопка "Профиль") — применяем
                // изменённые поля к найденной базе, а не просто фокусируемся на ней.
                if (!found.player) found.player = { name: nick };
                found.color = document.getElementById('ob-alliance').value;
                found.player.level = parseInt(document.getElementById('ob-level').value) || 1;
                found.player.role = document.getElementById('ob-role').value;
                found.player.rank = document.getElementById('ob-rank').value;
                const obActiveEl = document.getElementById('ob-active');
                found.player.active = obActiveEl ? obActiveEl.checked : true;
                renderBases();
                showToast('Профиль обновлён', 'success');
                notifyServerOfMapChange();
            } else {
                focusBaseOnMap(found);
                showToast(t('ob.found'), 'success');
            }
        } else if (extra.style.display !== 'flex') {
            // Поле "extra" ещё не открыто — раскрываем и просим заполнить детали.
            // Если гейт входа уже открыл его заранее (предзаполнив ник/ранг), эта
            // ветка не сработает, и следующий клик сразу создаст профиль.
            extra.style.display = 'flex';
            hint.textContent = t('ob.notFound');
            submit.textContent = t('ob.create');
        } else {
            // создаём профиль через существующую логику сохранения (скрытые поля —
            // просто мост для передачи данных в saveProfile(), сама секция
            // "Профиль игрока" в сайдбаре убрана как дублирующая эту форму).
            DOM.profileNickname.value = nick;
            document.getElementById('profile-alliance').value = document.getElementById('ob-alliance').value;
            document.getElementById('profile-level').value = document.getElementById('ob-level').value || 1;
            document.getElementById('profile-role').value = document.getElementById('ob-role').value;
            const pr = document.getElementById('profile-rank');
            if (pr) pr.value = document.getElementById('ob-rank').value;
            const obActiveEl2 = document.getElementById('ob-active');
            const profileActiveEl = document.getElementById('profile-active');
            if (profileActiveEl) profileActiveEl.checked = obActiveEl2 ? obActiveEl2.checked : true;
            localStorage.setItem('z_onboard_done', '1');
            modal.classList.remove('active');
            DOM.btnSaveProfile.click();
        }
    });
    skip.addEventListener('click', () => {
        localStorage.setItem('z_onboard_done', '1');
        modal.classList.remove('active');
    });
})();

// =============================================================
// МОБИЛЬНЫЙ ПРОГРЕСС ЗАХВАТА: тап по столице/батарее → всплывашка
// (панель capture-hud на мобиле скрыта CSS-ом; бары на объектах остаются)
// =============================================================
document.addEventListener('click', (e) => {
    if (window.innerWidth > 700) return;
    // Раньше всплывашка появлялась ВСЕГДА при тапе по столице/турели, даже если
    // в этот момент рисовалась стрелка на неё как на цель — два всплывающих
    // сообщения одновременно маскировали подсказку "Set target cell...".
    // Инфо-попап уместен только когда активного инструмента нет (обычный просмотр).
    if (state.activeTool !== 'neutral') return;
    const capEl = e.target.closest('.capital-center-target');
    const turEl = e.target.closest('.capital-turret-target');
    if (!capEl && !turEl) return;
    const read = id => { const el = document.getElementById(id); return el ? el.textContent : '—'; };
    if (capEl) {
        showToast(`${t('hud.capital')}: ${read('hud-text-center')}`, 'info');
    } else {
        showToast(`${t('hud.turrets')}: NW ${read('hud-text-nw')} · NE ${read('hud-text-ne')} · SW ${read('hud-text-sw')} · SE ${read('hud-text-se')}`, 'info');
    }
});
