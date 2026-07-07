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
const COMMANDER_PASSWORD = '1234'; // Пароль командира для редактирования (можно изменить)

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
                    // Проверка пароля командира
                    if (message.secretKey !== COMMANDER_PASSWORD) {
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
                    // Обычный игрок прислал обновление своей базы
                    const playerBases = (clientData.bases || []).filter(b => b.id === 'user_base');
                    if (playerBases.length === 0) return;
                    
                    const newBase = playerBases[0];
                    const { row, col, color, player } = newBase;
                    
                    // 1. Проверка границ сетки
                    if (row < 0 || row >= 48 || col < 0 || col >= 48) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Координаты выходят за пределы карты!' }));
                        return;
                    }
                    
                    // 2. Проверка зоны (только зеленая зона)
                    const cellKey = `${row}-${col}`;
                    if (mapState.cells[cellKey] !== 'green-zone') {
                        ws.send(JSON.stringify({ type: 'error', message: 'Базу можно ставить только в Зелёной зоне!' }));
                        return;
                    }
                    
                    // 3. Проверка занятости клетки (нельзя ставить базы друг на друга!)
                    // Ищем любую базу (как обычные базы командира, так и базы других игроков), 
                    // которая уже стоит на клетке (row, col)
                    const isOccupied = mapState.bases.some(b => {
                        // Исключаем старую базу этого же игрока по его имени
                        const isSamePlayer = b.player && player && b.player.name.toLowerCase() === player.name.toLowerCase();
                        return !isSamePlayer && b.row === row && b.col === col;
                    });
                    
                    if (isOccupied) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Эта клетка уже занята другой базой!' }));
                        return;
                    }
                    
                    // Удаляем старое нахождение этого игрока на карте по имени
                    if (player && player.name) {
                        mapState.bases = mapState.bases.filter(b => !b.player || b.player.name.toLowerCase() !== player.name.toLowerCase());
                    }
                    
                    // Добавляем обновленную базу с уникальным ID на сервере
                    const finalBaseId = 'player_' + player.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
                    mapState.bases.push({
                        id: finalBaseId,
                        row: row,
                        col: col,
                        color: color,
                        shield: false,
                        dome: false,
                        player: player
                    });
                    
                    // Сохраняем в файл и рассылаем всем
                    fs.writeFileSync(STATE_FILE, JSON.stringify(mapState, null, 2));
                    broadcastMapState();
                    console.log(`База игрока ${player.name} успешно зарегистрирована на сервере.`);
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
    console.log(`Пароль командира для редактирования: ${COMMANDER_PASSWORD}`);
    console.log(`=================================================`);
});
