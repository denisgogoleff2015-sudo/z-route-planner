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
