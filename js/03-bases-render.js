// ===== 03/9: БАЗЫ (рендер, драг, тап, обработчики клеток) =====
// -------------------------------------------------------------
// BASE RENDERING
// -------------------------------------------------------------

// Всегда видимый индикатор активного выделения (шапка карты) — без него забытое
// выделение от прошлого действия незаметно влияет на следующее (например, на
// групповую логику стрелок/купола), а на телефоне нет Escape, чтобы его снять.
function updateSelectionIndicator() {
    if (!DOM.selectionIndicator) return;
    const n = state.selectedIds.length;
    if (n === 0) {
        DOM.selectionIndicator.style.display = 'none';
    } else {
        DOM.selectionIndicator.style.display = 'flex';
        if (DOM.selectionCountText) {
            DOM.selectionCountText.textContent = `Выделено баз: ${n}${state.selectionColor ? ' (' + state.selectionColor.toUpperCase() + ')' : ''}`;
        }
    }
}

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

// Правило игры (см. ai_instructions.md): купол нельзя держать активным в Серой
// зоне. Раньше это проверялось только при включении купола руками — теперь
// вызывается после ЛЮБОГО изменения позиции базы (перетаскивание, групповой
// драг, входящая сетевая операция), чтобы купол не "залипал" включённым, если
// база переехала в серую зону перетаскиванием, а не через инструмент "dome".
function enforceDomeZoneRule(base) {
    if (base.dome && state.cells[`${base.row}-${base.col}`] === 'gray-zone') {
        base.dome = false;
        return true;
    }
    return false;
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

// Единая логика "клика/тапа" по базе (eraser/dome/shield/edit-modal/select).
// Вызывается и из настоящего 'click' (мышь), и напрямую из touch-логики в mouseup —
// это убирает зависимость от того, синтезирует ли браузер click после тача и когда именно
// (см. state.suppressNextBaseClick — не даёт выполнить действие дважды).
function runBaseTapAction(base) {
    if (isViewerMode) return;
    if (state.activeTool === 'eraser') {
        removeBase(base.id);
        // Ластик остаётся активным — можно удалить сразу несколько баз подряд.
    } else if (state.activeTool === 'dome') {
        // Групповое применение: если тап пришёлся на базу из активного выделения
        // (2+ баз), купол переключается у ВСЕХ выделенных баз разом, а не только
        // у той, на которую тапнули.
        const groupMode = state.selectedIds.length > 1 && state.selectedIds.includes(base.id);
        const targets = groupMode ? state.bases.filter(b => state.selectedIds.includes(b.id)) : [base];
        const turnOn = !base.dome; // направление переключения задаёт база, на которую тапнули

        let applied = 0, blocked = 0;
        targets.forEach(b => {
            if (turnOn) {
                if (state.cells[`${b.row}-${b.col}`] === 'gray-zone') { blocked++; return; }
                const hasEnemyAttackPaths = state.arrows.some(arrow => {
                    const startsInBase = isCellInBase(arrow.startCell.row, arrow.startCell.col, b);
                    if (startsInBase) {
                        const dstBase = state.bases.find(x => isCellInBase(arrow.endCell.row, arrow.endCell.col, x));
                        return !dstBase || dstBase.color !== b.color;
                    }
                    return false;
                });
                if (hasEnemyAttackPaths) { blocked++; return; }
            }
            b.dome = turnOn;
            sendBaseOp({ kind: 'update', id: b.id, dome: b.dome });
            applied++;
        });

        // Точечно патчим только реально изменившиеся базы вместо полной пересборки
        // карты — раньше даже переключение купола у ОДНОЙ базы перерисовывало
        // абсолютно все базы на карте.
        let anyPatchFailed = false;
        targets.forEach(b => { if (!patchBaseElement(b)) anyPatchFailed = true; });
        if (anyPatchFailed) renderBases();
        else renderBaseRoster();
        if (groupMode) {
            showToast(
                `Купол ${turnOn ? 'включён' : 'выключен'} у ${applied} баз` + (blocked > 0 ? `, пропущено — ${blocked} (серая зона/атака на чужих)` : ''),
                applied > 0 ? "success" : "error"
            );
        } else {
            showToast(
                applied > 0 ? (turnOn ? "Forcefield Dome activated!" : "Forcefield Dome deactivated") : "Купол нельзя включить (серая зона или атака на чужой альянс)",
                applied > 0 ? "success" : "error"
            );
        }
        // Купол остаётся активным инструментом — можно переключить следующую базу сразу.
    } else if (state.activeTool === 'shield') {
        // Аналогично — групповое применение щита на всё выделение
        const groupMode = state.selectedIds.length > 1 && state.selectedIds.includes(base.id);
        const targets = groupMode ? state.bases.filter(b => state.selectedIds.includes(b.id)) : [base];
        const turnOn = !base.shield;
        targets.forEach(b => {
            b.shield = turnOn;
            sendBaseOp({ kind: 'update', id: b.id, shield: b.shield }); // раньше щит не синхронизировался с другими командирами вообще
        });
        let anyShieldPatchFailed = false;
        targets.forEach(b => { if (!patchBaseElement(b)) anyShieldPatchFailed = true; });
        if (anyShieldPatchFailed) renderBases();
        else renderBaseRoster();
        showToast(
            groupMode
                ? `Щит ${turnOn ? 'включён' : 'выключен'} у ${targets.length} баз`
                : (turnOn ? "Shield rating active (base count: 1)!" : "Shield rating reset"),
            "success"
        );
        // Щит тоже остаётся активным инструментом.
    } else if (state.activeTool === 'neutral') {
        // "Указатель" — простой тап только подсвечивает базу, редактирование
        // теперь только через отдельный инструмент "Правка".
        const el = DOM.basesOverlay.querySelector(`.base-block[data-row="${base.row}"][data-col="${base.col}"]`);
        if (el) {
            el.classList.add('highlight-ping');
            setTimeout(() => el.classList.remove('highlight-ping'), 3000);
        }
    } else if (state.activeTool === 'edit') {
        openEditBaseModal(base);
        // Инструмент "Правка" остаётся активным — можно открыть следующую базу сразу.
    } else if (state.activeTool === 'select') {
        if (state.selectedIds.includes(base.id)) {
            state.selectedIds = state.selectedIds.filter(id => id !== base.id);
            if (state.selectedIds.length === 0) state.selectionColor = null;
            renderBases();
            updateSelectionIndicator();
        } else {
            if (state.selectionColor && base.color !== state.selectionColor) {
                showToast("В выделение можно добавлять только базы одного альянса!", "error");
                return;
            }
            state.selectionColor = state.selectionColor || base.color;
            state.selectedIds.push(base.id);
            renderBases();
            updateSelectionIndicator();
            showToast(`Выделено баз: ${state.selectedIds.length}`, "info");
        }
    }
}

// Точечно обновляет ОДНУ уже существующую базу (цвет/купол/щит-бейдж) без
// пересборки всех остальных баз на карте. Используется для входящих правок
// от других игроков (applyBaseOp 'update') — раньше ЛЮБое такое изменение
// (даже просто переключение купола) заново пересоздавало DOM для ВСЕХ баз
// у ВСЕХ подключённых клиентов, что при активной игре и многих зрителях
// давало заметные подтормаживания. Возвращает true, если патч применился
// (элемент найден); false — вызывающий код должен откатиться на renderBases().
function patchBaseElement(base) {
    const baseEl = DOM.basesOverlay.querySelector(`[data-base-id="${base.id}"]`);
    if (!baseEl) return false;

    baseEl.className = `base-block ${base.color}`;
    if (base.dome) baseEl.classList.add('domed');
    if (state.selectedIds.includes(base.id)) baseEl.classList.add('selected');

    const existingBadge = baseEl.querySelector('.base-shield-badge');
    const shieldVal = computeShieldCount(base);
    if (shieldVal > 0) {
        if (existingBadge) {
            existingBadge.innerHTML = `<i class="fa-solid fa-shield-halved" style="font-size: 7px; margin-right: 1px;"></i>${shieldVal}`;
        } else {
            const badge = document.createElement('div');
            badge.className = 'base-shield-badge';
            badge.innerHTML = `<i class="fa-solid fa-shield-halved" style="font-size: 7px; margin-right: 1px;"></i>${shieldVal}`;
            baseEl.appendChild(badge);
        }
    } else if (existingBadge) {
        existingBadge.remove();
    }
    return true;
}

// Строит DOM-элемент ОДНОЙ базы (используется и в renderBases() для полной
// пересборки, и в appendBaseElement() для лёгкого добавления одной новой базы
// без пересборки остальных — например, при рисовании протяжкой пальца).
function createBaseElement(base) {
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
    baseEl.dataset.baseId = base.id; // для точечного обновления без полной пересборки (patchBaseElement)

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
    } else if (base.color === 'brown') {
        baseTitle = "UBB BASE (BROWN)";
    } else if (base.color === 'indigo') {
        baseTitle = "KILL BASE (INDIGO)";
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
        // На тач-устройствах действие уже могло быть выполнено напрямую из
        // touch-логики в mouseup (см. runBaseTapAction) — тогда браузерный
        // click, который приходит следом, нужно один раз проигнорировать,
        // иначе действие (открытие модалки, тогл купола и т.п.) сработает дважды.
        if (state.suppressNextBaseClick) {
            state.suppressNextBaseClick = false;
            return;
        }
        runBaseTapAction(base);
    });

    // Mousedown handler for dragging bases
    baseEl.addEventListener('mousedown', (e) => {
        if (isViewerMode) return;

        // If drawing an arrow, route click to start drawing from this base cell
        if (state.activeTool === 'arrow') {
            e.stopPropagation();
            e.preventDefault();
            // completeArrowDrawing() уже мог переключить инструмент на 'neutral'
            // к моменту, когда браузер после mousedown пришлёт свой обычный click
            // по этой же базе — без подавления это открывало редактирование базы
            // сразу после успешного завершения стрелки.
            state.suppressNextBaseClick = true;
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
        // preventDefault нужен ТОЛЬКО для инструмента "Стрелка" — она выполняет
        // действие прямо в mousedown, и без подавления браузер чуть позже
        // присылает ещё и свой родной mousedown/click по той же базе (старт=финиш
        // → "must start and end at different cells"). Для остальных инструментов
        // (ластик/купол/щит/правка/выбор) действие срабатывает через click или
        // через определение тапа в mouseup — preventDefault их, наоборот, ломает,
        // подавляя единственное событие, на которое они полагаются.
        if (state.activeTool === 'arrow') {
            e.preventDefault();
        }
        const touch = e.touches[0];
        const simulatedEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0
        });
        baseEl.dispatchEvent(simulatedEvent);
    }, { passive: false });

    return baseEl;
}

// Добавляет ОДНУ новую базу в DOM без пересборки остальных — для рисования
// протяжкой пальца (много баз за один жест). Обновляет список в сайдбаре
// отдельно, т.к. это лёгкая операция по сравнению с пересборкой карты.
// Добавляет ОДНУ новую базу в DOM без пересборки остальных — для рисования
// протяжкой пальца (много баз за один жест). Список в сайдбаре обновляется
// с дебаунсом: пересобирать весь сгруппированный HTML списка на КАЖДУЮ
// поставленную клетку (15+ раз за жест) — впустую потраченная работа,
// одна пересборка через 150мс после последней постановки даёт тот же результат.
let rosterDebounceTimer = null;
function appendBaseElement(base) {
    const el = createBaseElement(base);
    el.classList.add('fade-in'); // анимация появления — только у реально новых баз
    DOM.basesOverlay.appendChild(el);
    clearTimeout(rosterDebounceTimer);
    rosterDebounceTimer = setTimeout(renderBaseRoster, 150);
}

function renderBases() {
    DOM.basesOverlay.innerHTML = '';
    
    state.bases.forEach(base => {
        DOM.basesOverlay.appendChild(createBaseElement(base));
    });
    renderBaseRoster();
}

// Список ВСЕХ баз на карте, сгруппированных по альянсам (сайдбар, "Список баз").
// В отличие от Squad Activity (только базы с привязанным игроком + статус активности),
// сюда попадают все базы — включая союзные/вражеские без игрока.
const ROSTER_ROLE_ORDER = ['attack', 'defense', 'reinforce', 'capture'];
const ROSTER_ROLE_ICONS = { attack: 'fa-crosshairs', defense: 'fa-shield-halved', reinforce: 'fa-people-arrows', capture: 'fa-flag' };

function renderBaseRoster() {
    const container = document.getElementById('base-roster-container');
    const badge = document.getElementById('roster-total-badge');
    if (!container) return;

    if (badge) badge.textContent = state.bases.length ? `(${state.bases.length})` : '';

    if (state.bases.length === 0) {
        container.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 10px; font-size: 11px;">Баз на карте пока нет</div>`;
        return;
    }

    const order = ['coral', 'blue', 'green', 'yellow', 'purple', 'brown', 'indigo', 'allied', 'red'];
    const groups = {};
    order.forEach(c => { groups[c] = []; });
    const otherGroup = [];

    state.bases.forEach(b => {
        if (groups[b.color]) groups[b.color].push(b);
        else otherGroup.push(b);
    });

    const renderPlayerRow = (b, label) => {
        const entryLabel = b.player ? b.player.name : label;
        const gx = b.col * 3 + state.coordOffset.x;
        const gy = b.row * 3 + state.coordOffset.y;
        const domeIcon = b.dome ? ' <i class="fa-solid fa-shield" title="Купол" style="color:#00d2ff;"></i>' : '';
        const shieldIcon = b.shield ? ' <i class="fa-solid fa-shield-halved" title="Щит" style="color:#ff9f43;"></i>' : '';
        return `
            <div class="roster-entry" onclick="focusBaseOnMapCoordinates(${b.row}, ${b.col})">
                <span class="roster-entry-name">${entryLabel}${domeIcon}${shieldIcon}</span>
                <span class="roster-entry-coords">X:${gx} Y:${gy}</span>
            </div>`;
    };

    const renderGroup = (label, swatch, list) => {
        // Группировка по ролям (Группировка): внутри альянса базы разбиты по
        // роли игрока (Атака/Защита/Подкрепление/Захват), чтобы было проще искать,
        // кому какая роль назначена, а не листать общий плоский список.
        const byRole = {};
        ROSTER_ROLE_ORDER.forEach(r => { byRole[r] = []; });
        const noRole = [];
        list.forEach(b => {
            const role = b.player && b.player.role;
            if (role && byRole[role]) byRole[role].push(b);
            else noRole.push(b);
        });

        const sortByPos = arr => arr.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));

        let roleHtml = '';
        ROSTER_ROLE_ORDER.forEach(role => {
            const roleList = sortByPos(byRole[role]);
            if (roleList.length === 0) return;
            roleHtml += `
                <div class="roster-role-group">
                    <div class="roster-role-header">
                        <span><i class="fa-solid ${ROSTER_ROLE_ICONS[role]}"></i> ${ROLE_LABELS_RU[role]} (${roleList.length})</span>
                        <i class="fa-solid fa-chevron-down roster-toggle-icon"></i>
                    </div>
                    <div class="roster-role-list">${roleList.map(b => renderPlayerRow(b, label)).join('')}</div>
                </div>`;
        });
        if (noRole.length > 0) {
            const sortedNoRole = sortByPos(noRole);
            roleHtml += `
                <div class="roster-role-group">
                    <div class="roster-role-header">
                        <span><i class="fa-solid fa-question"></i> Без роли (${noRole.length})</span>
                        <i class="fa-solid fa-chevron-down roster-toggle-icon"></i>
                    </div>
                    <div class="roster-role-list">${sortedNoRole.map(b => renderPlayerRow(b, label)).join('')}</div>
                </div>`;
        }

        return `
            <div class="roster-alliance-group">
                <div class="roster-alliance-header" style="border-left-color:${swatch};">
                    <span style="color:${swatch};"><i class="fa-solid fa-shield-halved"></i> ${label} (${list.length})</span>
                    <i class="fa-solid fa-chevron-down roster-toggle-icon"></i>
                </div>
                <div class="roster-alliance-list">${roleHtml}</div>
            </div>`;
    };

    let html = '';
    order.forEach(color => {
        if (groups[color].length > 0) {
            html += renderGroup(ALLIANCE_LABELS[color] || color, ALLIANCE_ARROW_COLORS[color] || '#a4b0be', groups[color]);
        }
    });
    if (otherGroup.length > 0) {
        html += renderGroup('Прочие', '#a4b0be', otherGroup);
    }

    container.innerHTML = html;
}

// Разворачивание/сворачивание групп в "Списке баз" (альянс И вложенная роль) —
// делегирование событий на document, т.к. группы перерисовываются динамически.
document.addEventListener('click', (e) => {
    const roleHeader = e.target.closest('.roster-role-header');
    if (roleHeader) {
        const roleGroup = roleHeader.closest('.roster-role-group');
        if (roleGroup) roleGroup.classList.toggle('open');
        return; // не даём клику дополнительно свернуть/развернуть родительский альянс
    }
    const header = e.target.closest('.roster-alliance-header');
    if (!header) return;
    const group = header.closest('.roster-alliance-group');
    if (!group) return;
    group.classList.toggle('open');
});

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
let desktopPaintActive = false;
let desktopPaintedCells = new Set();
let desktopPaintCount = 0;

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
        // Зажал и ведёшь мышью — ставит базы вдоль пути (см. mouseover ниже),
        // не нужно кликать по каждой клетке отдельно.
        desktopPaintActive = true;
        desktopPaintedCells.clear();
        desktopPaintedCells.add(`${r}-${c}`);
        desktopPaintCount = 0;
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

    if (desktopPaintActive && state.activeTool.startsWith('base-')) {
        const key = `${r}-${c}`;
        if (!desktopPaintedCells.has(key)) {
            desktopPaintedCells.add(key);
            const occupied = state.bases.some(b => b.row === r && b.col === c);
            if (!occupied) {
                const placed = placeBase(r, c, state.activeTool.split('-')[1], { silent: true });
                if (placed) desktopPaintCount++;
            }
        }
    }
});

window.addEventListener('mouseup', () => {
    if (desktopPaintActive && desktopPaintCount > 0) {
        showToast(`${t('paint.placed')}: ${desktopPaintCount + 1}`, 'success'); // +1 — первая база, поставленная обычным кликом
    }
    desktopPaintActive = false;
    desktopPaintedCells.clear();
    desktopPaintCount = 0;
});

