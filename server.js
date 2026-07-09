const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'map_state.json');
// Пароли редактирования (командиры). Просмотр доступен всем без пароля.
// ВНИМАНИЕ: смени эти значения на несловарные перед публичным запуском.
const COMMANDER_PASSWORDS = ['1234', '1998'];

// Инициализация стандартного состояния карты (48х48)
function getDefaultMapState() {
    const cells = {};
    for (let r = 0; r < 48; r++) {
        for (let c = 0; c < 48; c++) {
            const key = `${r}-${c}`;
            if (r >= 21 && r <= 27 && c >= 21 && c <= 27) {
                cells[key] = 'capital';
            } else if (r >= 7 && r <= 41 && c >= 7 && c <= 41) {
                cells[key] = 'gray-zone';
            } else {
                cells[key] = 'green-zone';
            }
        }
    }
    
    return {
        gridWidth: 48,
        gridHeight: 48,
        coordOffset: { x: 428, y: 428 },
        cells: cells,
        bases: [],
        arrows: [],
        markers: [
            { id: 'weapon_nw', row: 21, col: 21, icon: 'fa-crosshairs', label: 'NW Turret (491,491)' },
            { id: 'weapon_sw', row: 27, col: 21, icon: 'fa-crosshairs', label: 'SW Turret (491,509)' },
            { id: 'weapon_ne', row: 21, col: 27, icon: 'fa-crosshairs', label: 'NE Turret (509,491)' },
            { id: 'weapon_se', row: 27, col: 27, icon: 'fa-crosshairs', label: 'SE Turret (509,509)' }
        ]
    };
}

// Загрузка состояния из файла
let mapState = null;
try {
    if (fs.existsSync(STATE_FILE)) {
        mapState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        console.log("Состояние тактической карты загружено из файла.");
    } else {
        mapState = getDefaultMapState();
        fs.writeFileSync(STATE_FILE, JSON.stringify(mapState, null, 2));
        console.log("Создан новый файл состояния карты.");
    }
} catch (e) {
    console.error("Ошибка при чтении файла состояния:", e);
    mapState = getDefaultMapState();
}

// Отдача статических файлов (HTML, JS, CSS)
app.use(express.static(__dirname));

// Broadcast функция для рассылки всем клиентам
function broadcastMapState() {
    const payload = JSON.stringify({
        type: 'map_update',
        data: mapState
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Рассылка одной операции всем клиентам (совместное редактирование баз)
function broadcastOp(op) {
    const payload = JSON.stringify({ type: 'map_op', op });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Троттлинг записи в файл: не пишем на каждую операцию, а раз в 1.5с
let saveTimer = null;
function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try { fs.writeFileSync(STATE_FILE, JSON.stringify(mapState, null, 2)); }
        catch (e) { console.error('save error:', e); }
    }, 1500);
}

// Обработка WebSocket соединений
wss.on('connection', (ws) => {
    console.log("Новое подключение к серверу.");
    
    // При подключении отправляем текущее состояние
    ws.send(JSON.stringify({
        type: 'map_update',
        data: mapState
    }));
    
    ws.on('message', (messageStr) => {
        try {
            const message = JSON.parse(messageStr);
            
            if (message.type === 'request_map') {
                ws.send(JSON.stringify({
                    type: 'map_update',
                    data: mapState
                }));
            }

            // ===== СОВМЕСТНОЕ РЕДАКТИРОВАНИЕ БАЗ (операции) =====
            // Каждый командир шлёт не всю карту, а одну операцию.
            // Сервер применяет её к ОБЩЕЙ карте и рассылает операцию всем.
            // "Последнее действие побеждает" при конфликте по одной базе.
            else if (message.type === 'map_op') {
                // Только командир с верным паролем может менять карту
                if (!COMMANDER_PASSWORDS.includes(message.secretKey)) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Неверный пароль редактора!' }));
                    return;
                }
                const op = message.op || {};
                let applied = false;

                if (op.kind === 'add' && op.base) {
                    const b = op.base;
                    if (b.row >= 0 && b.row < 48 && b.col >= 0 && b.col < 48
                        && mapState.cells[`${b.row}-${b.col}`] !== 'capital') {
                        // убираем любую базу, уже стоящую в этой клетке (last-write-wins)
                        mapState.bases = mapState.bases.filter(x => !(x.row === b.row && x.col === b.col));
                        mapState.bases.push(b);
                        applied = true;
                    }
                }
                else if (op.kind === 'remove' && op.id) {
                    const before = mapState.bases.length;
                    mapState.bases = mapState.bases.filter(x => x.id !== op.id);
                    applied = mapState.bases.length !== before;
                }
                else if (op.kind === 'move' && op.id) {
                    const b = mapState.bases.find(x => x.id === op.id);
                    if (b && op.row >= 0 && op.row < 48 && op.col >= 0 && op.col < 48
                        && mapState.cells[`${op.row}-${op.col}`] !== 'capital') {
                        // освобождаем целевую клетку от чужой базы
                        mapState.bases = mapState.bases.filter(x => x.id === op.id || !(x.row === op.row && x.col === op.col));
                        b.row = op.row; b.col = op.col;
                        applied = true;
                    }
                }
                else if (op.kind === 'update' && op.id) {
                    const b = mapState.bases.find(x => x.id === op.id);
                    if (b) {
                        if ('color' in op) b.color = op.color;
                        if ('shield' in op) b.shield = op.shield;
                        if ('dome' in op) b.dome = op.dome;
                        applied = true;
                    }
                }

                if (applied) {
                    broadcastOp(op);   // рассылаем операцию всем (включая отправителя — для подтверждения)
                    scheduleSave();    // отложенная запись в файл
                }
                return;
            }
            
            else if (message.type === 'update_map') {
                const role = message.role || 'player';
                const clientData = message.data;
                
                if (role === 'commander') {
                    // Проверка пароля командира (любой из списка)
                    if (!COMMANDER_PASSWORDS.includes(message.secretKey)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Неверный пароль редактора! Изменения не сохранены.'
                        }));
                        return;
                    }
                    
                    // Обновляем все структуры
                    mapState.cells = clientData.cells || mapState.cells;
                    mapState.arrows = clientData.arrows || mapState.arrows;
                    mapState.bases = clientData.bases || mapState.bases;
                    
                    // Сохраняем и рассылаем всем
                    fs.writeFileSync(STATE_FILE, JSON.stringify(mapState, null, 2));
                    broadcastMapState();
                    console.log("Карта обновлена командиром.");
                } 
                
                else if (role === 'player') {
                    // Обычный игрок / командир-viewer прислал базы игроков.
                    // Обрабатываем КАЖДУЮ присланную базу игрока (не только последнюю),
                    // чтобы добавление нескольких игроков не терялось.
                    const incoming = (clientData.bases || []).filter(
                        b => b.player && b.player.name
                    );
                    if (incoming.length === 0) return;

                    let changed = false;
                    for (const nb of incoming) {
                        const { row, col, color, player } = nb;
                        if (!player || !player.name) continue;

                        // 1. Границы
                        if (row < 0 || row >= 48 || col < 0 || col >= 48) continue;

                        // 2. Только зелёная зона
                        if (mapState.cells[`${row}-${col}`] !== 'green-zone') {
                            ws.send(JSON.stringify({ type: 'error', message: `База ${player.name}: только в Зелёной зоне!` }));
                            continue;
                        }

                        // 3. Клетка занята ДРУГИМ игроком?
                        const occupied = mapState.bases.some(b => {
                            const same = b.player && b.player.name.toLowerCase() === player.name.toLowerCase();
                            return !same && b.row === row && b.col === col;
                        });
                        if (occupied) {
                            ws.send(JSON.stringify({ type: 'error', message: `Клетка (${row},${col}) занята!` }));
                            continue;
                        }

                        // Удаляем прежнюю базу этого игрока (по имени) и ставим новую
                        mapState.bases = mapState.bases.filter(
                            b => !b.player || b.player.name.toLowerCase() !== player.name.toLowerCase()
                        );
                        mapState.bases.push({
                            id: 'player_' + player.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
                            row, col, color,
                            shield: false, dome: false,
                            player
                        });
                        changed = true;
                        console.log(`База игрока ${player.name} зарегистрирована.`);
                    }

                    if (changed) {
                        fs.writeFileSync(STATE_FILE, JSON.stringify(mapState, null, 2));
                        broadcastMapState();
                    }
                    return;
                }
            }
        } catch (e) {
            console.error("Ошибка обработки входящего сообщения:", e);
        }
    });
});

server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Сервер тактического планировщика запущен!`);
    console.log(`Адрес: http://localhost:${PORT}`);
    console.log(`Пароли командиров для редактирования: ${COMMANDER_PASSWORDS.join(', ')}`);
    console.log(`=================================================`);
});
