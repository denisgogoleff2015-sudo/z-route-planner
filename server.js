require('dotenv').config(); // подхватывает .env из корня проекта — файл не в git (см. .gitignore)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'map_state.json');
const ARTICLES_FILE = path.join(__dirname, 'articles.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
// Пароли редактирования (командиры). Просмотр доступен всем без пароля.
// ВНИМАНИЕ: смени эти значения на несловарные перед публичным запуском.
const COMMANDER_PASSWORDS = ['1234', '1998'];
// Ключ DeepSeek API для перевода статей — задаётся переменной окружения на сервере,
// никогда не передаётся и не хранится на клиенте. API OpenAI-совместимый.
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

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

// Загрузка списка статей (Устав / Туториалы / Межконт. война)
let articles = [];
try {
    if (fs.existsSync(ARTICLES_FILE)) {
        articles = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8'));
    } else {
        fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2));
    }
} catch (e) {
    console.error("Ошибка при чтении файла статей:", e);
    articles = [];
}
function saveArticles() {
    try { fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2)); }
    catch (e) { console.error('save articles error:', e); }
}

// Отдача статических файлов (HTML, JS, CSS)
app.use(express.static(__dirname));
app.use(express.json({ limit: '2mb' })); // тело статей — только текст/HTML, картинки идут отдельным маршрутом

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

// -------------------------------------------------------------
// СТАТЬИ (Устав / Туториалы VS / Межконт. война) — REST API
// -------------------------------------------------------------

// Список статей — читать может любой (viewer тоже читает устав/туториалы)
app.get('/api/articles', (req, res) => {
    res.json(articles);
});

// Создание/обновление статьи — только командир (R4/R5, проверка тем же паролем,
// что и вся остальная защита в этом проекте)
app.post('/api/articles', (req, res) => {
    const { secretKey, id, category, title, content } = req.body || {};
    if (!COMMANDER_PASSWORDS.includes(secretKey)) {
        return res.status(403).json({ error: 'Неверный пароль командования' });
    }
    if (!category || !title || !content) {
        return res.status(400).json({ error: 'Не хватает полей (category/title/content)' });
    }

    const now = Date.now();
    if (id) {
        const existing = articles.find(a => a.id === id);
        if (!existing) return res.status(404).json({ error: 'Статья не найдена' });
        existing.category = category;
        existing.title = title;
        existing.content = content;
        existing.images = req.body.images || existing.images || [];
        existing.updatedAt = now;
        saveArticles();
        return res.json(existing);
    }

    const newArticle = {
        id: 'article_' + now + '_' + Math.random().toString(36).slice(2, 8),
        category, title, content,
        images: req.body.images || [],
        createdAt: now,
        updatedAt: now
    };
    articles.push(newArticle);
    saveArticles();
    res.json(newArticle);
});

// Удаление статьи — только командир
app.delete('/api/articles/:id', (req, res) => {
    const secretKey = req.query.secretKey || (req.body && req.body.secretKey);
    if (!COMMANDER_PASSWORDS.includes(secretKey)) {
        return res.status(403).json({ error: 'Неверный пароль командования' });
    }
    const before = articles.length;
    articles = articles.filter(a => a.id !== req.params.id);
    if (articles.length === before) return res.status(404).json({ error: 'Статья не найдена' });
    saveArticles();
    res.json({ success: true });
});

// Загрузка изображения для статьи — сжимаем (макс. ширина 1600px, WebP качество 80)
// перед сохранением на диск, чтобы не раздувать место/трафик на слабом сервере.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        const secretKey = req.body && req.body.secretKey;
        if (!COMMANDER_PASSWORDS.includes(secretKey)) {
            return res.status(403).json({ error: 'Неверный пароль командования' });
        }
        if (!req.file) return res.status(400).json({ error: 'Файл не получен' });

        const filename = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.webp';
        const outPath = path.join(UPLOADS_DIR, filename);
        await sharp(req.file.buffer)
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outPath);

        res.json({ url: `/uploads/${filename}` });
    } catch (e) {
        console.error('upload-image error:', e);
        res.status(500).json({ error: 'Не удалось обработать изображение' });
    }
});

// Перевод статьи через DeepSeek API (OpenAI-совместимый формат) — сервер лишь
// пересылает запрос, вся тяжёлая работа считается на стороне DeepSeek, не на этом VDS.
app.post('/api/translate', async (req, res) => {
    const { secretKey, title, content, sourceLang, targetLang } = req.body || {};
    if (!COMMANDER_PASSWORDS.includes(secretKey)) {
        return res.status(403).json({ error: 'Неверный пароль командования' });
    }
    if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: 'DEEPSEEK_API_KEY не настроен на сервере' });
    }
    if (!title || !content) {
        return res.status(400).json({ error: 'Не хватает полей (title/content)' });
    }

    const langNames = { ru: 'Russian', en: 'English' };
    const srcName = langNames[sourceLang] || sourceLang;
    const dstName = langNames[targetLang] || targetLang;

    const prompt = `Translate the following article from ${srcName} to ${dstName}.
Preserve the original tone, style, and voice as closely as possible — this is not a literal
word-for-word translation, but a natural rendition a native ${dstName} speaker in this community
would write. Preserve all HTML tags exactly (do not add, remove, or reorder tags — only translate
the text between them). Do not translate proper nouns, alliance names, or in-game terms that are
already commonly used untranslated (e.g. ZOG, S72, FoE, BfE, dome, capital).

Respond with ONLY a JSON object of the exact form {"title": "...", "content": "..."} and nothing else —
no markdown code fences, no commentary.

TITLE:
${title}

CONTENT (HTML):
${content}`;

    try {
        const apiRes = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-v4-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 4096
            })
        });

        if (!apiRes.ok) {
            const errText = await apiRes.text();
            console.error('DeepSeek API error:', apiRes.status, errText);
            return res.status(502).json({ error: 'Ошибка запроса к DeepSeek API' });
        }

        const data = await apiRes.json();
        const rawText = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        const cleaned = rawText.replace(/^```json\s*|```\s*$/g, '').trim();
        const parsed = JSON.parse(cleaned);
        res.json(parsed);
    } catch (e) {
        console.error('translate error:', e);
        res.status(500).json({ error: 'Не удалось выполнить перевод' });
    }
});

server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Сервер тактического планировщика запущен!`);
    console.log(`Адрес: http://localhost:${PORT}`);
    console.log(`Пароли командиров для редактирования: ${COMMANDER_PASSWORDS.join(', ')}`);
    console.log(`Перевод статей через DeepSeek API: ${DEEPSEEK_API_KEY ? 'включён' : 'ВЫКЛЮЧЕН (нет DEEPSEEK_API_KEY)'}`);
    console.log(`=================================================`);
});
