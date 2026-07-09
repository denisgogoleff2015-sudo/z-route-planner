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

    // Multi-select state (Commander tool)
    selectedIds: [],        // ids of selected bases (single alliance only)
    selectionColor: null,   // alliance color of the current selection
    isMarquee: false,       // rectangle selection in progress
    marqueeStartPx: null,   // {x, y} px relative to map wrapper
    marqueeEl: null,        // live DOM element of the selection rectangle
    groupDrag: null         // [{id, origRow, origCol, el}] when dragging a group
};

// Check if launched in editor mode (requires secret key in URL)
const urlParams = new URLSearchParams(window.location.search);
const secretKey = urlParams.get('key');
const isCommanderMode = (secretKey === '1234' || secretKey === '1998');
const isViewerMode = !isCommanderMode;
const showAiTools = (secretKey === '1998');

if (isViewerMode) {
    document.body.classList.add('viewer-mode');
}

// Цвет стрелки для каждого альянса (Правило 3: стрелка = цвет альянса-источника)
const ALLIANCE_ARROW_COLORS = {
    coral:  '#ff7f50', // ZOG
    blue:   '#1e90ff', // S72 (Rubi)
    green:  '#2ed573', // FoE
    yellow: '#ffd32a', // FoE2
    purple: '#a55eea', // BfE
    allied: '#00cfd1', // Союзники вне топа
    red:    '#ff4757'  // Враг
};

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
    profileNickname: document.getElementById('profile-nickname'),
    profileAlliance: document.getElementById('profile-alliance'),
    profileLevel: document.getElementById('profile-level'),
    profileRole: document.getElementById('profile-role'),
    profileActive: document.getElementById('profile-active'),
    btnSaveProfile: document.getElementById('btn-save-profile'),
    profileActions: document.getElementById('profile-actions'),
    btnPlaceMyBase: document.getElementById('btn-place-my-base'),
    btnCopyBaseCode: document.getElementById('btn-copy-base-code'),
    btnImportPlayer: document.getElementById('btn-import-player'),
    
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
            // Display range of game coordinates represented by this cell (1/3 scale)
            const gameXStart = c * 3 + state.coordOffset.x;
            const gameYStart = r * 3 + state.coordOffset.y;
            cell.dataset.coord = `X: ${gameXStart}-${gameXStart + 2}, Y: ${gameYStart}-${gameYStart + 2}`;
            
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
function placeBase(r, c, color) {
    const check = canPlaceBase(r, c);
    if (!check.success) {
        showToast(check.reason, "error");
        return;
    }
    
    const newBase = {
        id: baseId,
        row: r,
        col: c,
        color: color,
        shield: false,
        dome: false
    };
    state.bases.push(newBase);
    
    renderBases();
    showToast(`${color.toUpperCase()} base placed successfully!`, "success");
    // Совместное редактирование: шлём операцию, а не всю карту
    sendBaseOp({ kind: 'add', base: newBase });
    setTool('neutral');
}

// Remove base by ID
function removeBase(id) {
    state.bases = state.bases.filter(b => b.id !== id);
    renderBases();
    showToast("Base removed", "success");
    // Совместное редактирование: шлём операцию удаления
    sendBaseOp({ kind: 'remove', id: id });
    setTool('neutral');
}

// -------------------------------------------------------------
// ARROW DRAWING (VECTOR LAYOUT)
// -------------------------------------------------------------

function getCellCenter(row, col) {
    return {
        x: col * state.cellSize + state.cellSize / 2,
        y: row * state.cellSize + state.cellSize / 2
    };
}

// Starts or finishes arrow drawing
function handleArrowToolInteraction(r, c) {
    if (!state.isDrawingArrow) {
        // First click: Start point
        state.isDrawingArrow = true;
        state.arrowStartCell = { row: r, col: c };
        DOM.tempArrow.style.display = 'block';
        updateTempArrowPath(r, c);
        showToast("Set target cell to complete arrow", "info");
    } else {
        // Second click: End point
        completeArrowDrawing(r, c);
    }
}

// Helper to identify the target object and check for color conflicts (enforced on Capital/Turrets only, ignoring red enemy arrows)
function checkTargetColorConflict(targetRow, targetCol, arrowColor, ignoreArrowId = null) {
    // If the drawing arrow is red (enemy), it is always allowed to point anywhere!
    if (arrowColor === '#ff4757') {
        return { conflict: false };
    }

    const isCapitalCell = state.cells[`${targetRow}-${targetCol}`] === 'capital' ||
                          (targetRow >= 21 && targetRow <= 27 && targetCol >= 21 && targetCol <= 27);
                          
    if (!isCapitalCell) {
        return { conflict: false }; // Color conflicts only enforced on Capital Core and Turrets (batteries)
    }
    
    const targetType = 'capital';
    // Map to nearest capital target key
    const targets = {
        center: { r: 24.0, c: 24.0 },
        nw:     { r: 21.5, c: 21.5 },
        ne:     { r: 21.5, c: 26.5 },
        sw:     { r: 26.5, c: 21.5 },
        se:     { r: 26.5, c: 26.5 }
    };
    let bestKey = null;
    let bestDist = Infinity;
    for (const key in targets) {
        const t = targets[key];
        const d = (t.r - targetRow) * (t.r - targetRow) + (t.c - targetCol) * (t.c - targetCol);
        if (d < bestDist) {
            bestDist = d;
            bestKey = key;
        }
    }
    const targetId = 'capital_' + bestKey;
    
    // Find any existing arrow pointing to the same Capital target object that has a different color (ignoring enemy red arrows)
    for (const arrow of state.arrows) {
        if (ignoreArrowId && arrow.id === ignoreArrowId) continue;
        if (!arrow.endCell) continue;
        // Ignore red arrows (enemies) in conflict checks
        if (arrow.color === '#ff4757') continue;
        
        const ar = arrow.endCell.row;
        const ac = arrow.endCell.col;
        const isArrowCap = state.cells[`${ar}-${ac}`] === 'capital' || (ar >= 21 && ar <= 27 && ac >= 21 && ac <= 27);
        
        if (isArrowCap) {
            // Map existing arrow to nearest capital key
            let bestArrowKey = null;
            let bestArrowDist = Infinity;
            for (const key in targets) {
                const t = targets[key];
                const d = (t.r - ar) * (t.r - ar) + (t.c - ac) * (t.c - ac);
                if (d < bestArrowDist) {
                    bestArrowDist = d;
                    bestArrowKey = key;
                }
            }
            const arrowTargetId = 'capital_' + bestArrowKey;
            
            if (arrowTargetId === targetId && arrow.color !== arrowColor) {
                return {
                    conflict: true,
                    existingColor: arrow.color,
                    targetName: bestKey.toUpperCase() + ' (Столица)'
                };
            }
        }
    }
    
    return { conflict: false };
}

// Completes arrow drawing to target row and col
function completeArrowDrawing(r, c) {
    const start = state.arrowStartCell;
    if (!start) return;
    
    const end = { row: r, col: c };
    
    if (start.row === end.row && start.col === end.col) {
        cancelArrowDrawing();
        showToast("Arrow must start and end at different cells", "error");
        setTool('neutral');
        return;
    }
    
    // ПРАВИЛА 1 + 2 + 3 (переписанная логика помощи):
    //  1) Помощь действует ТОЛЬКО внутри своего альянса (один цвет).
    //  2) База в зелёной зоне может помогать своим в серой зоне ДАЖЕ под куполом
    //     (купол больше не блокирует стрелку к базе того же цвета).
    //  3) Цвет стрелки задаётся цветом альянса-источника автоматически.
    const srcBase = state.bases.find(b => isCellInBase(start.row, start.col, b));
    const dstBase = state.bases.find(b => isCellInBase(end.row, end.col, b));

    // Ограничение: не более 4 исходящих стрелочек от одной базы
    if (srcBase) {
        const outgoingCount = state.arrows.filter(arrow => 
            isCellInBase(arrow.startCell.row, arrow.startCell.col, srcBase)
        ).length;
        if (outgoingCount >= 4) {
            cancelArrowDrawing();
            showToast("База не может иметь более 4 исходящих стрелок!", "error");
            return;
        }
    }

    // Правило 1: если стрелку рисует база — цель обязана быть базой того же цвета (помощь)
    // или находиться в Столице/на турелях (атака). Исключение: стрелки от врага (red) могут идти ко всем базам.
    if (srcBase) {
        const isTargetCapital = state.cells[`${end.row}-${end.col}`] === 'capital' ||
                                (end.row >= 21 && end.row <= 27 && end.col >= 21 && end.col <= 27);
        const isEnemySource = srcBase.color === 'red';
        
        if (!isTargetCapital && !isEnemySource) {
            if (!dstBase || dstBase.color !== srcBase.color) {
                cancelArrowDrawing();
                showToast("Помощь можно отправлять только базам своего альянса (свой цвет)!", "error");
                return;
            }
        }
    }

    // Правило 3: цвет стрелки = цвет альянса-источника.
    const arrowColor = srcBase
        ? (ALLIANCE_ARROW_COLORS[srcBase.color] || state.activeArrowColor)
        : state.activeArrowColor;

    // Проверка конфликта цветов: нельзя вести стрелки разных цветов на один объект
    const conflictCheck = checkTargetColorConflict(end.row, end.col, arrowColor);
    if (conflictCheck.conflict) {
        cancelArrowDrawing();
        showToast(`Нельзя рисовать связь: на ${conflictCheck.targetName} уже ведут стрелки другого цвета!`, "error");
        setTool('neutral');
        return;
    }

    // ГРУППОВЫЕ СТРЕЛКИ: если стрелка начата с выделенной базы и выделено несколько баз
    // одного альянса — стрелка рисуется от КАЖДОЙ выделенной базы к той же цели.
    if (srcBase && state.selectedIds.length > 1 && state.selectedIds.includes(srcBase.id)) {
        const groupBases = state.bases.filter(b => state.selectedIds.includes(b.id));
        const isTargetCapitalCell = state.cells[`${end.row}-${end.col}`] === 'capital';
        
        // Цель должна быть либо столицей, либо базой своего альянса (цвет выделения)
        if (!isTargetCapitalCell && (!dstBase || dstBase.color !== state.selectionColor)) {
            cancelArrowDrawing();
            showToast("Групповая стрелка: цель должна быть Столицей или базой своего альянса!", "error");
            return;
        }
        
        let created = 0;
        let skipped = 0;
        groupBases.forEach(gb => {
            // Не рисуем стрелку базы саму в себя
            if (gb.row === end.row && gb.col === end.col) { skipped++; return; }
            // Лимит 4 исходящих на базу
            const outCount = state.arrows.filter(a => isCellInBase(a.startCell.row, a.startCell.col, gb)).length;
            if (outCount >= 4) { skipped++; return; }
            
            state.arrows.push({
                id: 'arrow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                startCell: { row: gb.row, col: gb.col },
                endCell: { row: end.row, col: end.col },
                color: ALLIANCE_ARROW_COLORS[gb.color] || arrowColor
            });
            created++;
        });
        
        cancelArrowDrawing();
        renderArrows();
        renderBases();
        showToast(`Группа: создано стрелок — ${created}` + (skipped ? `, пропущено — ${skipped} (лимит/цель)` : ''), created ? "success" : "error");
        notifyServerOfMapChange();
        setTool('neutral');
        return;
    }

    // Add arrow to state
    state.arrows.push({
        id: 'arrow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        startCell: start,
        endCell: end,
        color: arrowColor
    });
    
    cancelArrowDrawing();
    renderArrows();
    renderBases(); // Update shield badges
    showToast("Squad path established", "success");
    notifyServerOfMapChange();
    setTool('neutral');
}

// Cancels drawing temporary arrow
function cancelArrowDrawing() {
    state.isDrawingArrow = false;
    state.arrowStartCell = null;
    DOM.tempArrow.style.display = 'none';
}

// Updates temp path string matching current mouse cell
function updateTempArrowPath(targetRow, targetCol) {
    if (!state.isDrawingArrow || !state.arrowStartCell) return;
    
    const p1 = getCellCenter(state.arrowStartCell.row, state.arrowStartCell.col);
    const p2 = getCellCenter(targetRow, targetCol);
    
    // Draw straight line path for draft
    DOM.tempArrow.setAttribute('d', `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`);
    DOM.tempArrow.setAttribute('stroke', state.activeArrowColor);
    DOM.tempArrow.setAttribute('stroke-width', '4');
}

// Renders saved arrows as SVG paths
function renderArrows() {
    DOM.arrowsGroup.innerHTML = '';
    
    state.arrows.forEach(arrow => {
        const srcBase = state.bases.find(b => isCellInBase(arrow.startCell.row, arrow.startCell.col, b));
        const dstBase = state.bases.find(b => isCellInBase(arrow.endCell.row, arrow.endCell.col, b));
        
        let startShift = srcBase ? 0.7 * state.cellSize : 0;
        let endShift = dstBase ? 0.7 * state.cellSize : 0;
        
        const p1 = getCellCenter(arrow.startCell.row, arrow.startCell.col);
        const p2 = getCellCenter(arrow.endCell.row, arrow.endCell.col);
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        
        // Normal vector for offset (calculated from original center-to-center line)
        const nx = len > 0 ? -dy / len : 0;
        const ny = len > 0 ? dx / len : 0;
        
        if (len > startShift + endShift + 10) {
            const ux = dx / len;
            const uy = dy / len;
            
            p1.x += ux * startShift;
            p1.y += uy * startShift;
            
            p2.x -= ux * endShift;
            p2.y -= uy * endShift;
        }
        
        // Bend size
        const bendOffset = 15;
        const midX = (p1.x + p2.x) / 2 + nx * bendOffset;
        const midY = (p1.y + p2.y) / 2 + ny * bendOffset;
        
        const pathData = `M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`;
        
        // Draw the background invisible fat path for hover interaction
        const interactivePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        interactivePath.setAttribute('d', pathData);
        interactivePath.setAttribute('class', 'arrow-path arrow-interactive');
        interactivePath.setAttribute('stroke', 'transparent');
        interactivePath.setAttribute('stroke-width', '16');
        interactivePath.setAttribute('fill', 'none');
        
        // Draw the actual visible path
        const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        visiblePath.setAttribute('d', pathData);
        visiblePath.setAttribute('class', 'arrow-path arrow-marching');
        visiblePath.setAttribute('stroke', arrow.color);
        visiblePath.setAttribute('stroke-width', '4');
        visiblePath.setAttribute('fill', 'none');
        
        // Arrow head reference
        visiblePath.setAttribute('marker-end', `url(#arrow-head-${arrow.color.replace('#', '')})`);
        
        // Interactions in Eraser mode
        interactivePath.addEventListener('mouseenter', () => {
            if (state.activeTool === 'eraser') {
                visiblePath.setAttribute('stroke', state.dangerColor || '#ff4757');
                visiblePath.setAttribute('stroke-width', '6');
            }
        });
        
        interactivePath.addEventListener('mouseleave', () => {
            visiblePath.setAttribute('stroke', arrow.color);
            visiblePath.setAttribute('stroke-width', '4');
        });
        
        interactivePath.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.activeTool === 'eraser') {
                state.arrows = state.arrows.filter(a => a.id !== arrow.id);
                renderArrows();
                renderBases(); // Update shield badges
                showToast("Movement route deleted", "success");
                setTool('neutral');
            }
        });
        
        DOM.arrowsGroup.appendChild(interactivePath);
        DOM.arrowsGroup.appendChild(visiblePath);
    });
    
    // Draw the capital progress bars and targets
    renderCapitalTargets();
}

// Renders the Capital Center (3x3 circle) and 4 Corner Turrets (2x2) with assault progress bars.
// FIX: раньше засчитывались только стрелки в крошечные хот-споты (3x3 центр, 2x2 углы),
// а остальная столица была "мёртвой зоной" — прогресс вечно стоял на нуле.
// Теперь ЛЮБАЯ стрелка, оканчивающаяся на клетке столицы, засчитывается ближайшей цели.
function renderCapitalTargets() {
    const overlay = document.getElementById('capital-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    
    // 5 целей: центр + 4 турели (координаты — центры их зон)
    const targets = {
        center: { count: 0, r: 24.0, c: 24.0 },
        nw:     { count: 0, r: 21.5, c: 21.5 },
        ne:     { count: 0, r: 21.5, c: 26.5 },
        sw:     { count: 0, r: 26.5, c: 21.5 },
        se:     { count: 0, r: 26.5, c: 26.5 }
    };
    
    state.arrows.forEach(arrow => {
        if (!arrow || !arrow.endCell) return;
        const r = arrow.endCell.row;
        const c = arrow.endCell.col;
        
        // Стрелка должна оканчиваться на клетке столицы (по данным зон, а не по хардкоду)
        const isCapitalCell = state.cells[`${r}-${c}`] === 'capital' ||
                              (r >= 21 && r <= 27 && c >= 21 && c <= 27);
        if (!isCapitalCell) return;
        
        // Назначаем ближайшую цель — мёртвых зон больше нет
        let bestKey = null;
        let bestDist = Infinity;
        for (const key in targets) {
            const t = targets[key];
            const d = (t.r - r) * (t.r - r) + (t.c - c) * (t.c - c);
            if (d < bestDist) {
                bestDist = d;
                bestKey = key;
            }
        }
        targets[bestKey].count++;
    });
    
    // Create Capital Center Overlay (3x3 cells, starting at row 23, col 23)
    const centerEl = document.createElement('div');
    centerEl.className = 'capital-center-target';
    centerEl.style.top = `${23 * state.cellSize}px`;
    centerEl.style.left = `${23 * state.cellSize}px`;
    centerEl.style.width = `${3 * state.cellSize}px`;
    centerEl.style.height = `${3 * state.cellSize}px`;
    
    const centerCount = targets.center.count;
    const centerPercent = Math.min(100, (centerCount / 30) * 100);
    centerEl.innerHTML = `
        <i class="fa-solid fa-dungeon" style="font-size: 24px; color: #ff4757; margin-bottom: 6px; animation: domePulse 2s infinite alternate ease-in-out;"></i>
        <span class="target-label">Capital Core</span>
        <div class="target-progress-container">
            <div class="target-progress-bar" style="width: ${centerPercent}%"></div>
            <span class="target-progress-text">${centerCount}/30</span>
        </div>
    `;
    overlay.appendChild(centerEl);
    
    // Turrets helper to avoid duplicate code
    const turrets = [
        { id: 'nw', label: 'NW Turret', row: 21, col: 21, count: targets.nw.count },
        { id: 'ne', label: 'NE Turret', row: 21, col: 26, count: targets.ne.count },
        { id: 'sw', label: 'SW Turret', row: 26, col: 21, count: targets.sw.count },
        { id: 'se', label: 'SE Turret', row: 26, col: 26, count: targets.se.count }
    ];
    
    turrets.forEach(t => {
        const turretEl = document.createElement('div');
        turretEl.className = 'capital-turret-target';
        turretEl.style.top = `${t.row * state.cellSize}px`;
        turretEl.style.left = `${t.col * state.cellSize}px`;
        turretEl.style.width = `${2 * state.cellSize}px`;
        turretEl.style.height = `${2 * state.cellSize}px`;
        
        const percent = Math.min(100, (t.count / 20) * 100);
        turretEl.innerHTML = `
            <i class="fa-solid fa-crosshairs" style="font-size: 16px; color: #ffa502; margin-bottom: 4px;"></i>
            <span class="target-label" style="font-size: 8px;">${t.label}</span>
            <div class="target-progress-container" style="height: 8px;">
                <div class="target-progress-bar" style="width: ${percent}%"></div>
                <span class="target-progress-text" style="font-size: 7px;">${t.count}/20</span>
            </div>
        `;
        overlay.appendChild(turretEl);
    });
    
    // HUD: дублирующая панель прогресса поверх карты (всегда видима, не зависит от зума/скролла)
    updateCaptureHud(targets);
}

// Updates the always-visible capture progress HUD in the corner of the map viewport
function updateCaptureHud(targets) {
    const hud = document.getElementById('capture-hud');
    if (!hud) return;
    
    const rows = [
        { key: 'center', label: 'Столица', max: 30 },
        { key: 'nw', label: 'NW турель', max: 20 },
        { key: 'ne', label: 'NE турель', max: 20 },
        { key: 'sw', label: 'SW турель', max: 20 },
        { key: 'se', label: 'SE турель', max: 20 }
    ];
    
    rows.forEach(rowDef => {
        const fill = document.getElementById(`hud-fill-${rowDef.key}`);
        const text = document.getElementById(`hud-text-${rowDef.key}`);
        if (!fill || !text) return;
        const count = targets[rowDef.key].count;
        fill.style.width = `${Math.min(100, (count / rowDef.max) * 100)}%`;
        text.innerText = `${count}/${rowDef.max}`;
    });
}

// -------------------------------------------------------------
// BASE RENDERING
// -------------------------------------------------------------

function isCellInBase(row, col, base) {
    return row === base.row && col === base.col;
}

function computeShieldCount(base) {
    // Щит даётся ТОЛЬКО входящей помощью: стрелка от союзника (того же цвета),
    // направленная В эту базу. Ручной тумблер щита убран — base.shield больше не влияет.
    let count = 0;
    
    const siblingBases = state.bases.filter(b => b.id !== base.id && b.color === base.color);
    
    siblingBases.forEach(sibling => {
        // Есть ли стрелка ОТ соседа К этой базе (входящая помощь)?
        const incomingHelp = state.arrows.some(arrow => {
            const startsInSibling = isCellInBase(arrow.startCell.row, arrow.startCell.col, sibling);
            const endsInBase = isCellInBase(arrow.endCell.row, arrow.endCell.col, base);
            return startsInSibling && endsInBase;
        });
        if (incomingHelp) {
            count++;
        }
    });
    
    return Math.min(5, count);
}

function canPlaceBaseIgnoreSelf(r, c, baseId) {
    if (r >= state.gridHeight || c >= state.gridWidth || r < 0 || c < 0) {
        return { success: false, reason: "Out of grid boundaries" };
    }
    
    // Capital zone check (Constraint 1: no bases on capital cells)
    if (state.cells[`${r}-${c}`] === 'capital') {
        return { success: false, reason: "Cannot place base on Capital Zone cells!" };
    }
    
    for (const b of state.bases) {
        if (b.id === baseId) continue;
        if (b.row === r && b.col === c) {
            return { success: false, reason: "Overlaps with another base" };
        }
    }
    return { success: true };
}

function renderBases() {
    DOM.basesOverlay.innerHTML = '';
    
    state.bases.forEach(base => {
        const baseEl = document.createElement('div');
        baseEl.className = `base-block ${base.color}`;
        if (base.dome) {
            baseEl.classList.add('domed');
        }
        if (state.selectedIds.includes(base.id)) {
            baseEl.classList.add('selected');
        }
        baseEl.style.top = `${base.row * state.cellSize}px`;
        baseEl.style.left = `${base.col * state.cellSize}px`;
        baseEl.dataset.row = base.row;
        baseEl.dataset.col = base.col;
        
        // Visual structure of the base
        const isEnemy = base.color === 'red';
        const isAllied = base.color === 'allied';
        let iconClass = "fa-fort-awesome";
        let baseTitle = `${base.color.toUpperCase()} BASE`;
        
        if (isEnemy) {
            iconClass = "fa-circle-radiation";
            baseTitle = "ENEMY RED BASE";
        } else if (isAllied) {
            iconClass = "fa-handshake";
            baseTitle = "ALLIED BASE (CYAN)";
        } else if (base.color === 'coral') {
            baseTitle = "ZOG BASE (CORAL)";
        } else if (base.color === 'blue') {
            baseTitle = "S72 (RUBI) BASE (BLUE)";
        } else if (base.color === 'green') {
            baseTitle = "FoE BASE (GREEN)";
        } else if (base.color === 'yellow') {
            baseTitle = "FoE2 BASE (YELLOW)";
        } else if (base.color === 'purple') {
            baseTitle = "BfE BASE (PURPLE)";
        }
        
        if (base.player) {
            const roleMap = { attack: 'Атака', defense: 'Защита', capture: 'Захват' };
            const roleText = roleMap[base.player.role] || 'Неизвестно';
            const activeText = base.player.active ? 'АКТИВЕН' : 'НЕАКТИВЕН';
            baseTitle = `${base.player.name.toUpperCase()} (LVL ${base.player.level}) | Роль: ${roleText} | [${activeText}]`;
        }
        
        baseEl.innerHTML = `
            <i class="fa-solid ${iconClass}"></i>
            <span>${baseTitle}</span>
        `;
        
        // Add shield count badge if shield active or connections exist
        const shieldVal = computeShieldCount(base);
        if (shieldVal > 0) {
            const badge = document.createElement('div');
            badge.className = 'base-shield-badge';
            badge.innerHTML = `<i class="fa-solid fa-shield-halved" style="font-size: 7px; margin-right: 1px;"></i>${shieldVal}`;
            baseEl.appendChild(badge);
        }
        
        // Handle deletion / shield / dome in different tool modes
        baseEl.addEventListener('mouseenter', () => {
            if (isViewerMode) return;
            if (state.activeTool === 'eraser') {
                baseEl.classList.add('eraser-hover');
            } else if (state.activeTool === 'dome') {
                baseEl.classList.add('dome-hover');
            } else if (state.activeTool === 'shield') {
                baseEl.classList.add('shield-hover');
            } else if (state.activeTool === 'edit') {
                baseEl.classList.add('edit-hover');
            }
        });
        
        baseEl.addEventListener('mouseleave', () => {
            if (isViewerMode) return;
            baseEl.classList.remove('eraser-hover', 'dome-hover', 'shield-hover', 'edit-hover');
        });
        
        baseEl.addEventListener('click', (e) => {
            if (isViewerMode) return;
            e.stopPropagation(); // Prevent grid click
            if (state.activeTool === 'eraser') {
                removeBase(base.id);
                setTool('neutral');
            } else if (state.activeTool === 'dome') {
                if (!base.dome) {
                    // Enforce Constraint 2: Cannot activate dome in Gray Zone
                    if (state.cells[`${base.row}-${base.col}`] === 'gray-zone') {
                        showToast("Cannot activate dome: Base is in the Gray Zone!", "error");
                        return;
                    }
                    
                    // ПРАВИЛО 2: купол в зелёной зоне НЕ мешает помогать своим в серой зоне.
                    // Блокируем купол ТОЛЬКО если у базы есть стрелка на ЧУЖОЙ цвет (реальная
                    // атака на другой альянс). Стрелки к своему цвету (помощь) с куполом совместимы.
                    const hasEnemyAttackPaths = state.arrows.some(arrow => {
                        const startsInBase = isCellInBase(arrow.startCell.row, arrow.startCell.col, base);
                        if (startsInBase) {
                            const dstBase = state.bases.find(b => isCellInBase(arrow.endCell.row, arrow.endCell.col, b));
                            return !dstBase || dstBase.color !== base.color; // чужой цвет = атака
                        }
                        return false;
                    });
                    if (hasEnemyAttackPaths) {
                        showToast("Купол нельзя включить: у базы есть атака на чужой альянс!", "error");
                        return;
                    }
                }
                
                base.dome = !base.dome;
                renderBases();
                showToast(base.dome ? "Forcefield Dome activated!" : "Forcefield Dome deactivated", "success");
                sendBaseOp({ kind: 'update', id: base.id, dome: base.dome });
                setTool('neutral');
            } else if (state.activeTool === 'shield') {
                base.shield = !base.shield;
                renderBases();
                showToast(base.shield ? "Shield rating active (base count: 1)!" : "Shield rating reset", "success");
                setTool('neutral');
            } else if (state.activeTool === 'neutral') {
                openEditBaseModal(base);
            } else if (state.activeTool === 'edit') {
                // Инструмент "Редактирование" — панель редактирования базы для командира
                openEditBaseModal(base);
                setTool('neutral');
            } else if (state.activeTool === 'select') {
                // Клик по базе инструментом выделения — добавить/убрать из выделения.
                // Выделение допускает ТОЛЬКО один альянс (один цвет).
                if (state.selectedIds.includes(base.id)) {
                    state.selectedIds = state.selectedIds.filter(id => id !== base.id);
                    if (state.selectedIds.length === 0) state.selectionColor = null;
                    renderBases();
                } else {
                    if (state.selectionColor && base.color !== state.selectionColor) {
                        showToast("В выделение можно добавлять только базы одного альянса!", "error");
                        return;
                    }
                    state.selectionColor = state.selectionColor || base.color;
                    state.selectedIds.push(base.id);
                    renderBases();
                    showToast(`Выделено баз: ${state.selectedIds.length}`, "info");
                }
            }
        });
        
        // Mousedown handler for dragging bases
        baseEl.addEventListener('mousedown', (e) => {
            if (isViewerMode) return;
            
            // If drawing an arrow, route click to start drawing from this base cell
            if (state.activeTool === 'arrow') {
                e.stopPropagation();
                e.preventDefault();
                handleArrowToolInteraction(base.row, base.col);
                return;
            }
            
            // Do not drag if using eraser/dome/shield/edit clicks, drawing arrows, or placing bases
            if (state.activeTool === 'eraser' || state.activeTool === 'dome' || state.activeTool === 'shield' || state.activeTool === 'edit' || state.activeTool.startsWith('base-') || state.activeTool === 'place-user-base') {
                return;
            }
            if (e.button !== 0) return; // Only left click
            
            e.preventDefault();
            e.stopPropagation();
            
            state.isDraggingBase = true;
            state.draggedBaseId = base.id;
            state.originalPos = { row: base.row, col: base.col };
            state.draggedEl = baseEl; // cache DOM reference
            
            // ГРУППОВОЕ ПЕРЕТАСКИВАНИЕ: если тащим выделенную базу и выделено несколько —
            // двигаем всю группу вместе, сохраняя взаимное расположение.
            state.groupDrag = null;
            if (state.selectedIds.length > 1 && state.selectedIds.includes(base.id)) {
                state.groupDrag = state.selectedIds
                    .map(id => {
                        const b = state.bases.find(bb => bb.id === id);
                        if (!b) return null;
                        const el = DOM.basesOverlay.querySelector(`.base-block[data-row="${b.row}"][data-col="${b.col}"]`);
                        return { id: b.id, origRow: b.row, origCol: b.col, el: el };
                    })
                    .filter(Boolean);
            }
            
            baseEl.classList.add('dragging');
            
            const rect = baseEl.getBoundingClientRect();
            state.dragOffset = {
                x: (e.clientX - rect.left) / state.zoomScale,
                y: (e.clientY - rect.top) / state.zoomScale
            };
            
            // Cache wrapper bounds to prevent layout thrashing on mousemove
            state.wrapperRect = DOM.mapCanvasWrapper.getBoundingClientRect();
        });

        // Touch support for dragging bases
        baseEl.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            const simulatedEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            });
            baseEl.dispatchEvent(simulatedEvent);
        }, { passive: true });
        
        DOM.basesOverlay.appendChild(baseEl);
    });
}

function updateZonePreview() {
    // Highly optimized clear: only remove classes from previously cached preview cells
    state.previewCells.forEach(cellEl => {
        cellEl.classList.remove('zone-preview', 'green-preview', 'gray-preview', 'capital-preview', 'neutral-preview');
    });
    state.previewCells = [];
    
    if (!state.isDrawingZone || !state.zoneStartCell || !state.zoneEndCell) return;
    
    const start = state.zoneStartCell;
    const end = state.zoneEndCell;
    
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    // Choose styling class matching current brush
    let previewClass = 'neutral-preview';
    if (state.activeTool === 'green-zone') previewClass = 'green-preview';
    else if (state.activeTool === 'gray-zone') previewClass = 'gray-preview';
    else if (state.activeTool === 'capital') previewClass = 'capital-preview';
    else if (state.activeTool === 'eraser') previewClass = 'neutral-preview';
    else if (state.activeTool === 'neutral') previewClass = 'neutral-preview';
    
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cellEl = getCellEl(r, c);
            if (cellEl) {
                cellEl.classList.add('zone-preview', previewClass);
                state.previewCells.push(cellEl);
            }
        }
    }
}

// -------------------------------------------------------------
// EVENT HANDLERS FOR CELLS (Event Delegation)
// -------------------------------------------------------------

// Single event delegation on the grid container instead of per-cell listeners
DOM.grid.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    
    // Viewer Mode bypass for placing personal base
    if (isViewerMode) {
        if (state.activeTool === 'place-user-base') {
            placeUserBase(r, c);
        }
        return;
    }
    
    e.preventDefault();
    
    if (state.activeTool === 'place-user-base') {
        placeUserBase(r, c);
    }
    else if (state.activeTool.startsWith('base-')) {
        const color = state.activeTool.split('-')[1];
        placeBase(r, c, color);
    } 
    else if (state.activeTool === 'arrow') {
        handleArrowToolInteraction(r, c);
    }
    else if (state.activeTool === 'select') {
        // Инструмент выделения: тянем рамку по сетке
        startMarquee(e.clientX, e.clientY);
    }
});

DOM.grid.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    
    if (state.isDrawingArrow) {
        updateTempArrowPath(r, c);
    }
});

// -------------------------------------------------------------
// VIEWPORT PAN AND ZOOM
// -------------------------------------------------------------

function applyZoom() {
    DOM.mapCanvasWrapper.style.transform = `scale(${state.zoomScale})`;
    DOM.zoomLevelText.innerText = `${Math.round(state.zoomScale * 100)}%`;
}

// Zoom in
DOM.btnZoomIn.addEventListener('click', () => {
    if (state.zoomScale < 2.0) {
        state.zoomScale += 0.1;
        applyZoom();
    }
});

// Zoom out
DOM.btnZoomOut.addEventListener('click', () => {
    if (state.zoomScale > 0.5) {
        state.zoomScale -= 0.1;
        applyZoom();
    }
});

// Panning setup
DOM.mapContainer.addEventListener('mousedown', (e) => {
    // Only scroll if clicked directly on mapContainer (empty space) OR in scroll drag mode
    if (e.target === DOM.mapContainer || e.button === 1 || e.shiftKey) {
        state.isPanning = true;
        DOM.mapContainer.style.cursor = 'grabbing';
        state.panStart.x = e.clientX - DOM.mapContainer.offsetLeft;
        state.panStart.y = e.clientY - DOM.mapContainer.offsetTop;
        state.scrollStart.x = DOM.mapContainer.scrollLeft;
        state.scrollStart.y = DOM.mapContainer.scrollTop;
    }
});

window.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
        const x = e.clientX - DOM.mapContainer.offsetLeft;
        const y = e.clientY - DOM.mapContainer.offsetTop;
        const walkX = x - state.panStart.x;
        const walkY = y - state.panStart.y;
        DOM.mapContainer.scrollLeft = state.scrollStart.x - walkX;
        DOM.mapContainer.scrollTop = state.scrollStart.y - walkY;
    }
    else if (state.isDraggingBase && state.draggedBaseId) {
        const base = state.bases.find(b => b.id === state.draggedBaseId);
        if (base && state.draggedEl && state.wrapperRect) {
            const draggedEl = state.draggedEl;
            // Mouse clientX/Y minus offset from base top-left relative to cached bounds (accounting for zoom scale!)
            const x = (e.clientX - state.wrapperRect.left) / state.zoomScale - state.dragOffset.x;
            const y = (e.clientY - state.wrapperRect.top) / state.zoomScale - state.dragOffset.y;
            
            let col = Math.round(x / state.cellSize);
            let row = Math.round(y / state.cellSize);
            
            col = Math.max(0, Math.min(state.gridWidth - 1, col));
            row = Math.max(0, Math.min(state.gridHeight - 1, row));
            
            draggedEl.style.top = `${row * state.cellSize}px`;
            draggedEl.style.left = `${col * state.cellSize}px`;
            
            // Групповое перетаскивание: двигаем остальных участников на тот же сдвиг
            if (state.groupDrag) {
                const dRow = row - state.originalPos.row;
                const dCol = col - state.originalPos.col;
                state.groupDrag.forEach(m => {
                    if (m.id === state.draggedBaseId || !m.el) return;
                    m.el.style.top = `${(m.origRow + dRow) * state.cellSize}px`;
                    m.el.style.left = `${(m.origCol + dCol) * state.cellSize}px`;
                });
            }
        }
    }
    else if (state.isMarquee && state.marqueeEl && state.wrapperRect) {
        // Рисуем рамку выделения
        const curX = e.clientX - state.wrapperRect.left;
        const curY = e.clientY - state.wrapperRect.top;
        const x0 = Math.min(state.marqueeStartPx.x, curX);
        const y0 = Math.min(state.marqueeStartPx.y, curY);
        const w = Math.abs(curX - state.marqueeStartPx.x);
        const h = Math.abs(curY - state.marqueeStartPx.y);
        state.marqueeEl.style.left = `${x0}px`;
        state.marqueeEl.style.top = `${y0}px`;
        state.marqueeEl.style.width = `${w}px`;
        state.marqueeEl.style.height = `${h}px`;
    }
});

window.addEventListener('mouseup', (e) => {
    state.isPainting = false;
    if (state.isPanning) {
        state.isPanning = false;
        DOM.mapContainer.style.cursor = 'grab';
    }
    
    // Apply drawn zone rectangle - Removed since zones are static
    
    // If drawing arrow and released on a different cell/base, complete the arrow
    if (state.isDrawingArrow && state.arrowStartCell) {
        const targetEl = e.target.closest('.grid-cell, .base-block');
        if (targetEl) {
            const r = parseInt(targetEl.dataset.row);
            const c = parseInt(targetEl.dataset.col);
            if (r !== state.arrowStartCell.row || c !== state.arrowStartCell.col) {
                completeArrowDrawing(r, c);
            }
        }
    }
    
    if (state.isDraggingBase && state.draggedBaseId) {
        const base = state.bases.find(b => b.id === state.draggedBaseId);
        const draggedEl = state.draggedEl;
        
        if (base && draggedEl) {
            draggedEl.classList.remove('dragging');
            
            const leftVal = parseInt(draggedEl.style.left);
            const topVal = parseInt(draggedEl.style.top);
            
            const col = Math.round(leftVal / state.cellSize);
            const row = Math.round(topVal / state.cellSize);
            
            // ГРУППОВОЙ СБРОС: валидируем и коммитим всю группу единым сдвигом
            if (state.groupDrag && state.groupDrag.length > 1) {
                const dRow = row - state.originalPos.row;
                const dCol = col - state.originalPos.col;
                const memberIds = new Set(state.groupDrag.map(m => m.id));
                
                let failReason = null;
                for (const m of state.groupDrag) {
                    const nr = m.origRow + dRow;
                    const nc = m.origCol + dCol;
                    if (nr < 0 || nr >= state.gridHeight || nc < 0 || nc >= state.gridWidth) {
                        failReason = "Группа выходит за пределы карты"; break;
                    }
                    if (state.cells[`${nr}-${nc}`] === 'capital') {
                        failReason = "Нельзя ставить базы на клетки Столицы"; break;
                    }
                    // Столкновение с базой вне группы (внутри группы сдвиг общий — коллизий нет)
                    const blocker = state.bases.find(b => !memberIds.has(b.id) && b.row === nr && b.col === nc);
                    if (blocker) { failReason = "Клетка занята другой базой"; break; }
                }
                
                if (!failReason && (dRow !== 0 || dCol !== 0)) {
                    state.groupDrag.forEach(m => {
                        const b = state.bases.find(bb => bb.id === m.id);
                        if (!b) return;
                        // Сдвигаем прикреплённые стрелки
                        state.arrows.forEach(arrow => {
                            if (arrow.startCell.row === m.origRow && arrow.startCell.col === m.origCol) {
                                arrow.startCell.row += dRow;
                                arrow.startCell.col += dCol;
                            }
                            if (arrow.endCell.row === m.origRow && arrow.endCell.col === m.origCol) {
                                arrow.endCell.row += dRow;
                                arrow.endCell.col += dCol;
                            }
                        });
                        b.row = m.origRow + dRow;
                        b.col = m.origCol + dCol;
                    });
                    showToast(`Группа из ${state.groupDrag.length} баз перемещена`, "success");
                    notifyServerOfMapChange();
                } else if (failReason) {
                    showToast(failReason + " — перемещение группы отменено", "error");
                }
            }
            // Одиночный сброс
            else {
                const check = canPlaceBaseIgnoreSelf(row, col, base.id);
                if (check.success) {
                    // Update connected arrows with position offset
                    const rowOffset = row - base.row;
                    const colOffset = col - base.col;
                    
                    state.arrows.forEach(arrow => {
                        if (isCellInBase(arrow.startCell.row, arrow.startCell.col, base)) {
                            arrow.startCell.row += rowOffset;
                            arrow.startCell.col += colOffset;
                        }
                        if (isCellInBase(arrow.endCell.row, arrow.endCell.col, base)) {
                            arrow.endCell.row += rowOffset;
                            arrow.endCell.col += colOffset;
                        }
                    });
                    
                    base.row = row;
                    base.col = col;
                    showToast("Base repositioned", "success");
                    // Совместное редактирование: операция перемещения
                    sendBaseOp({ kind: 'move', id: base.id, row: row, col: col });
                } else {
                    showToast(check.reason, "error");
                }
            }
        }
        
        state.isDraggingBase = false;
        state.draggedBaseId = null;
        state.draggedEl = null;
        state.groupDrag = null;
        
        renderBases();
        renderArrows();
    }
    
    // Завершение рамки выделения
    if (state.isMarquee) {
        finalizeMarqueeSelection();
    }
});

// -------------------------------------------------------------
// MULTI-SELECT (MARQUEE) LOGIC
// -------------------------------------------------------------

// Начать рамку выделения (вызывается из mousedown по сетке при активном инструменте select)
function startMarquee(clientX, clientY) {
    state.wrapperRect = DOM.mapCanvasWrapper.getBoundingClientRect();
    state.isMarquee = true;
    state.marqueeStartPx = {
        x: clientX - state.wrapperRect.left,
        y: clientY - state.wrapperRect.top
    };
    
    const el = document.createElement('div');
    el.className = 'selection-marquee';
    el.style.left = `${state.marqueeStartPx.x}px`;
    el.style.top = `${state.marqueeStartPx.y}px`;
    el.style.width = '0px';
    el.style.height = '0px';
    DOM.mapCanvasWrapper.appendChild(el);
    state.marqueeEl = el;
}

// Завершить рамку: выбрать все базы внутри, оставив ТОЛЬКО один альянс (мажоритарный цвет)
function finalizeMarqueeSelection() {
    const el = state.marqueeEl;
    state.isMarquee = false;
    state.marqueeStartPx = null;
    state.marqueeEl = null;
    
    if (!el) return;
    
    const x0 = parseFloat(el.style.left);
    const y0 = parseFloat(el.style.top);
    const x1 = x0 + parseFloat(el.style.width);
    const y1 = y0 + parseFloat(el.style.height);
    el.remove();
    
    // Слишком маленькая рамка = клик по пустому месту → сброс выделения
    if ((x1 - x0) < 4 && (y1 - y0) < 4) {
        clearSelection();
        return;
    }
    
    const c0 = Math.floor(x0 / state.cellSize);
    const r0 = Math.floor(y0 / state.cellSize);
    const c1 = Math.floor(x1 / state.cellSize);
    const r1 = Math.floor(y1 / state.cellSize);
    
    applyMarqueeCells(r0, c0, r1, c1);
}

// Применить выделение по диапазону клеток (вынесено отдельно для тестируемости)
function applyMarqueeCells(r0, c0, r1, c1) {
    const inside = state.bases.filter(b => b.row >= r0 && b.row <= r1 && b.col >= c0 && b.col <= c1);
    
    if (inside.length === 0) {
        clearSelection();
        showToast("В рамке нет баз — выделение сброшено", "info");
        return;
    }
    
    // Правило: выделение — только один альянс. Берём мажоритарный цвет внутри рамки.
    const colorCounts = {};
    inside.forEach(b => { colorCounts[b.color] = (colorCounts[b.color] || 0) + 1; });
    let majority = null;
    let best = 0;
    for (const color in colorCounts) {
        if (colorCounts[color] > best) { best = colorCounts[color]; majority = color; }
    }
    
    const chosen = inside.filter(b => b.color === majority);
    state.selectedIds = chosen.map(b => b.id);
    state.selectionColor = majority;
    
    renderBases();
    const dropped = inside.length - chosen.length;
    showToast(`Выделено баз: ${chosen.length} (${majority.toUpperCase()})` + (dropped ? `, отброшено чужих: ${dropped}` : ''), "success");
    setTool('neutral');
}

// Полный сброс выделения
function clearSelection() {
    if (state.selectedIds.length === 0) return;
    state.selectedIds = [];
    state.selectionColor = null;
    renderBases();
}

// Esc — сброс выделения и отмена рамки/стрелки
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (state.isMarquee && state.marqueeEl) {
            state.marqueeEl.remove();
            state.isMarquee = false;
            state.marqueeEl = null;
            state.marqueeStartPx = null;
        }
        cancelArrowDrawing();
        clearSelection();
    }
});

// -------------------------------------------------------------
// SESSION MANAGEMENT (LOCALSTORAGE & JSON EXPORT/IMPORT)
// -------------------------------------------------------------

// Serialize state to JSON object
function serializeMapState() {
    return {
        gridWidth: state.gridWidth,
        gridHeight: state.gridHeight,
        coordOffset: state.coordOffset,
        cells: state.cells,
        bases: state.bases,
        arrows: state.arrows,
        markers: state.markers
    };
}

// Load state from JSON object
function loadMapState(data) {
    if (!data || typeof data.gridWidth !== 'number' || typeof data.gridHeight !== 'number') {
        showToast("Invalid map session data!", "error");
        return false;
    }
    
    state.gridWidth = data.gridWidth;
    state.gridHeight = data.gridHeight;
    state.coordOffset = data.coordOffset || { x: 0, y: 0 };
    state.cells = data.cells || {};
    state.bases = data.bases || [];
    state.arrows = data.arrows || [];
    state.markers = data.markers || [];
    
    if (DOM.gridWidthInput) DOM.gridWidthInput.value = state.gridWidth;
    if (DOM.gridHeightInput) DOM.gridHeightInput.value = state.gridHeight;
    
    buildGrid();
    return true;
}

// Save to localStorage
function saveSession() {
    const sessionName = DOM.sessionNameInput.value.trim();
    if (!sessionName) {
        showToast("Please enter a session name", "error");
        return;
    }
    
    const savedSessions = JSON.parse(localStorage.getItem('z_route_sessions') || '{}');
    savedSessions[sessionName] = {
        timestamp: Date.now(),
        data: serializeMapState()
    };
    
    localStorage.setItem('z_route_sessions', JSON.stringify(savedSessions));
    showToast(`Session "${sessionName}" saved!`, "success");
}

// Delete session
function deleteSession(sessionName) {
    const savedSessions = JSON.parse(localStorage.getItem('z_route_sessions') || '{}');
    if (savedSessions[sessionName]) {
        delete savedSessions[sessionName];
        localStorage.setItem('z_route_sessions', JSON.stringify(savedSessions));
        showToast(`Session "${sessionName}" deleted`, "success");
        openLoadModal(); // refresh
    }
}

// Open modal and show saved maps list
function openLoadModal() {
    DOM.sessionList.innerHTML = '';
    const savedSessions = JSON.parse(localStorage.getItem('z_route_sessions') || '{}');
    const keys = Object.keys(savedSessions).sort((a,b) => savedSessions[b].timestamp - savedSessions[a].timestamp);
    
    if (keys.length === 0) {
        DOM.sessionList.innerHTML = '<li style="color:var(--text-secondary); text-align:center; padding: 15px;">No saved maps found</li>';
    } else {
        keys.forEach(key => {
            const item = savedSessions[key];
            const date = new Date(item.timestamp).toLocaleString();
            
            const li = document.createElement('li');
            li.className = 'session-item';
            li.innerHTML = `
                <div class="session-details">
                    <span class="session-title-text">${key}</span>
                    <span class="session-meta-text">Saved: ${date} (${item.data.gridWidth}x${item.data.gridHeight})</span>
                </div>
                <div class="session-actions">
                    <button class="session-btn load-icon" title="Load Map"><i class="fa-solid fa-folder-open"></i></button>
                    <button class="session-btn delete-icon" title="Delete Map"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `;
            
            // Load trigger
            li.querySelector('.load-icon').addEventListener('click', (e) => {
                e.stopPropagation();
                if (loadMapState(item.data)) {
                    DOM.sessionNameInput.value = key;
                    DOM.loadModal.classList.remove('active');
                    showToast(`Session "${key}" loaded!`, "success");
                }
            });
            
            // Delete trigger
            li.querySelector('.delete-icon').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete session "${key}"?`)) {
                    deleteSession(key);
                }
            });
            
            // Clicking row also loads
            li.addEventListener('click', () => {
                if (loadMapState(item.data)) {
                    DOM.sessionNameInput.value = key;
                    DOM.loadModal.classList.remove('active');
                    showToast(`Session "${key}" loaded!`, "success");
                }
            });
            
            DOM.sessionList.appendChild(li);
        });
    }
    
    DOM.loadModal.classList.add('active');
}

// Export state as JSON file
function exportJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(serializeMapState(), null, 2));
    const downloadAnchor = document.createElement('a');
    const sessionName = DOM.sessionNameInput.value.trim().replace(/\s+/g, '_') || 'map_session';
    
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${sessionName}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("JSON configuration downloaded", "success");
}

// Import state from JSON file
function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (loadMapState(data)) {
                // Set session name matching filename
                const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                DOM.sessionNameInput.value = nameWithoutExt.replace(/_/g, ' ');
                showToast("JSON configuration imported!", "success");
            }
        } catch (err) {
            showToast("Failed to parse JSON file", "error");
        }
    };
    reader.readAsText(file);
}

// -------------------------------------------------------------
// AI PROMPT EXPORTER
// -------------------------------------------------------------

function generateAiPrompt() {
    const rawData = serializeMapState();
    
    // Group painted cells by type
    const zoneSummaries = {
        'green-zone': [],
        'gray-zone': [],
        'capital': []
    };
    
    for (const key in rawData.cells) {
        const zoneType = rawData.cells[key];
        const [r, c] = key.split('-').map(Number);
        const gx = c * 3 + rawData.coordOffset.x;
        const gy = r * 3 + rawData.coordOffset.y;
        if (zoneSummaries[zoneType]) {
            zoneSummaries[zoneType].push(`Cell (${r},${c}) [Game X: ${gx}-${gx+2}, Y: ${gy}-${gy+2}]`);
        }
    }
    
    // Condensed details
    const greenZoneStr = zoneSummaries['green-zone'].length > 0 ? zoneSummaries['green-zone'].join(', ') : 'None';
    const grayZoneStr = zoneSummaries['gray-zone'].length > 0 ? zoneSummaries['gray-zone'].join(', ') : 'None';
    const capitalStr = zoneSummaries['capital'].length > 0 ? zoneSummaries['capital'].join(', ') : 'None';
    
    const basesStr = rawData.bases.map(b => {
        const shieldVal = computeShieldCount(b);
        const domeStatus = b.dome ? "[SHIELD DOME ACTIVE]" : "[NO DOME]";
        const shieldStatus = shieldVal > 0 ? `[SHIELD LEVEL: ${shieldVal}]` : "[NO SHIELD]";
        
        let allianceClan = b.color.toUpperCase();
        if (b.color === 'coral') allianceClan = "ZOG (Coral)";
        else if (b.color === 'blue') allianceClan = "S72 (Rubi) (Blue)";
        else if (b.color === 'green') allianceClan = "FoE (Green)";
        else if (b.color === 'yellow') allianceClan = "FoE2 (Yellow)";
        else if (b.color === 'purple') allianceClan = "BfE (Purple)";
        else if (b.color === 'allied') allianceClan = "Allied Support (Cyan)";
        else if (b.color === 'red') allianceClan = "Enemy Hostility (Red)";
        
        const gx = b.col * 3 + rawData.coordOffset.x;
        const gy = b.row * 3 + rawData.coordOffset.y;
        
        return `- ${allianceClan} base at grid cell (${b.row}, ${b.col}) [representing game coordinate range X: ${gx}-${gx+2}, Y: ${gy}-${gy+2}] ${domeStatus} ${shieldStatus}`;
    }).join('\n') || 'None';
    
    const arrowsStr = rawData.arrows.map(a => {
        const sx = a.startCell.col * 3 + rawData.coordOffset.x;
        const sy = a.startCell.row * 3 + rawData.coordOffset.y;
        const ex = a.endCell.col * 3 + rawData.coordOffset.x;
        const ey = a.endCell.row * 3 + rawData.coordOffset.y;
        return `- Movement path from grid cell (${a.startCell.row}, ${a.startCell.col}) [Game X: ${sx}-${sx+2}, Y: ${sy}-${sy+2}] to cell (${a.endCell.row}, ${a.endCell.col}) [Game X: ${ex}-${ex+2}, Y: ${ey}-${ey+2}] (Arrow Color: ${a.color})`;
    }).join('\n') || 'None';
    
    const promptText = `State of the Z Route Redemption Tactical Map (1/3 compressed scale):
- Dimensions: ${rawData.gridWidth} columns (X grid: 0 to ${rawData.gridWidth-1}) x ${rawData.gridHeight} rows (Y grid: 0 to ${rawData.gridHeight-1})
- Game Coordinate Offset: X starts at ${rawData.coordOffset.x}, Y starts at ${rawData.coordOffset.y} (1 Grid Cell = 3x3 Game Cells)

- Special Zones (Grid indices and game ranges):
  * Green Zones (Safe sectors): ${greenZoneStr}
  * Gray Zones (Contested wastelands): ${grayZoneStr}
  * Capital Zones (Main objectives): ${capitalStr}

- Active Bases (occupying 1x1 grid cell):
${basesStr}

- Squad Movements (Arrows):
${arrowsStr}

---
JSON State for Editor Import (you can modify this JSON to add bases, zones, or arrows, and output it back so the user can import it):
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`
---
Instructions for AI: You can analyze this map to suggest combat strategies, optimal routes, base vulnerability, or edit the JSON data directly to design new operations. If you make modifications, present the updated JSON inside a single code block.`;

    // Copy to clipboard
    navigator.clipboard.writeText(promptText).then(() => {
        showToast("AI Prompt copied to clipboard!", "success");
    }).catch(err => {
        showToast("Failed to copy clipboard automatically", "error");
        console.log(promptText); // fallback
    });
}

// -------------------------------------------------------------
// PLAYER PROFILE & PERSONAL BASE PLACEMENT
// -------------------------------------------------------------

// Load profile from localStorage on startup
function initProfile() {
    const saved = localStorage.getItem('z_player_profile');
    if (saved) {
        try {
            const profile = JSON.parse(saved);
            DOM.profileNickname.value = profile.nickname || '';
            DOM.profileAlliance.value = profile.alliance || 'coral';
            DOM.profileLevel.value = profile.level || 1;
            DOM.profileRole.value = profile.role || 'attack';
            DOM.profileActive.checked = profile.active !== false;
            DOM.profileActions.style.display = 'flex';
        } catch (e) {
            console.error("Error loading profile", e);
        }
    }
}

// Helper: Find a free cell in the Green Zone starting from the bottom
function findFreeGreenZoneCell() {
    for (let r = state.gridHeight - 1; r >= 0; r--) {
        for (let c = 0; c < state.gridWidth; c++) {
            const key = `${r}-${c}`;
            if (state.cells[key] === 'green-zone') {
                const occupied = state.bases.some(b => b.row === r && b.col === c);
                if (!occupied) {
                    return { row: r, col: c };
                }
            }
        }
    }
    return null;
}

// Save profile to localStorage and auto-place base in green zone
function saveProfile() {
    const nickname = DOM.profileNickname.value.trim();
    const alliance = DOM.profileAlliance.value;
    const level = parseInt(DOM.profileLevel.value) || 1;
    const role = DOM.profileRole.value;
    const active = DOM.profileActive.checked;
    
    if (!nickname) {
        showToast("Please enter your Nickname!", "error");
        return;
    }
    
    if (level < 1 || level > 30) {
        showToast("Level must be between 1 and 30!", "error");
        return;
    }
    
    // Check if this is the user's own profile vs a different player
    let savedProfile = null;
    try {
        const raw = localStorage.getItem('z_player_profile');
        if (raw) savedProfile = JSON.parse(raw);
    } catch (e) {}
    
    const isOwnProfile = !savedProfile || !savedProfile.nickname || savedProfile.nickname.toLowerCase() === nickname.toLowerCase();
    
    if (isOwnProfile) {
        // Update user's own profile
        const profile = { nickname, alliance, level, role, active };
        localStorage.setItem('z_player_profile', JSON.stringify(profile));
        DOM.profileActions.style.display = 'flex';
        
        let userBase = state.bases.find(b => b.id === 'user_base');
        if (userBase) {
            userBase.color = alliance;
            userBase.player = { name: nickname, level: level, role: role, active: active };
            
            // Update connected arrows color to match new source base color (Constraint 3)
            state.arrows.forEach(arrow => {
                if (isCellInBase(arrow.startCell.row, arrow.startCell.col, userBase)) {
                    arrow.color = ALLIANCE_ARROW_COLORS[alliance] || arrow.color;
                }
            });
            
            renderBases();
            renderArrows();
            showToast(`Профиль "${nickname}" успешно обновлен и подсвечен на карте!`, "success");
            
            // Highlight ping
            const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${userBase.row}"][data-col="${userBase.col}"]`);
            if (baseEl) {
                baseEl.classList.add('highlight-ping');
                setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
            }
            notifyServerOfMapChange();
        } else {
            const freeCell = findFreeGreenZoneCell();
            if (freeCell) {
                state.bases.push({
                    id: 'user_base',
                    row: freeCell.row,
                    col: freeCell.col,
                    color: alliance,
                    shield: false,
                    dome: false,
                    player: { name: nickname, level: level, role: role, active: active }
                });
                renderBases();
                showToast(`Профиль "${nickname}" сохранен, база размещена автоматически!`, "success");
                
                // Highlight ping
                const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${freeCell.row}"][data-col="${freeCell.col}"]`);
                if (baseEl) {
                    baseEl.classList.add('highlight-ping');
                    setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
                }
                notifyServerOfMapChange();
            } else {
                showToast("No free cells available in the Green Zone!", "error");
            }
        }
    } else {
        // This is a different player! Add or update as a separate player base
        let existingBase = state.bases.find(b => b.player && b.player.name.toLowerCase() === nickname.toLowerCase());
        
        if (existingBase) {
            existingBase.color = alliance;
            existingBase.player = { name: nickname, level: level, role: role, active: active };
            
            // Update connected arrows color
            state.arrows.forEach(arrow => {
                if (isCellInBase(arrow.startCell.row, arrow.startCell.col, existingBase)) {
                    arrow.color = ALLIANCE_ARROW_COLORS[alliance] || arrow.color;
                }
            });
            
            renderBases();
            renderArrows();
            showToast(`Игрок "${nickname}" уже добавлен! База подсвечена и обновлена.`, "warning");
            
            // Highlight ping
            const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${existingBase.row}"][data-col="${existingBase.col}"]`);
            if (baseEl) {
                baseEl.classList.add('highlight-ping');
                setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
            }
            notifyServerOfMapChange();
        } else {
            const freeCell = findFreeGreenZoneCell();
            if (freeCell) {
                state.bases.push({
                    id: 'player_' + nickname.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now(),
                    row: freeCell.row,
                    col: freeCell.col,
                    color: alliance,
                    shield: false,
                    dome: false,
                    player: { name: nickname, level: level, role: role, active: active }
                });
                renderBases();
                showToast(`Новый игрок "${nickname}" добавлен и подсвечен на карте!`, "success");
                
                // Highlight ping
                const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${freeCell.row}"][data-col="${freeCell.col}"]`);
                if (baseEl) {
                    baseEl.classList.add('highlight-ping');
                    setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
                }
                notifyServerOfMapChange();
            } else {
                showToast("No free cells available in the Green Zone!", "error");
            }
        }
    }
}

// Triggers active tool to place personal base (Deprecated for players, kept for compatibility check)
function startPlaceMyBase() {
    state.activeTool = 'place-user-base';
    DOM.currentToolText.innerText = "Click on Green Zone to Place Your Base";
    showToast("Click on any cell in the GREEN ZONE to place/move your base!", "info");
}

// Logic to place user base (restricted to green-zone)
function placeUserBase(r, c) {
    const nickname = DOM.profileNickname.value.trim();
    const alliance = DOM.profileAlliance.value;
    const level = parseInt(DOM.profileLevel.value) || 1;
    const role = DOM.profileRole.value;
    const active = DOM.profileActive.checked;
    
    // Boundary check
    if (r >= state.gridHeight || c >= state.gridWidth || r < 0 || c < 0) {
        showToast("Out of grid boundaries", "error");
        return;
    }
    
    // Check zone type
    const cellType = state.cells[`${r}-${c}`];
    if (cellType !== 'green-zone') {
        showToast("Personal bases can only be placed in the Green Zone!", "error");
        return;
    }
    
    // Check overlap with existing bases (excluding self)
    const overlaps = state.bases.some(b => b.id !== 'user_base' && b.row === r && b.col === c);
    if (overlaps) {
        showToast("Overlaps with another base!", "error");
        return;
    }
    
    // Remove previous user base if any
    state.bases = state.bases.filter(b => b.id !== 'user_base');
    
    // Add personal base
    state.bases.push({
        id: 'user_base',
        row: r,
        col: c,
        color: alliance,
        shield: false,
        dome: false,
        player: {
            name: nickname,
            level: level,
            role: role,
            active: active
        }
    });
    
    state.activeTool = 'neutral';
    DOM.currentToolText.innerText = isViewerMode ? "Read-Only Viewer" : "Neutral Zone";
    renderBases();
    showToast("Your base placed successfully!", "success");
    
    // Notify server of updates
    notifyServerOfMapChange();
}

// Copy user base info as shareable JSON string
function copyUserBaseCode() {
    const userBase = state.bases.find(b => b.id === 'user_base');
    if (!userBase) {
        showToast("Please place your base on the map first!", "error");
        return;
    }
    
    const codeObj = {
        type: "player_base",
        color: userBase.color,
        row: userBase.row,
        col: userBase.col,
        player: userBase.player
    };
    
    const codeStr = JSON.stringify(codeObj);
    
    navigator.clipboard.writeText(codeStr).then(() => {
        showToast("Base code copied to clipboard! Send it to your commander.", "success");
    }).catch(err => {
        showToast("Failed to copy automatically. Code: " + codeStr, "error");
    });
}

// Importer for Commanders to place shared base codes
function importPlayerBase() {
    const rawInput = prompt("Paste the player's base code here:");
    if (!rawInput) return;
    
    try {
        const data = JSON.parse(rawInput.trim());
        if (data.type !== 'player_base' || !data.player || !data.player.name || !data.player.level || typeof data.row !== 'number' || typeof data.col !== 'number') {
            showToast("Invalid player base code format!", "error");
            return;
        }
        
        // Remove existing base matching this player name
        state.bases = state.bases.filter(b => !b.player || b.player.name.toLowerCase() !== data.player.name.toLowerCase());
        
        // Push base to state
        state.bases.push({
            id: 'player_' + data.player.name.toLowerCase() + '_' + Date.now(),
            row: data.row,
            col: data.col,
            color: data.color || 'allied',
            shield: data.shield || false,
            dome: data.dome || false,
            player: {
                name: data.player.name,
                level: data.player.level,
                role: data.player.role || 'attack',
                active: data.player.active !== false
            }
        });
        
        renderBases();
        showToast(`Player base for "${data.player.name}" imported successfully!`, "success");
        
        // Notify server of updates
        notifyServerOfMapChange();
    } catch (e) {
        showToast("Failed to parse base code JSON!", "error");
    }
}
// -------------------------------------------------------------
// EDIT PLAYER BASE MODAL (FOR COMMANDERS)
// -------------------------------------------------------------
let editingBaseId = null;

function openEditBaseModal(base) {
    editingBaseId = base.id;
    DOM.editBaseName.value = base.player ? base.player.name : 'Unknown';
    DOM.editBaseColor.value = base.color;
    DOM.editBaseLevel.value = base.player ? base.player.level : 1;
    DOM.editBaseRole.value = base.player ? base.player.role : 'attack';
    DOM.editBaseActive.checked = base.player ? base.player.active !== false : true;
    
    DOM.editBaseModal.classList.add('active');
}

function saveEditBase() {
    if (!editingBaseId) return;
    
    const base = state.bases.find(b => b.id === editingBaseId);
    if (base) {
        const name = DOM.editBaseName.value.trim();
        const color = DOM.editBaseColor.value;
        const level = parseInt(DOM.editBaseLevel.value) || 1;
        const role = DOM.editBaseRole.value;
        const active = DOM.editBaseActive.checked;
        
        if (!name) {
            showToast("Please enter a player name!", "error");
            return;
        }
        
        base.color = color;
        base.player = {
            name: name,
            level: level,
            role: role,
            active: active
        };
        
        // Update connected arrows color to match new source base color (Constraint 3)
        state.arrows.forEach(arrow => {
            if (isCellInBase(arrow.startCell.row, arrow.startCell.col, base)) {
                arrow.color = ALLIANCE_ARROW_COLORS[color] || arrow.color;
            }
        });
        
        renderBases();
        renderArrows();
        DOM.editBaseModal.classList.remove('active');
        showToast(`Player "${name}" updated successfully!`, "success");
        notifyServerOfMapChange();
    }
    editingBaseId = null;
}

// -------------------------------------------------------------
// REAL-TIME SERVER SYNCHRONIZATION & OFFLINE LOCAL SYNC
// -------------------------------------------------------------
let wsConnection = null;
let isConnectedToServer = false;
let hasConnectedBefore = false; // true после первого успешного подключения
let hasLocalEdits = false;      // командир внёс правки, ещё не подтверждённые сервером

function initRealTimeSync() {
    // Check if offline/local storage sync is needed on startup
    const lastMap = localStorage.getItem('z_tactical_live_map');
    if (lastMap && !isConnectedToServer) {
        try {
            loadMapState(JSON.parse(lastMap));
            renderBases();
            renderArrows();
        } catch (e) {
            console.error("Error loading offline backup map", e);
        }
    }

    // Only connect if served via http/https (skip if file://)
    if (!window.location.protocol.startsWith('http')) {
        console.log("Running in local file-system mode. Server sync disabled, falling back to LocalStorage cross-tab sync.");
        
        // Listen to LocalStorage changes from other tabs for real-time offline sync!
        window.addEventListener('storage', (e) => {
            if (e.key === 'z_tactical_live_map') {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data) {
                        loadMapState(data);
                        renderBases();
                        renderArrows();
                    }
                } catch (err) {
                    console.error("Error syncing offline map:", err);
                }
            }
        });
        return;
    }
    
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/ws`;
    
    try {
        wsConnection = new WebSocket(wsUrl);
        
        wsConnection.onopen = () => {
            const wasReconnect = hasConnectedBefore;
            isConnectedToServer = true;
            hasConnectedBefore = true;
            console.log("Connected to tactical server!");

            if (wasReconnect && !isViewerMode && hasLocalEdits) {
                // Командир переподключился и у него есть НЕсохранённые правки —
                // отправляем СВОЮ карту на сервер, а не затираем её серверной версией.
                showToast("Соединение восстановлено — отправляю ваши изменения…", "success");
                notifyServerOfMapChange();
            } else {
                showToast("Connected to server - Real-time sync active!", "success");
                // Запрашиваем актуальную карту с сервера (первый вход или игрок)
                wsConnection.send(JSON.stringify({ type: 'request_map' }));
            }
        };
        
        wsConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // ===== ВХОДЯЩАЯ ОПЕРАЦИЯ С БАЗОЙ (совместное редактирование) =====
                if (message.type === 'map_op') {
                    applyBaseOp(message.op);
                    return;
                }

                if (message.type === 'map_update') {
                    const data = message.data;

                    // ЗАЩИТА ОТ ОТКАТА: если это командир и у него есть локальные
                    // несохранённые правки, НЕ затираем его карту серверной версией
                    // (иначе при микро-разрыве соединения работа слетает).
                    if (!isViewerMode && hasLocalEdits) {
                        return;
                    }

                    state.cells = data.cells || state.cells;
                    state.arrows = data.arrows || state.arrows;

                    // Merge bases. Сервер — источник истины. Если наша локальная база
                    // игрока (user_base) уже сохранена на сервере под именем этого игрока,
                    // НЕ добавляем её повторно (иначе дубль). Держим локальную копию только
                    // пока сервер её ещё не подтвердил.
                    const localUserBase = state.bases.find(b => b.id === 'user_base');
                    state.bases = data.bases || state.bases;

                    if (localUserBase) {
                        const myName = localUserBase.player && localUserBase.player.name
                            ? localUserBase.player.name.toLowerCase() : null;
                        const confirmedOnServer = myName && state.bases.some(
                            b => b.player && b.player.name && b.player.name.toLowerCase() === myName
                        );
                        if (!confirmedOnServer) {
                            // сервер ещё не подтвердил — временно показываем свою
                            state.bases.push(localUserBase);
                        }
                    }
                    
                    // Re-render
                    buildGrid();
                    renderBases();
                    renderArrows();
                } else if (message.type === 'error') {
                    showToast(message.message, "error");
                }
            } catch (e) {
                console.error("Error parsing socket message:", e);
            }
        };
        
        wsConnection.onclose = () => {
            isConnectedToServer = false;
            console.log("Disconnected from tactical server. Retrying in 5 seconds...");
            setTimeout(initRealTimeSync, 5000); // Auto-reconnect
        };
        
        wsConnection.onerror = (err) => {
            console.error("Socket error:", err);
        };
    } catch (e) {
        console.error("Failed to establish WebSocket connection", e);
    }
}

// ===== СОВМЕСТНОЕ РЕДАКТИРОВАНИЕ БАЗ (операции) =====
// Применить входящую операцию с базой к локальному состоянию.
function applyBaseOp(op) {
    if (!op || !op.kind) return;
    if (op.kind === 'add' && op.base) {
        state.bases = state.bases.filter(b => !(b.row === op.base.row && b.col === op.base.col));
        // не дублируем, если такой id уже есть
        if (!state.bases.some(b => b.id === op.base.id)) {
            state.bases.push(op.base);
        }
    } else if (op.kind === 'remove' && op.id) {
        state.bases = state.bases.filter(b => b.id !== op.id);
    } else if (op.kind === 'move' && op.id) {
        const b = state.bases.find(x => x.id === op.id);
        if (b) {
            const rowOffset = op.row - b.row;
            const colOffset = op.col - b.col;
            // сдвигаем привязанные стрелки, чтобы не отвалились у других командиров
            if (Array.isArray(state.arrows)) {
                state.arrows.forEach(arrow => {
                    if (isCellInBase(arrow.startCell.row, arrow.startCell.col, b)) {
                        arrow.startCell.row += rowOffset; arrow.startCell.col += colOffset;
                    }
                    if (isCellInBase(arrow.endCell.row, arrow.endCell.col, b)) {
                        arrow.endCell.row += rowOffset; arrow.endCell.col += colOffset;
                    }
                });
            }
            state.bases = state.bases.filter(x => x.id === op.id || !(x.row === op.row && x.col === op.col));
            b.row = op.row; b.col = op.col;
        }
    } else if (op.kind === 'update' && op.id) {
        const b = state.bases.find(x => x.id === op.id);
        if (b) {
            if ('color' in op) b.color = op.color;
            if ('shield' in op) b.shield = op.shield;
            if ('dome' in op) b.dome = op.dome;
        }
    }
    renderBases();
    if (typeof renderArrows === 'function') renderArrows();
}

// Отправить операцию с базой на сервер (только командир).
function sendBaseOp(op) {
    if (isViewerMode) return; // игроки шлют базы старым путём
    if (isConnectedToServer && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
            type: 'map_op',
            op: op,
            secretKey: new URLSearchParams(window.location.search).get('key') || ''
        }));
    }
}

// Push state change to server or local storage live key
function notifyServerOfMapChange() {    const mapData = serializeMapState();

    // Командир внёс правку. Пока сервер её не принял — считаем «есть локальные правки»,
    // чтобы reconnect не затёр работу серверной версией.
    if (!isViewerMode) {
        hasLocalEdits = true;
    }

    // If running offline, sync locally via LocalStorage
    if (!isConnectedToServer) {
        localStorage.setItem('z_tactical_live_map', JSON.stringify(mapData));
    }
    
    if (isConnectedToServer && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        // Игрок (viewer) шлёт серверу ТОЛЬКО базы игроков (свою/добавленные),
        // а не всю карту — карту правит только командир.
        let outData = mapData;
        if (isViewerMode) {
            outData = {
                bases: state.bases.filter(b => b.player && b.player.name)
            };
        }
        const payload = {
            type: 'update_map',
            data: outData,
            role: isViewerMode ? 'player' : 'commander',
            secretKey: new URLSearchParams(window.location.search).get('key') || ''
        };
        wsConnection.send(JSON.stringify(payload));
        // Отправка ушла на живой сокет — правки командира доставлены серверу.
        if (!isViewerMode) {
            hasLocalEdits = false;
        }
    }
}

// -------------------------------------------------------------
// EVENT BINDINGS
// -------------------------------------------------------------

// Profile Action Bindings
DOM.btnSaveProfile.addEventListener('click', saveProfile);
if (DOM.btnPlaceMyBase) {
    DOM.btnPlaceMyBase.addEventListener('click', startPlaceMyBase);
}
DOM.btnCopyBaseCode.addEventListener('click', copyUserBaseCode);
DOM.btnImportPlayer.addEventListener('click', importPlayerBase);

// Tool selection triggers (single loop over pre-cached NodeList)
toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        setTool(btn.dataset.tool);
    });
});

// Arrow Color selector dots
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.activeArrowColor = dot.dataset.color;
        // If we are currently drawing an arrow, update it
        if (state.isDrawingArrow) {
            DOM.tempArrow.setAttribute('stroke', state.activeArrowColor);
        }
    });
});

// Resize grid trigger
if (DOM.btnResize) {
    DOM.btnResize.addEventListener('click', resizeGrid);
}

// Clear grid trigger
DOM.btnClearAll.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear the map? This resets all bases and movement routes.")) {
        state.bases = [];
        state.arrows = [];
        cancelArrowDrawing();
        // Regenerate default background zones just in case
        generateDefaultMap();
        showToast("Bases and routes cleared!", "success");
        notifyServerOfMapChange();
    }
});

// Session control triggers
DOM.btnSave.addEventListener('click', saveSession);
DOM.btnLoadList.addEventListener('click', openLoadModal);
DOM.closeModal.addEventListener('click', () => DOM.loadModal.classList.remove('active'));
DOM.btnExport.addEventListener('click', exportJson);
DOM.importFile.addEventListener('change', importJson);
DOM.btnAiPrompt.addEventListener('click', generateAiPrompt);

// Edit Player Base Modal bindings
DOM.closeEditBaseModal.addEventListener('click', () => DOM.editBaseModal.classList.remove('active'));
DOM.btnSaveEditBase.addEventListener('click', saveEditBase);

// Paste JSON Modal triggers
DOM.btnPasteJson.addEventListener('click', () => {
    DOM.pasteJsonTextarea.value = '';
    DOM.pasteModal.classList.add('active');
});
DOM.closePasteModal.addEventListener('click', () => DOM.pasteModal.classList.remove('active'));
DOM.btnLoadPasted.addEventListener('click', () => {
    const rawText = DOM.pasteJsonTextarea.value.trim();
    if (!rawText) {
        showToast("Please paste JSON data first!", "error");
        return;
    }
    try {
        // Clean up possible markdown wrappers from AI
        let cleanedText = rawText;
        if (cleanedText.includes('```json')) {
            cleanedText = cleanedText.split('```json')[1].split('```')[0].trim();
        } else if (cleanedText.includes('```')) {
            cleanedText = cleanedText.split('```')[1].split('```')[0].trim();
        }
        
        const parsed = JSON.parse(cleanedText);
        if (loadMapState(parsed)) {
            DOM.pasteModal.classList.remove('active');
            DOM.pasteJsonTextarea.value = '';
            showToast("Model loaded successfully from AI!", "success");
        }
    } catch (e) {
        showToast("Invalid JSON syntax. Ensure the block is complete.", "error");
    }
});

// Close modals if clicked outside
window.addEventListener('click', (e) => {
    if (e.target === DOM.loadModal) {
        DOM.loadModal.classList.remove('active');
    }
    if (e.target === DOM.pasteModal) {
        DOM.pasteModal.classList.remove('active');
    }
    if (e.target === DOM.editBaseModal) {
        DOM.editBaseModal.classList.remove('active');
    }
});

// Window resize listener to fit grid within screen (debounced to save CPU)
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        recalculateCellSize();
        // Update wrapper sizes
        DOM.mapCanvasWrapper.style.width = `${state.gridWidth * state.cellSize}px`;
        DOM.mapCanvasWrapper.style.height = `${state.gridHeight * state.cellSize}px`;
        // Redraw overlays
        renderBases();
        renderArrows();
        renderMarkers();
    }, 100);
});

// Sidebar Toggle Click trigger
DOM.btnToggleSidebar.addEventListener('click', () => {
    const isCollapsed = DOM.sidebar.classList.toggle('collapsed');
    DOM.btnToggleSidebar.classList.toggle('collapsed');
    
    // Update icon class
    const icon = DOM.btnToggleSidebar.querySelector('i');
    if (isCollapsed) {
        icon.className = 'fa-solid fa-chevron-right';
        showToast("Sidebar hidden - fullscreen mode active", "info");
    } else {
        icon.className = 'fa-solid fa-chevron-left';
    }
});

// Re-adjust sizes when sidebar completes sliding transition
DOM.sidebar.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'margin-left') {
        recalculateCellSize();
        DOM.mapCanvasWrapper.style.width = `${state.gridWidth * state.cellSize}px`;
        DOM.mapCanvasWrapper.style.height = `${state.gridHeight * state.cellSize}px`;
        renderBases();
        renderArrows();
        renderMarkers();
    }
});

// -------------------------------------------------------------
// DEFAULT MAP GENERATOR (Z Route Redemption Battlefield)
// -------------------------------------------------------------

function generateDefaultMap() {
    state.gridWidth = 48;
    state.gridHeight = 48;
    state.coordOffset = { x: 428, y: 428 };
    state.cells = {};
    state.bases = [];
    state.arrows = [];
    state.markers = [];
    
    // Auto-paint zones using game coordinates (compressed to 1/3 scale)
    // Grid index c represents game X coords: [428 + c*3, 428 + c*3 + 2]
    // Capital is game [491, 509] -> grid indices 21 to 27 inclusive (since 428 + 21*3 = 491, 428 + 27*3 + 2 = 511)
    // Gray Zone is game [450, 551] -> grid indices 7 to 41 inclusive (since 428 + 7*3 = 449, 428 + 41*3 + 2 = 553)
    // Green Zone is everything else (outer border of 7-8 cells)
    for (let r = 0; r < 48; r++) {
        for (let c = 0; c < 48; c++) {
            const key = `${r}-${c}`;
            
            if (r >= 21 && r <= 27 && c >= 21 && c <= 27) {
                state.cells[key] = 'capital';
            } else if (r >= 7 && r <= 41 && c >= 7 && c <= 41) {
                state.cells[key] = 'gray-zone';
            } else {
                state.cells[key] = 'green-zone';
            }
        }
    }
    
    // Target markers are drawn dynamically with progress bars in renderCapitalTargets()
    state.markers = [];
    
    buildGrid();
    showToast("Z Route Redemption battlefield upscaled & generated!", "success");
}

// Render markers on the map
function renderMarkers() {
    DOM.markersOverlay.innerHTML = '';
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------

// Generate the default Z Route Redemption map
generateDefaultMap();
initProfile();
setTool('neutral');
initRealTimeSync();

// Hide/Show AI buttons dynamically based on secret key === '1998'
if (showAiTools) {
    if (DOM.btnPasteJson) DOM.btnPasteJson.style.display = 'block';
    if (DOM.btnAiPrompt) DOM.btnAiPrompt.style.display = 'block';
} else {
    if (DOM.btnPasteJson) DOM.btnPasteJson.style.display = 'none';
    if (DOM.btnAiPrompt) DOM.btnAiPrompt.style.display = 'none';
}

if (isViewerMode) {
    DOM.currentToolText.innerText = "Read-Only Viewer";
    const statusTextEl = document.querySelector('.status-text');
    if (statusTextEl) statusTextEl.innerHTML = `Mode: <strong>Read-Only Viewer</strong>`;
    
    // Check if profile exists
    const hasProfile = localStorage.getItem('z_player_profile');
    if (!hasProfile) {
        showToast("Пожалуйста, заполните профиль игрока слева, чтобы поставить свою базу!", "warning");
    } else {
        showToast("Режим просмотра. Вы можете управлять своей базой.", "info");
    }
} else {
    showToast("Welcome to Commander Editor Mode!", "success");
}

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
        state.isPanning = false; // гасим однопальцевый пан
        DOM.mapCanvasWrapper.classList.add('no-anim'); // без transition во время жеста
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
        const cont = DOM.mapContainer;
        const rect = cont.getBoundingClientRect();
        const mid = touchMidpoint(e.touches[0], e.touches[1]);

        // Новый масштаб от исходного расстояния (стабильнее, чем пошаговый)
        const rawScale = pinchPrevScale * (touchDistance(e.touches[0], e.touches[1]) / pinchStartDist);
        const newScale = Math.max(0.5, Math.min(3.0, rawScale));

        // Точка между пальцами относительно контейнера
        const midX = mid.x - rect.left;
        const midY = mid.y - rect.top;

        // 1) Компенсация зума: точка под пальцами остаётся под пальцами
        const k = newScale / state.zoomScale;
        let newScrollLeft = (cont.scrollLeft + midX) * k - midX;
        let newScrollTop  = (cont.scrollTop  + midY) * k - midY;

        // 2) Пан двумя пальцами: карта следует за движением середины жеста
        newScrollLeft += (pinchPrevMid.x - mid.x);
        newScrollTop  += (pinchPrevMid.y - mid.y);

        state.zoomScale = newScale;
        DOM.mapCanvasWrapper.style.transform = `scale(${newScale})`;
        cont.scrollLeft = newScrollLeft;
        cont.scrollTop = newScrollTop;

        pinchPrevMid = mid;
        if (e.cancelable) e.preventDefault();
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (e.touches.length < 2 && pinchStartDist) {
        pinchStartDist = null;
        pinchPrevMid = null;
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

    // Инструменты: стрелка / ластик / правка / цвета баз
    bar.querySelectorAll('[data-mtool]').forEach(btn => {
        btn.addEventListener('click', () => {
            setTool(btn.dataset.mtool);
            // после выбора цвета — прячем цветовой ряд
            if (btn.classList.contains('mb-color') && colorRow) colorRow.classList.remove('open');
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

    // «К столице» — сброс зума и центрирование на карту
    const homeBtn = document.getElementById('mb-zoom-home');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            state.zoomScale = 1;
            if (typeof applyZoom === 'function') applyZoom();
            const vp = document.querySelector('.viewport');
            if (vp) {
                // прокрутка к центру карты (столица в центре сетки)
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
    document.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        const baseEl = e.target.closest('.base-block');
        if (!baseEl) return;
        lpTimer = setTimeout(() => {
            const row = parseInt(baseEl.dataset.row);
            const col = parseInt(baseEl.dataset.col);
            const base = state.bases.find(b => b.row === row && b.col === col);
            if (base && !isViewerMode && typeof openEditBaseModal === 'function') {
                openEditBaseModal(base);
            }
        }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev =>
        document.addEventListener(ev, () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true })
    );
})();
