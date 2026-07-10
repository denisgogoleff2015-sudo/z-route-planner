// ===== 02/9: СТРЕЛКИ (рисование, рендер, превью) =====
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
        return;
    }

    // ГРУППОВЫЕ СТРЕЛКИ: если стрелка начата с выделенной базы и выделено несколько баз
    // одного альянса — стрелка рисуется от КАЖДОЙ выделенной базы к той же цели.
    if (srcBase && state.selectedIds.length > 1 && state.selectedIds.includes(srcBase.id)) {
        const groupBases = state.bases.filter(b => state.selectedIds.includes(b.id));
        // Та же проверка "это столица/турель", что и для одиночной стрелки (с запасным
        // вариантом по границам зоны) — раньше тут проверялся только state.cells==='capital',
        // без бордер-фоллбэка, из-за чего турели могли не распознаваться как цель.
        const isTargetCapitalCell = state.cells[`${end.row}-${end.col}`] === 'capital' ||
                                    (end.row >= 21 && end.row <= 27 && end.col >= 21 && end.col <= 27);
        
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
    // Инструмент "Стрелка" остаётся активным — можно рисовать следующую сразу.
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

    // Превью должно сразу красится в цвет альянса базы-источника — так же, как
    // потом красится финальная стрелка в completeArrowDrawing (Правило 3). Раньше
    // тут всегда стоял state.activeArrowColor (последний вручную выбранный цвет),
    // из-за чего цвет во время рисования не совпадал с итоговым цветом стрелки.
    const srcBase = state.bases.find(b => isCellInBase(state.arrowStartCell.row, state.arrowStartCell.col, b));
    const previewColor = srcBase
        ? (ALLIANCE_ARROW_COLORS[srcBase.color] || state.activeArrowColor)
        : state.activeArrowColor;
    DOM.tempArrow.setAttribute('stroke', previewColor);
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
                notifyServerOfMapChange(); // без этого удаление стрелки не доходило до других командиров
                // Ластик остаётся активным — можно удалить сразу несколько стрелок подряд.
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

