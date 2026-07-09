// ===== 04/9: ВЬЮПОРТ (пан/зум) + МУЛЬТИВЫБОР (рамка) =====
// -------------------------------------------------------------
// VIEWPORT PAN AND ZOOM
// -------------------------------------------------------------

function applyZoom() {
    DOM.mapCanvasWrapper.style.transform = `scale(${state.zoomScale})`;
    DOM.zoomLevelText.innerText = `${Math.round(state.zoomScale * 100)}%`;
}

// Считает масштаб, при котором вся карта (48x48) целиком помещается в видимую область
// контейнера — используется как стартовый зум на телефоне и для кнопки "Вся карта".
function computeFitZoomScale() {
    const vp = DOM.mapContainer;
    if (!vp) return 1;
    const availW = vp.clientWidth;
    const availH = vp.clientHeight;
    const mapW = state.gridWidth * state.cellSize;
    const mapH = state.gridHeight * state.cellSize;
    if (!availW || !availH || !mapW || !mapH) return 1;
    // 0.94 — небольшой запас, чтобы карта не прилипала вплотную к краям экрана
    const scale = Math.min(availW / mapW, availH / mapH) * 0.94;
    return Math.max(0.3, Math.min(1, scale));
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
        DOM.mapCanvasWrapper.classList.add('no-anim'); // пауза анимации стрелок на время пана
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

            // Плавное перетаскивание "под пальцем/курсором" в пикселях, без привязки
            // к сетке на каждом кадре — раньше здесь стоял Math.round к клетке уже
            // во время движения, из-за чего база визуально прыгала скачками, а не
            // следовала за пальцем. Привязка к ближайшей клетке считается один раз
            // в mouseup (там уже есть Math.round от финального style.left/top).
            const maxLeft = (state.gridWidth - 1) * state.cellSize;
            const maxTop = (state.gridHeight - 1) * state.cellSize;
            const clampedX = Math.max(0, Math.min(maxLeft, x));
            const clampedY = Math.max(0, Math.min(maxTop, y));

            draggedEl.style.top = `${clampedY}px`;
            draggedEl.style.left = `${clampedX}px`;

            // Групповое перетаскивание: остальные участники следуют тем же
            // пиксельным сдвигом (тоже плавно, без промежуточного округления).
            if (state.groupDrag) {
                const dRowPx = clampedY - state.originalPos.row * state.cellSize;
                const dColPx = clampedX - state.originalPos.col * state.cellSize;
                state.groupDrag.forEach(m => {
                    if (m.id === state.draggedBaseId || !m.el) return;
                    m.el.style.top = `${m.origRow * state.cellSize + dRowPx}px`;
                    m.el.style.left = `${m.origCol * state.cellSize + dColPx}px`;
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
        DOM.mapCanvasWrapper.classList.remove('no-anim');
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
                    // Купол снимается у всех базы группы, оказавшихся в Серой зоне
                    let anyDomeRemoved = false;
                    state.groupDrag.forEach(m => {
                        const b = state.bases.find(bb => bb.id === m.id);
                        if (b && enforceDomeZoneRule(b)) {
                            anyDomeRemoved = true;
                            sendBaseOp({ kind: 'update', id: b.id, dome: false });
                        }
                    });
                    showToast(
                        `Группа из ${state.groupDrag.length} баз перемещена` +
                        (anyDomeRemoved ? " — купол снят у баз в Серой зоне" : ""),
                        "success"
                    );
                    notifyServerOfMapChange();
                } else if (failReason) {
                    showToast(failReason + " — перемещение группы отменено", "error");
                }
            }
            // Одиночный сброс
            else if (row === base.row && col === base.col) {
                if (state.suppressNextBaseClick) {
                    // Действие уже выполнено долгим нажатием — просто гасим флаг.
                    state.suppressNextBaseClick = false;
                } else {
                    // Тап без реального перемещения (частый случай на мобиле — палец
                    // на месте, а не жест перетаскивания). Не двигаем базу и не шлём
                    // операцию move на сервер. Вместо того чтобы ждать, синтезирует ли
                    // браузер после тача событие click (ненадёжно по таймингу — именно
                    // это давало эффект "открывается редактирование, а потом двигается
                    // вместе с окном"), выполняем действие тут же сами и подавляем
                    // следующий click, чтобы оно не сработало повторно.
                    runBaseTapAction(base);
                    state.suppressNextBaseClick = true;
                }
            }
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
                    const domeRemoved = enforceDomeZoneRule(base);
                    showToast(
                        domeRemoved ? "База перемещена — купол снят (Серая зона)!" : "Base repositioned",
                        domeRemoved ? "info" : "success"
                    );
                    // Совместное редактирование: операция перемещения
                    sendBaseOp({ kind: 'move', id: base.id, row: row, col: col });
                    if (domeRemoved) sendBaseOp({ kind: 'update', id: base.id, dome: false });
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

