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
    }
}, { passive: true });

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
(function initMobileBar() {
    const isMobile = () => window.innerWidth <= 700;

    // На мобиле сайдбар по умолчанию закрыт, карта — во весь экран
    if (isMobile() && DOM.sidebar && !DOM.sidebar.classList.contains('collapsed')) {
        DOM.sidebar.classList.add('collapsed');
        const tgl = document.getElementById('btn-toggle-sidebar');
        if (tgl) tgl.classList.add('collapsed');
    }

    // При старте на мобиле центрируем карту на столице (она в центре сетки),
    // чтобы не начинать с пустого левого верхнего угла.
    if (isMobile()) {
        setTimeout(() => {
            const vp = DOM.mapContainer;
            if (vp) {
                // Стартуем с видом на всю карту целиком, а не с "приближенного" куска —
                // иначе игрок открывает планировщик и не понимает, на что смотрит.
                state.zoomScale = computeFitZoomScale();
                applyZoom();
                vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
                vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
            }
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

    // Игрок: «Профиль» — открыть сайдбар с секцией профиля
    const profileBtn = document.getElementById('mb-profile');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            DOM.sidebar.classList.remove('collapsed');
            const sec = document.getElementById('section-profile');
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // «К столице» / «Вся карта» — подгоняем масштаб под экран и центрируем на карту.
    // Раньше центрировался элемент .viewport (overflow: hidden, там нечего скроллить) —
    // из-за этого кнопка визуально не работала. Скроллится #map-container.
    const homeBtn = document.getElementById('mb-zoom-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            const vp = DOM.mapContainer;
            state.zoomScale = computeFitZoomScale();
            applyZoom();
            if (vp) {
                vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
                vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
            }
        });
    }

    // Командир: «Ещё» — открыть полный сайдбар (все секции)
    const moreBtn = document.getElementById('mb-more');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            DOM.sidebar.classList.toggle('collapsed');
        });
    }

    // ДОЛГОЕ НАЖАТИЕ по базе (мобайл) = панель редактирования
    let lpTimer = null;
    let lpStartX = 0, lpStartY = 0;
    const LP_MOVE_TOLERANCE = 10; // px — естественное дрожание пальца не должно отменять long-press

    document.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        const baseEl = e.target.closest('.base-block');
        if (!baseEl) return;
        const t = e.touches[0];
        lpStartX = t.clientX;
        lpStartY = t.clientY;
        lpTimer = setTimeout(() => {
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
        'sa.role.attack':'Атака','sa.role.defense':'Защита','sa.role.capture':'Захват','sa.role.reinforce':'Подкрепление','sa.action.label':'Направление:'
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
        'sa.role.attack':'Attack','sa.role.defense':'Defense','sa.role.capture':'Capture','sa.role.reinforce':'Reinforce','sa.action.label':'Direction:'
    }
};
let LANG = localStorage.getItem('z_lang') || ((navigator.language||'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en');
function t(key) { return (I18N[LANG] && I18N[LANG][key]) || I18N.ru[key] || key; }
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
}
(function initLangSwitcher() {
    const header = document.querySelector('.viewport-header') || document.body;
    const sel = document.createElement('select');
    sel.id = 'lang-switcher';
    sel.innerHTML = '<option value="ru">RU</option><option value="en">EN</option>';
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
            // создаём профиль через существующую логику сохранения
            DOM.profileNickname.value = nick;
            document.getElementById('profile-alliance').value = document.getElementById('ob-alliance').value;
            document.getElementById('profile-level').value = document.getElementById('ob-level').value || 1;
            document.getElementById('profile-role').value = document.getElementById('ob-role').value;
            const pr = document.getElementById('profile-rank');
            if (pr) pr.value = document.getElementById('ob-rank').value;
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
