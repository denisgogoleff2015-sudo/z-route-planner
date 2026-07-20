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

        pushUndoSnapshot();
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
                    // Своё же эхо (сервер рассылает всем, включая отправителя) —
                    // мы это изменение уже применили и отрисовали локально.
                    const sig = opSignature(message.op || {});
                    if (recentOwnOps.has(sig)) {
                        recentOwnOps.delete(sig);
                        return;
                    }
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
                    state.markers = data.markers || state.markers;

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
                        // focusPendingUserBase — после подгонки, а не параллельно с ней:
                        // applyMobileFitToScreen сама выставляет scrollLeft/scrollTop
                        // (центр всей карты), и если сфокусироваться на базе раньше,
                        // подгонка тут же перезапишет скролл и собьёт фокус.
                        requestAnimationFrame(() => {
                            applyMobileFitToScreen();
                            focusPendingUserBase();
                        });
                    } else {
                        focusPendingUserBase();
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
    let needsFullRender = true; // безопасный дефолт — патчим только там, где точно уверены, что можно

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
            // Самый частый случай в активной игре (переключение купола/щита) —
            // точечно патчим DOM только этой базы, не трогая остальные (см.
            // patchBaseElement в 03-bases-render.js). Полная пересборка тут не нужна:
            // позиция и состав баз не меняются, только классы/бейдж одной из них.
            needsFullRender = !patchBaseElement(b);
            if (!needsFullRender && typeof renderBaseRoster === 'function') {
                renderBaseRoster(); // список баз в сайдбаре тоже должен видеть купол/щит
            }
        }
    }

    if (needsFullRender) {
        // Структурные изменения (добавление/удаление/перемещение) или неудачный
        // патч — пересобираем базы и стрелки полностью, как раньше.
        renderBases();
        if (typeof renderArrows === 'function') renderArrows();
    }
    // Успешный точечный патч (op.kind === 'update') сюда не доходит — стрелки от
    // dome/shield/цвета визуально не зависят (проверено), пересборка не нужна.
}

// Отправить операцию с базой на сервер (только командир).
// Подпись операции для распознавания собственного эха. Не идеально уникальна
// теоретически, но на практике коллизии исключены: id баз содержат timestamp+random.
const recentOwnOps = new Set();
function opSignature(op) {
    if (op.kind === 'add' && op.base) return 'add:' + op.base.id;
    if (op.kind === 'remove') return 'remove:' + op.id;
    if (op.kind === 'move') return `move:${op.id}:${op.row}:${op.col}`;
    if (op.kind === 'update') return `update:${op.id}:${op.color ?? ''}:${op.shield ?? ''}:${op.dome ?? ''}`;
    return JSON.stringify(op);
}

function sendBaseOp(op) {
    if (isViewerMode) return; // игроки шлют базы старым путём
    if (isConnectedToServer && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        // Запоминаем "подпись" своей операции: сервер рассылает op ВСЕМ клиентам,
        // включая нас самих. Раньше это эхо заново прогонялось через applyBaseOp
        // (для 'add' — полная пересборка всех баз!), т.е. каждая своя правка
        // отрисовывалась дважды. Теперь своё эхо распознаём и пропускаем.
        recentOwnOps.add(opSignature(op));
        if (recentOwnOps.size > 200) { // страховка от бесконечного роста
            recentOwnOps.clear();
        }
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

// ===== ОТМЕНА / ПОВТОР ДЕЙСТВИЙ (последние 3 правки командира) =====
// Снимок — полное состояние карты (serializeMapState), не отдельная операция.
// Вызывающий код сам решает, ПЕРЕД каким действием звать pushUndoSnapshot() —
// один снимок должен соответствовать одному жесту пользователя (например,
// групповое удаление 3 баз — один снимок, а не три), иначе 3 слота истории
// съедаются одним действием и Ctrl+Z перестаёт совпадать с ожиданием "отменить
// то, что я только что сделал".
const MAX_UNDO_DEPTH = 3;
let undoStack = [];
let redoStack = [];

function updateUndoRedoButtons() {
    if (DOM.btnUndo) DOM.btnUndo.disabled = undoStack.length === 0;
    if (DOM.btnRedo) DOM.btnRedo.disabled = redoStack.length === 0;
    if (DOM.mbUndo) DOM.mbUndo.disabled = undoStack.length === 0;
    if (DOM.mbRedo) DOM.mbRedo.disabled = redoStack.length === 0;
}

// serializeMapState() отдаёт ссылки на живые state.bases/arrows/cells/markers,
// а не копию — если положить её как есть в стек истории, последующая мутация
// этих же массивов испортит и "снимок" тоже (тот же объект в памяти). Карта —
// обычные JSON-совместимые данные без функций/дат, так что JSON-раунд-трип —
// самый простой надёжный способ получить настоящую независимую копию.
function cloneMapState() {
    return JSON.parse(JSON.stringify(serializeMapState()));
}

function pushUndoSnapshot() {
    if (isViewerMode) return;
    undoStack.push(cloneMapState());
    if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();
    redoStack = []; // новое действие обнуляет историю "вперёд"
    updateUndoRedoButtons();
}

function undoLastAction() {
    if (isViewerMode || undoStack.length === 0) return;
    redoStack.push(cloneMapState());
    if (redoStack.length > MAX_UNDO_DEPTH) redoStack.shift();
    loadMapState(undoStack.pop());
    notifyServerOfMapChange();
    updateUndoRedoButtons();
    showToast('Действие отменено', 'success');
}

function redoLastAction() {
    if (isViewerMode || redoStack.length === 0) return;
    undoStack.push(cloneMapState());
    if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();
    loadMapState(redoStack.pop());
    notifyServerOfMapChange();
    updateUndoRedoButtons();
    showToast('Действие повторено', 'success');
}

window.addEventListener('keydown', (e) => {
    if (isViewerMode) return;
    // Не перехватываем горячие клавиши, когда фокус в текстовом поле/textarea —
    // иначе Ctrl+Z в описании базы или тексте заметки откатывал бы карту вместо
    // обычного отката текста в самом поле.
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') {
        e.preventDefault();
        if (e.shiftKey) redoLastAction(); else undoLastAction();
    } else if (e.key === 'y' || e.key === 'Y' || e.key === 'н' || e.key === 'Н') {
        e.preventDefault();
        redoLastAction();
    }
});

