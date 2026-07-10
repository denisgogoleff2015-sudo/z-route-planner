// ===== 06/9: РЕДАКТИРОВАНИЕ БАЗЫ (модалка) + REALTIME WEBSOCKET SYNC =====
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

                    // Подгонка карты под экран на мобиле — раньше срабатывала только по
                    // таймеру в 300мс от загрузки страницы, что на медленном соединении
                    // (карта ещё не пришла с сервера) давало неправильный масштаб — карта
                    // оказывалась сжатой в углу с кучей пустого места вокруг. Теперь
                    // делаем это здесь, когда сетка ТОЧНО перестроена по реальным данным.
                    if (isMobile() && !mobileFitApplied) {
                        mobileFitApplied = true;
                        requestAnimationFrame(() => {
                            const vp = DOM.mapContainer;
                            if (!vp) return;
                            state.zoomScale = computeFitZoomScale();
                            applyZoom();
                            vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
                            vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
                        });
                    }
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
            enforceDomeZoneRule(b); // гасим купол локально, если база переехала в Серую зону
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
            secretKey: getSecretKey()
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
            secretKey: getSecretKey()
        };
        wsConnection.send(JSON.stringify(payload));
        // Отправка ушла на живой сокет — правки командира доставлены серверу.
        if (!isViewerMode) {
            hasLocalEdits = false;
        }
    }
}

