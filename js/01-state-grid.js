// ===== 01/9: STATE, DOM, КОНСТАНТЫ, СЕТКА ===== (грузить первым — определяет state/DOM для всех остальных файлов)
/**
 * Z Route Redemption - Battle Map Editor
 * Main Application Logic
 */

// Application State
const state = {
    gridWidth: 48,
    gridHeight: 48,
    cellSize: 40, // pixels (matches --cell-size in CSS)
    coordOffset: { x: 428, y: 428 }, // game coordinate offset (grid col 0 = game X 428)
    cells: {}, // key: "row-col", value: "green-zone" | "gray-zone" | "capital" | "neutral"
    bases: [], // array of { id, row, col, color, shield, dome } - row/col are top-left of grid cell
    arrows: [], // array of { id, startCell: {row, col}, endCell: {row, col}, color }
    markers: [], // array of { id, row, col, icon, label }
    activeTool: 'neutral', // neutral, green-zone, gray-zone, capital, base-coral, base-blue, base-green, base-yellow, base-purple, base-red, arrow, dome, shield, eraser
    activeArrowColor: '#ff4757', // default red
    zoomScale: 1.0,
    
    // UI state
    isPainting: false,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panContainerOffset: { x: 0, y: 0 }, // кэш offsetLeft/Top на время пана (не меняется в процессе)
    scrollStart: { x: 0, y: 0 },
    
    // Arrow drawing state
    isDrawingArrow: false,
    arrowStartCell: null,
    
    // Base dragging state
    isDraggingBase: false,
    draggedBaseId: null,
    dragOffset: { x: 0, y: 0 },
    originalPos: { row: 0, col: 0 },
    
    // Zone rectangle drawing state
    isDrawingZone: false,
    zoneStartCell: null,
    zoneEndCell: null,
    
    // Performance cached variables
    previewCells: [],
    wrapperRect: null,
    cellElements: null, // 2D array [row][col] for O(1) cell lookups
    draggedEl: null,    // cached reference to dragged base DOM element
    suppressNextBaseClick: false, // не даём действию по базе выполниться дважды (тач-tap + следующий native click)

    // Multi-select state (Commander tool)
    selectedIds: [],        // ids of selected bases (single alliance only)
    selectionColor: null,   // alliance color of the current selection
    isMarquee: false,       // rectangle selection in progress
    marqueeStartPx: null,   // {x, y} px relative to map wrapper
    marqueeEl: null,        // live DOM element of the selection rectangle
    groupDrag: null         // [{id, origRow, origCol, el}] when dragging a group
};

// Режим (viewer/commander) раньше вычислялся один раз из URL при загрузке.
// Теперь может измениться после единого экрана входа (никнейм + ранг + пароль
// для R4/R5) — поэтому это переменные, а не константы. Старые прямые ссылки
// ?key=1234 / ?key=1998 по-прежнему работают как раньше (гейт входа для них
// пропускается, см. INITIALIZATION).
const urlParams = new URLSearchParams(window.location.search);
const urlSecretKey = urlParams.get('key');
let enteredCommanderPassword = ''; // пароль, введённый через новый гейт (не из URL)

// Была локальной внутри IIFE в 09-mobile-i18n.js — код в 06-edit-sync.js вызывал
// её же по имени, но т.к. она не была глобальной, это кидало ReferenceError на
// каждое обновление карты (мягко проглатывалось браузером, но подгонка карты
// под экран через этот путь никогда реально не срабатывала). Теперь глобальная.
function isMobile() {
    return window.innerWidth <= 700;
}
let mobileFitApplied = false; // подгонка карты под экран на мобиле — делаем один раз, по факту готовности данных, а не по таймеру

// Ник игрока, чью базу нужно найти и показать на карте, как только базы реально
// придут с сервера. На момент решения "кто сейчас залогинен" (см. initEntryGate
// в 08-bindings-init.js) WebSocket ещё не успевает синхронизировать state.bases —
// поэтому сам focusBaseOnMap выполняется позже, в обработчике map_update
// (06-edit-sync.js), а не сразу.
let pendingFocusNickname = null;

// Вызывается из обработчика map_update (06-edit-sync.js), когда state.bases уже
// точно заполнен с сервера. Срабатывает максимум один раз за сессию (сразу
// обнуляет флаг), чтобы карта не "прыгала" обратно к своей базе при каждом
// последующем обновлении (например, когда кто-то другой подвинул свою базу).
function focusPendingUserBase() {
    if (!pendingFocusNickname) return;
    const nickname = pendingFocusNickname;
    pendingFocusNickname = null;
    const myBase = state.bases.find(b => b.player && b.player.name
        && b.player.name.toLowerCase() === nickname.toLowerCase());
    if (myBase && typeof focusBaseOnMap === 'function') focusBaseOnMap(myBase);
}
// Пароли командования больше не сравниваются в клиентском коде (раньше тут
// лежали строки '1234'/'1998' открытым текстом — их было видно любому через
// "просмотр кода страницы", даже если человек никогда не открывал гейт входа).
// Режим по умолчанию — зритель, пока сервер не подтвердит пароль через
// /api/verify-key (см. INITIALIZATION и showEntryGateModal в 08-bindings-init.js).
let isCommanderMode = false;
let isViewerMode = true;
let showAiTools = false;

// Ключ, который реально уходит на сервер при командирских операциях — либо тот,
// что ввели через гейт входа, либо старый способ через ?key= в ссылке.
function getSecretKey() {
    return enteredCommanderPassword || urlSecretKey || '';
}

// Спрашивает сервер, валиден ли пароль, и админский ли он (доп. AI-инструменты).
// Сами пароли живут только в .env на сервере и никогда не попадают в клиентский код.
async function verifySecretKey(key) {
    if (!key) return { valid: false, isAdmin: false };
    try {
        const res = await fetch('/api/verify-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secretKey: key })
        });
        if (!res.ok) return { valid: false, isAdmin: false };
        return await res.json();
    } catch (e) {
        console.error('Ошибка проверки пароля:', e);
        return { valid: false, isAdmin: false };
    }
}

// Применяет текущий режим (viewer/commander) к интерфейсу. Вызывается один раз
// сразу при загрузке (с тем, что известно на старте) и повторно — после того как
// человек пройдёт единый гейт входа, если это изменило режим.
function applyModeToUI() {
    document.body.classList.toggle('viewer-mode', isViewerMode);

    if (showAiTools) {
        if (DOM.btnPasteJson) DOM.btnPasteJson.style.display = 'block';
        if (DOM.btnAiPrompt) DOM.btnAiPrompt.style.display = 'block';
    } else {
        if (DOM.btnPasteJson) DOM.btnPasteJson.style.display = 'none';
        if (DOM.btnAiPrompt) DOM.btnAiPrompt.style.display = 'none';
    }

    if (DOM.currentToolText) {
        DOM.currentToolText.innerText = isViewerMode ? "Read-Only Viewer" : "Neutral Zone";
    }
    const statusTextEl = document.querySelector('.status-text');
    if (statusTextEl) {
        statusTextEl.innerHTML = isViewerMode ? `Mode: <strong>Read-Only Viewer</strong>` : `Mode: <strong>Commander</strong>`;
    }

    // "Поставить свою базу" — виewer-специфичное действие, командирам не нужно
    const btnPlaceMyBaseHeader = document.getElementById('btn-place-my-base');
    if (btnPlaceMyBaseHeader) btnPlaceMyBaseHeader.style.display = isViewerMode ? 'flex' : 'none';
}

// Цвет стрелки для каждого альянса (Правило 3: стрелка = цвет альянса-источника)
const ALLIANCE_ARROW_COLORS = {
    coral:  '#ff7f50', // ZOG
    blue:   '#1e90ff', // S72 (Rubi)
    green:  '#2ed573', // FoE
    yellow: '#ffd32a', // FoE2
    purple: '#a55eea', // BfE
    brown:  '#a0522d', // UBB
    indigo: '#6c5ce7', // Kill
    allied: '#00cfd1', // Союзники вне топа
    red:    '#ff4757'  // Враг
};

// Человекочитаемые названия альянсов по цвету базы (для списка баз, подсказок и т.п.)
const ALLIANCE_LABELS = {
    coral:  'ZOG',
    blue:   'S72 (Rubi)',
    green:  'FoE',
    yellow: 'FoE2',
    purple: 'BfE',
    brown:  'UBB',
    indigo: 'Kill',
    allied: 'Союзники (вне топ-5)',
    red:    'Вражеские силы'
};

// Возвращает название клетки для текстовых сообщений (кому идёт стрелка и т.п.).
// Использовалась в renderSquadActivity, но раньше нигде не была определена —
// весь блок падал с ошибкой, если у игрока была хоть одна исходящая стрелка.
function getCellName(row, col) {
    const base = state.bases.find(b => isCellInBase(row, col, b));
    if (base) {
        const name = base.player ? base.player.name : (ALLIANCE_LABELS[base.color] || base.color);
        return { name, isBase: true, isCapital: false };
    }
    if (state.cells[`${row}-${col}`] === 'capital') {
        const marker = state.markers.find(m => m.row === row && m.col === col);
        return { name: marker ? marker.label : 'Capital', isBase: false, isCapital: true };
    }
    return { name: '', isBase: false, isCapital: false };
}

// Общая функция скрытия сайдбара — используется и кнопкой-гамбургером, и переходом
// к базе из списка. Раньше эти два места расходились (гамбургер ещё переключал
// свою иконку/класс кнопки) — теперь оба используют одно и то же.
function collapseSidebar() {
    // Сайдбар-панель как концепция полностью заменена новой моделью экранов
    // (шапка + полноэкранные разделы) — теперь на всех размерах экрана.
    // "Скрыть то, что перекрывает карту" значит "вернуться на Карту".
    if (typeof showMobileScreen === 'function') showMobileScreen('map');
}

// Обёртка над focusBaseOnMap для вызова из inline onclick по row/col — используется
// в Squad Activity и в списке баз по альянсам. Раньше вызывалась в Squad Activity,
// но нигде не была определена — клик по строке ничего не делал.
function focusBaseOnMapCoordinates(row, col) {
    const b = state.bases.find(x => x.row === row && x.col === col);
    if (!b) return;
    const wasOpen = DOM.sidebar && !DOM.sidebar.classList.contains('collapsed');
    collapseSidebar();
    if (wasOpen) {
        // Сайдбар только начал закрываться (анимация ~0.3с) — ждём её завершения,
        // иначе центрирование на карте считается по ещё не расширившемуся вьюпорту.
        setTimeout(() => focusBaseOnMap(b), 320);
    } else {
        focusBaseOnMap(b);
    }
}

// DOM Elements
const DOM = {
    grid: document.getElementById('grid'),
    basesOverlay: document.getElementById('bases-overlay'),
    markersOverlay: document.getElementById('markers-overlay'),
    arrowsGroup: document.getElementById('arrows-group'),
    tempArrow: document.getElementById('temp-arrow'),
    arrowOverlay: document.getElementById('arrow-overlay'),
    mapContainer: document.getElementById('map-container'),
    mapCanvasWrapper: document.getElementById('map-canvas-wrapper'),
    
    // Inputs/Controls
    gridWidthInput: document.getElementById('grid-width'),
    gridHeightInput: document.getElementById('grid-height'),
    btnResize: document.getElementById('btn-resize'),
    currentToolText: document.getElementById('current-tool-text'),
    zoomLevelText: document.getElementById('zoom-level'),
    selectionIndicator: document.getElementById('selection-indicator'),
    selectionCountText: document.getElementById('selection-count-text'),
    btnClearSelection: document.getElementById('btn-clear-selection'),
    sessionNameInput: document.getElementById('session-name'),
    
    // Buttons
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnClearAll: document.getElementById('btn-clear-all'),
    btnSave: document.getElementById('btn-save'),
    btnLoadList: document.getElementById('btn-load-list'),
    btnExport: document.getElementById('btn-export'),
    importFile: document.getElementById('import-file'),
    btnAiPrompt: document.getElementById('btn-ai-prompt'),
    
    // Modal
    loadModal: document.getElementById('load-modal'),
    sessionList: document.getElementById('session-list'),
    closeModal: document.getElementById('close-modal'),
    
    // Paste JSON Modal
    pasteModal: document.getElementById('paste-modal'),
    closePasteModal: document.getElementById('close-paste-modal'),
    btnPasteJson: document.getElementById('btn-paste-json'),
    pasteJsonTextarea: document.getElementById('paste-json-textarea'),
    btnLoadPasted: document.getElementById('btn-load-pasted'),
    
    // Edit Player Base Modal
    editBaseModal: document.getElementById('edit-base-modal'),
    closeEditBaseModal: document.getElementById('close-edit-base-modal'),
    editBaseName: document.getElementById('edit-base-name'),
    editBaseColor: document.getElementById('edit-base-color'),
    editBaseLevel: document.getElementById('edit-base-level'),
    editBaseRole: document.getElementById('edit-base-role'),
    editBaseActive: document.getElementById('edit-base-active'),
    btnSaveEditBase: document.getElementById('btn-save-edit-base'),
    
    // Profile Elements
    btnShowProfile: document.getElementById('btn-show-profile'),
    btnImportPlayer: document.getElementById('btn-import-player'),
    profileNickname: document.getElementById('profile-nickname'),
    profileAlliance: document.getElementById('profile-alliance'),
    profileRank: document.getElementById('profile-rank'),
    profileLevel: document.getElementById('profile-level'),
    profileRole: document.getElementById('profile-role'),
    profileActive: document.getElementById('profile-active'),
    profileActions: document.getElementById('profile-actions'),
    btnSaveProfile: document.getElementById('btn-save-profile'),
    btnPlaceMyBase: document.getElementById('btn-place-my-base'),
    
    // Sidebar Collapsible Elements
    sidebar: document.querySelector('.sidebar'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    
    // Cached toast element
    toast: null
};

// Pre-cache tool buttons for setTool (avoids querySelectorAll on every call)
const toolButtons = document.querySelectorAll('.tool-btn, .base-btn, .tool-btn-small');

// Helper: Show custom toast message
let toastTimer = 0;
function showToast(message, type = 'info') {
    if (!DOM.toast) {
        DOM.toast = document.createElement('div');
        DOM.toast.className = 'toast';
        document.body.appendChild(DOM.toast);
    }
    
    // Reset classes
    DOM.toast.className = 'toast';
    if (type === 'success') DOM.toast.classList.add('toast-success');
    
    // Set icon & text
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    DOM.toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    
    // Trigger animation
    DOM.toast.classList.add('show');
    
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, 3000);
}

// -------------------------------------------------------------
// GRID MANAGEMENT
// -------------------------------------------------------------

// Recalculate cellSize based on container dimensions to fit within single screen
function recalculateCellSize() {
    const contWidth = DOM.mapContainer.clientWidth || (window.innerWidth - 380);
    const contHeight = DOM.mapContainer.clientHeight || (window.innerHeight - 80);
    
    const availW = contWidth - 60; // 30px padding on each side
    const availH = contHeight - 60;
    
    let calculatedSize = Math.floor(Math.min(availW / state.gridWidth, availH / state.gridHeight));
    
    // На телефоне НЕ ужимаем карту под экран: держим размер «как на ПК»
    // (клетка минимум 20px). Карта больше экрана — двигаем пальцем, зато всё видно.
    if (window.innerWidth <= 700) {
        calculatedSize = Math.max(calculatedSize, 20);
    }
    
    // Clamp cell size (одинаково для ПК и телефона — на мобиле масштаб даёт pinch-zoom)
    state.cellSize = Math.max(5, Math.min(60, calculatedSize));
    
    // Update CSS variable
    document.documentElement.style.setProperty('--cell-size', `${state.cellSize}px`);
}

// Build grid elements based on state.gridWidth & state.gridHeight
function buildGrid() {
    recalculateCellSize();
    
    DOM.grid.innerHTML = '';
    DOM.grid.style.gridTemplateColumns = `repeat(${state.gridWidth}, var(--cell-size))`;
    DOM.grid.style.gridTemplateRows = `repeat(${state.gridHeight}, var(--cell-size))`;
    
    // Set wrapper size explicitly for correct positioning overlays
    DOM.mapCanvasWrapper.style.width = `${state.gridWidth * state.cellSize}px`;
    DOM.mapCanvasWrapper.style.height = `${state.gridHeight * state.cellSize}px`;
    
    // Build 2D lookup array and use DocumentFragment for batch DOM insertion
    state.cellElements = [];
    const frag = document.createDocumentFragment();
    
    for (let r = 0; r < state.gridHeight; r++) {
        state.cellElements[r] = [];
        for (let c = 0; c < state.gridWidth; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            // Check if cell has saved zone state, otherwise default to neutral
            const coordKey = `${r}-${c}`;
            const zoneType = state.cells[coordKey] || 'neutral';
            cell.classList.add(zoneType);
            
            state.cellElements[r][c] = cell;
            frag.appendChild(cell);
        }
    }
    
    DOM.grid.appendChild(frag);
    
    // Re-render overlays (bases, arrows, markers)
    renderBases();
    renderArrows();
    renderMarkers();
}

// Rebuild grid with new width and height from input
function resizeGrid() {
    if (!DOM.gridWidthInput || !DOM.gridHeightInput) return;
    const w = parseInt(DOM.gridWidthInput.value) || 24;
    const h = parseInt(DOM.gridHeightInput.value) || 24;
    
    if (w < 5 || h < 5) {
        showToast("Grid dimensions must be at least 5x5!", "error");
        return;
    }
    
    state.gridWidth = w;
    state.gridHeight = h;
    
    // Filter bases that fall out of bounds
    state.bases = state.bases.filter(b => b.row + 2 < h && b.col + 2 < w);
    
    // Filter arrows that fall out of bounds
    state.arrows = state.arrows.filter(a => 
        a.startCell.row < h && a.startCell.col < w &&
        a.endCell.row < h && a.endCell.col < w
    );
    
    // Keep only cells within bounds
    const newCells = {};
    for (const key in state.cells) {
        const [r, c] = key.split('-').map(Number);
        if (r < h && c < w) {
            newCells[key] = state.cells[key];
        }
    }
    state.cells = newCells;
    
    buildGrid();
    showToast(`Grid rebuilt: ${w}x${h}`, "success");
}

// -------------------------------------------------------------
// PAINTING & TOOL MANAGEMENT
// -------------------------------------------------------------

// Active tool selector
function setTool(toolName) {
    state.activeTool = toolName;
    
    // Reset temporary arrow state
    cancelArrowDrawing();
    
    // Update active UI classes
    toolButtons.forEach(btn => {
        if (btn.dataset.tool === toolName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update active label
    // Update active label
    let toolText = "Neutral Zone";
    if (toolName === 'green-zone') toolText = "Green Zone Brush";
    else if (toolName === 'gray-zone') toolText = "Gray Zone Brush";
    else if (toolName === 'capital') toolText = "Capital Zone Brush";
    else if (toolName === 'base-coral') toolText = "Place ZOG Base (Coral)";
    else if (toolName === 'base-blue') toolText = "Place S72 (Rubi) Base (Blue)";
    else if (toolName === 'base-green') toolText = "Place FoE Base (Green)";
    else if (toolName === 'base-yellow') toolText = "Place FoE2 Base (Yellow)";
    else if (toolName === 'base-purple') toolText = "Place BfE Base (Purple)";
    else if (toolName === 'base-allied') toolText = "Place Allied Base (Cyan)";
    else if (toolName === 'base-red') toolText = "Place Enemy Red Base";
    else if (toolName === 'arrow') toolText = "Draw Squad Arrow";
    else if (toolName === 'dome') toolText = "Toggle Base Dome (Forcefield)";
    else if (toolName === 'shield') toolText = "Toggle Base Shield (Icon)";
    else if (toolName === 'eraser') toolText = "Eraser Mode";
    else if (toolName === 'select') toolText = "Multi-Select (один альянс)";
    else if (toolName === 'edit') toolText = "Edit Base (Commander)";
    
    DOM.currentToolText.innerText = toolText;
}

// Helper: fast O(1) cell element lookup
function getCellEl(r, c) {
    return state.cellElements && state.cellElements[r] && state.cellElements[r][c] || null;
}

// Handle painting zone colors
function paintCell(row, col) {
    const coordKey = `${row}-${col}`;
    const cellEl = getCellEl(row, col);
    
    if (!cellEl) return;
    
    // Remove previous classes
    cellEl.classList.remove('neutral-zone', 'green-zone', 'gray-zone', 'capital');
    
    if (state.activeTool === 'eraser') {
        // Erase zone
        delete state.cells[coordKey];
        cellEl.classList.add('neutral-zone');
    } else {
        // Paint zone
        state.cells[coordKey] = state.activeTool;
        cellEl.classList.add(state.activeTool);
    }
}

// Check if a base can be placed at cell (r, c)
function canPlaceBase(r, c) {
    // Bounds check
    if (r >= state.gridHeight || c >= state.gridWidth || r < 0 || c < 0) {
        return { success: false, reason: "Out of grid boundaries" };
    }
    
    // Capital zone check (Constraint 1: no bases on capital cells)
    if (state.cells[`${r}-${c}`] === 'capital') {
        return { success: false, reason: "Cannot place base on Capital Zone cells!" };
    }
    
    // Overlap with existing bases check
    for (const b of state.bases) {
        if (b.row === r && b.col === c) {
            return { success: false, reason: "Overlaps with another base" };
        }
    }
    
    return { success: true };
}

// Place base in state
function placeBase(r, c, color, options) {
    const silent = options && options.silent;
    const check = canPlaceBase(r, c);
    if (!check.success) {
        if (!silent) showToast(check.reason, "error");
        return null;
    }
    
    const newBase = {
        id: 'base_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        row: r,
        col: c,
        color: color,
        shield: false,
        dome: false
    };
    state.bases.push(newBase);
    
    if (silent) {
        // Рисование протяжкой: добавляем только ЭТОТ элемент, без полной
        // пересборки карты и без тоста на каждую клетку (иначе на 10-20 базах
        // за жест — мигающая пачка уведомлений и заметное подтормаживание).
        appendBaseElement(newBase);
    } else {
        // Одиночная постановка: новая база тоже не требует пересборки уже
        // стоящих — просто добавляем один элемент.
        appendBaseElement(newBase);
        showToast(`${color.toUpperCase()} base placed successfully!`, "success");
    }
    // Совместное редактирование: шлём операцию, а не всю карту
    sendBaseOp({ kind: 'add', base: newBase });
    // Инструмент остаётся активным — можно ставить базы одну за другой, не выбирая
    // цвет заново каждый раз. Меняется только явным выбором другого инструмента.
    return newBase;
}

// Remove base by ID
function removeBase(id) {
    const base = state.bases.find(b => b.id === id);
    state.bases = state.bases.filter(b => b.id !== id);

    // Стрелки, идущие от этой базы или к ней, без базы теряют смысл —
    // удаляем их вместе с базой, а не оставляем "висеть в воздухе" на карте.
    let removedArrows = 0;
    if (base) {
        const before = state.arrows.length;
        state.arrows = state.arrows.filter(a =>
            !isCellInBase(a.startCell.row, a.startCell.col, base) &&
            !isCellInBase(a.endCell.row, a.endCell.col, base)
        );
        removedArrows = before - state.arrows.length;
    }

    renderBases();
    renderArrows();
    showToast(removedArrows > 0 ? `База удалена вместе со стрелками (${removedArrows})` : "Base removed", "success");
    // Совместное редактирование: базу удаляем точечной операцией...
    sendBaseOp({ kind: 'remove', id: id });
    // ...а если пришлось удалить и стрелки — досылаем полное состояние карты,
    // т.к. для стрелок отдельного канала точечных операций нет.
    if (removedArrows > 0) notifyServerOfMapChange();
    // Инструмент (ластик) остаётся активным — можно удалить сразу несколько баз подряд.
}

