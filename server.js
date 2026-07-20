require('dotenv').config(); // подхватывает .env из корня проекта — файл не в git (см. .gitignore)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// sharp — необязательная зависимость (нужна только для сжатия фото в статьях).
// Если она не грузится (например, Node на сервере слишком старый — sharp требует
// Node 20+), весь остальной сайт (карта, статьи, перевод) не должен падать из-за
// этого. Раньше падал целиком: require('sharp') был без try/catch.
let sharp = null;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('[!] sharp не загрузился (нужен Node 20+) — сжатие фото отключено, но остальной сайт работает.');
    console.warn('    Причина:', e.message);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'map_state.json');
const ARTICLES_FILE = path.join(__dirname, 'articles.json');
const NOTIFICATION_FILE = path.join(__dirname, 'notification.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
// Пароли редактирования (командиры). Просмотр доступен всем без пароля.
// Задаются через .env (COMMANDER_PASSWORD / ADMIN_PASSWORD), а не хардкодом —
// раньше значения '1234'/'1998' лежали прямо в этом файле и дублировались в
// клиентском JS открытым текстом (видно любому через "просмотр кода страницы"),
// что делало командирский доступ по сути незащищённым. ADMIN_PASSWORD — тот же
// доступ командира, плюс включает showAiTools на клиенте.
const COMMANDER_PASSWORD = process.env.COMMANDER_PASSWORD || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COMMANDER_PASSWORDS = [COMMANDER_PASSWORD, ADMIN_PASSWORD].filter(Boolean);
if (COMMANDER_PASSWORDS.length === 0) {
    console.warn('[!] COMMANDER_PASSWORD / ADMIN_PASSWORD не заданы в .env — командирский режим недоступен никому, пока не задашь их.');
}
// Ключ DeepSeek API для перевода статей — задаётся переменной окружения на сервере,
// никогда не передаётся и не хранится на клиенте. API OpenAI-совместимый.
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
// Общий список языков для промптов перевода — один список на все эндпоинты,
// чтобы добавление нового языка требовало правки в одном месте, а не в двух.
const LANG_NAMES = { ru: 'Russian', en: 'English', fr: 'French', de: 'German' };
// Словарь игровых терминов для промптов перевода — расширяй списком по мере
// того, как находятся новые случаи "дословный/транслитерированный перевод
// вместо устоявшегося термина сообщества" (например: fighter → боец, не файтер).
const GAME_TERMINOLOGY_NOTE = `Game terminology rules:
- Translate "fighter" (as a troop/unit type, e.g. "upgrade fighters") to the natural community term in the target language, NOT a transliteration. In Russian, that is "боец" (plural "бойцы"/"бойцов"), never "файтер".
- Keep these exact names UNCHANGED in any target language — they are proper nouns / named in-game resources, not translatable concepts: ZOG, S72, FoE, BfE, UBB, Kill, dome, capital, SvS, VS, Fighter Parts, Fighter XP, Hero XP, Mission Readiness, Drill Ground, Hall of Heroes. Note: "Kill" here is an alliance tag/proper noun, not the verb — never translate it as a verb.`;

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

// Недельные уведомления VS — повторяющийся цикл из 6 дней (Пн=1 ... Сб=6,
// Вс — без уведомления). Командир заполняет один раз, дальше сайт сам
// показывает нужный день по текущей дате (с учётом сброса в 5 утра по Москве —
// эта логика на клиенте, сервер просто хранит все 6 текстов как есть).
let weeklyNotifications = {}; // { "1": {en,ru}, ..., "6": {en,ru} }
try {
    if (fs.existsSync(NOTIFICATION_FILE)) {
        weeklyNotifications = JSON.parse(fs.readFileSync(NOTIFICATION_FILE, 'utf8'));
    }
} catch (e) {
    console.error("Ошибка при чтении файла уведомлений:", e);
    weeklyNotifications = {};
}
function saveWeeklyNotifications() {
    try { fs.writeFileSync(NOTIFICATION_FILE, JSON.stringify(weeklyNotifications, null, 2)); }
    catch (e) { console.error('save notifications error:', e); }
}

// Отдача статических файлов (HTML, JS, CSS)
app.use(express.static(__dirname));
app.use(express.json({ limit: '2mb' })); // тело статей — только текст/HTML, картинки идут отдельным маршрутом

// Проверка пароля командования. Клиент присылает то, что ввёл человек, сервер
// отвечает только boolean-флагами (valid/isAdmin) — сам пароль никогда не
// уходит обратно и нигде не хранится в клиентском коде.
app.post('/api/verify-key', (req, res) => {
    const { secretKey } = req.body || {};
    const valid = !!secretKey && COMMANDER_PASSWORDS.includes(secretKey);
    const isAdmin = valid && !!ADMIN_PASSWORD && secretKey === ADMIN_PASSWORD;
    res.json({ valid, isAdmin });
});

// Полное состояние карты как обычный REST GET — раньше карту можно было получить
// только через WebSocket (request_map), что не годится для разовых операций вроде
// кнопки "Полный бэкап сайта" (карта+статьи+уведомления одним файлом). Читать
// может любой — то же самое и так рассылается всем подключённым по WS.
app.get('/api/map-state', (req, res) => {
    res.json(mapState);
});

// Broadcast функция для рассылки всем клиентам
// Полная рассылка состояния карты. cells (зоны 48x48 = 2304 записи) НЕ шлём
// повторно — эта часть карты фактически статична после первого запуска (кисти
// для перекраски зон нигде в интерфейсе не задействованы), так что пересылать
// её при каждом групповом редактировании/импорте всем подключённым клиентам —
// чистые лишние килобайты трафика на ровном месте. Клиент и так уже держит
// актуальные cells с момента своего подключения (см. ws.on('connection', ...)
// ниже, где полное состояние, включая cells, отправляется один раз).
function broadcastMapState() {
    const payload = JSON.stringify({
        type: 'map_update',
        data: {
            bases: mapState.bases,
            arrows: mapState.arrows,
            markers: mapState.markers,
            gridWidth: mapState.gridWidth,
            gridHeight: mapState.gridHeight,
            coordOffset: mapState.coordOffset
        }
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
                    mapState.markers = clientData.markers || mapState.markers;
                    
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
    const { secretKey, id, category, lang, title, content, isManualTranslationEdit } = req.body || {};
    if (!COMMANDER_PASSWORDS.includes(secretKey)) {
        return res.status(403).json({ error: 'Неверный пароль командования' });
    }
    // Английский — единственный оригинал статьи (lang должен быть 'en' для
    // создания/основной правки). Другие языки — переводы: обычно создаются
    // автоматически (кнопка "Перевести" при чтении) и стираются при изменении
    // английского текста, ЕСЛИ их никто не редактировал руками. Если язык был
    // отмечен как отредактированный вручную (isManualTranslationEdit), при
    // следующем изменении английского он не стирается — только помечается
    // "стоит перепроверить" (article.staleLangs), чтобы не терять чужой труд.
    if (!category || !lang || !title || !content) {
        return res.status(400).json({ error: 'Не хватает полей (category/lang/title/content)' });
    }

    const now = Date.now();
    if (id) {
        const existing = articles.find(a => a.id === id);
        if (!existing) return res.status(404).json({ error: 'Статья не найдена' });
        if (!existing.manualLangs) existing.manualLangs = [];
        if (!existing.staleLangs) existing.staleLangs = [];

        existing.category = category;

        if (lang === 'en') {
            const enChanged = existing.title.en !== title || existing.content.en !== content;
            existing.title.en = title;
            existing.content.en = content;
            if (enChanged) {
                // Английский изменился — переводы, которые никто не редактировал
                // руками, больше не гарантированно верны: стираем, следующий
                // читатель на этом языке просто переведёт заново. Переводы,
                // отмеченные как отредактированные вручную, не стираем — только
                // помечаем как требующие перепроверки.
                Object.keys(existing.title).forEach(l => {
                    if (l === 'en') return;
                    if (existing.manualLangs.includes(l)) {
                        if (!existing.staleLangs.includes(l)) existing.staleLangs.push(l);
                    } else {
                        delete existing.title[l];
                        delete existing.content[l];
                    }
                });
            }
        } else {
            // Правка перевода на конкретном языке (не английском).
            existing.title[lang] = title;
            existing.content[lang] = content;
            if (isManualTranslationEdit) {
                if (!existing.manualLangs.includes(lang)) existing.manualLangs.push(lang);
                existing.staleLangs = existing.staleLangs.filter(l => l !== lang); // только что перепроверили
            }
        }

        existing.images = req.body.images || existing.images || [];
        existing.updatedAt = now;
        saveArticles();
        return res.json(existing);
    }

    if (lang !== 'en') {
        return res.status(400).json({ error: 'Новую статью нужно создавать на английском' });
    }
    const newArticle = {
        id: 'article_' + now + '_' + Math.random().toString(36).slice(2, 8),
        category,
        title: { en: title },
        content: { en: content },
        manualLangs: [],
        staleLangs: [],
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

// Автоперевод статьи "по требованию" при чтении — открыт ВСЕМ (не только
// командирам): первый читатель на новом языке переводит один раз, следующие
// уже получают готовый вариант из articles.json. Пароль тут не нужен, потому
// что эндпоинт не доверяет тексту от клиента — сам читает английский оригинал
// с сервера и пишет только title[targetLang]/content[targetLang], не давая
// анонимному читателю переписать что-то ещё в статье (в отличие от /api/articles,
// который остаётся защищён паролем для полноценного редактирования).
app.post('/api/articles/:id/translate', async (req, res) => {
    const { targetLang } = req.body || {};
    if (!targetLang || targetLang === 'en') {
        return res.status(400).json({ error: 'Некорректный целевой язык' });
    }
    const article = articles.find(a => a.id === req.params.id);
    if (!article) return res.status(404).json({ error: 'Статья не найдена' });
    if (article.title[targetLang] && article.content[targetLang]) {
        return res.json(article); // уже переведено — просто возвращаем как есть
    }
    const titleSrc = article.title && article.title.en;
    const contentSrc = article.content && article.content.en;
    if (!titleSrc || !contentSrc) {
        return res.status(400).json({ error: 'У статьи нет английского оригинала' });
    }

    const result = await translateArticleContent(titleSrc, contentSrc, 'en', targetLang);
    if (result.error) {
        return res.status(result.status || 502).json({ error: result.error });
    }

    article.title[targetLang] = result.title;
    article.content[targetLang] = result.content;
    article.updatedAt = Date.now();
    saveArticles();
    res.json(article);
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

        if (sharp) {
            // Обычный путь: сжимаем и приводим к WebP
            const filename = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.webp';
            const outPath = path.join(UPLOADS_DIR, filename);
            await sharp(req.file.buffer)
                .resize({ width: 1600, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(outPath);
            return res.json({ url: `/uploads/${filename}` });
        }

        // sharp недоступен (например, Node на сервере старее 20) — сохраняем файл
        // как есть, без сжатия. Хуже по месту/трафику, но не ломает функцию целиком.
        const ext = (path.extname(req.file.originalname || '') || '.jpg').toLowerCase();
        const filename = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
        const outPath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(outPath, req.file.buffer);
        res.json({ url: `/uploads/${filename}`, warning: 'Сохранено без сжатия (обнови Node.js до 20+ на сервере)' });
    } catch (e) {
        console.error('upload-image error:', e);
        res.status(500).json({ error: 'Не удалось обработать изображение' });
    }
});

// Перевод статьи (title+HTML content) через DeepSeek API — общая логика, вызывается
// и из /api/translate (ручной перевод черновика при написании, командир), и из
// /api/articles/:id/translate (автоперевод при чтении, открыт всем — см. ниже).
// Возвращает { title, content } при успехе или { error } при сбое — тот же
// контракт, что у translatePlainText (см. ниже), чтобы вызывающему коду не нужно
// было разбирать разные форматы ошибок.
async function translateArticleContent(title, content, sourceLang, targetLang) {
    if (!DEEPSEEK_API_KEY) return { error: 'DEEPSEEK_API_KEY не настроен на сервере', status: 500 };
    if (!title || !content) return { error: 'Не хватает полей (title/content)', status: 400 };

    const langNames = LANG_NAMES;
    const srcName = langNames[sourceLang] || sourceLang;
    const dstName = langNames[targetLang] || targetLang;

    const prompt = `Translate the following article from ${srcName} to ${dstName}.
Preserve the original tone, style, and voice as closely as possible — this is not a literal
word-for-word translation, but a natural rendition a native ${dstName} speaker in this community
would write. Preserve all HTML tags exactly (do not add, remove, or reorder tags — only translate
the text between them). Do not translate proper nouns, alliance names, or in-game terms that are
already commonly used untranslated (e.g. ZOG, S72, FoE, BfE, dome, capital).

${GAME_TERMINOLOGY_NOTE}

Respond in EXACTLY this format and nothing else — no commentary, no code fences:

===TITLE===
(translated title here, one line)
===CONTENT===
(translated HTML content here, can span multiple lines)

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
                max_tokens: 4096,
                thinking: { type: 'disabled' }
            })
        });

        if (!apiRes.ok) {
            const errText = await apiRes.text();
            console.error('DeepSeek API error:', apiRes.status, errText);
            return { error: 'Ошибка запроса к DeepSeek API', status: 502 };
        }

        const data = await apiRes.json();
        const rawText = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

        // Разделители вместо JSON — раньше просили модель вернуть сырой JSON
        // {"title":"...","content":"..."}, но длинный HTML-контент часто содержит
        // кавычки/переносы строк, которые модель не всегда корректно экранирует
        // внутри JSON-строки — JSON.parse падал без объяснения причины. Простой
        // разбор по текстовым меткам не требует такого экранирования вообще.
        const titleMatch = rawText.match(/===TITLE===\s*([\s\S]*?)\s*===CONTENT===/);
        const contentMatch = rawText.match(/===CONTENT===\s*([\s\S]*)$/);
        const translatedTitle = titleMatch ? titleMatch[1].trim() : '';
        const translatedContent = contentMatch ? contentMatch[1].trim() : '';

        if (!translatedTitle || !translatedContent) {
            console.error('translate parse failed, raw response:', rawText);
            return { error: 'Не удалось разобрать ответ от DeepSeek — попробуй ещё раз', status: 502 };
        }

        return { title: translatedTitle, content: translatedContent };
    } catch (e) {
        console.error('translate error:', e);
        return { error: 'Не удалось выполнить перевод', status: 500 };
    }
}

// Перевод статьи через DeepSeek API — ручной вызов при написании/редактировании
// (например, "Перевести черновик на английский"), поэтому доверяем title/content
// прямо из запроса и оставляем только командирам. Автоперевод при ЧТЕНИИ статьи
// (открыт всем читателям) — отдельный, более узкий эндпоинт, см.
// /api/articles/:id/translate ниже: он не доверяет тексту от клиента, а сам берёт
// английский оригинал с сервера и пишет только translatedLang, не давая тем самым
// анонимному читателю переписать произвольный текст через этот путь.
app.post('/api/translate', async (req, res) => {
    const { secretKey, title, content, sourceLang, targetLang } = req.body || {};
    if (!COMMANDER_PASSWORDS.includes(secretKey)) {
        return res.status(403).json({ error: 'Неверный пароль командования' });
    }
    const result = await translateArticleContent(title, content, sourceLang, targetLang);
    if (result.error) {
        return res.status(result.status || 502).json({ error: result.error });
    }
    res.json(result);
});

// Перевод ОДНОЙ строки (без title/content, как у статей) — используется для
// короткого дневного уведомления. Возвращает переведённый текст или null при
// ошибке/выключенном ключе (вызывающий код сам решает, что делать дальше).
// Возвращает { text } при успехе или { error } с конкретной причиной при сбое —
// раньше при ЛЮБОЙ причине сбоя (нет ключа, DeepSeek вернул ошибку, сеть упала)
// вызывающий код получал просто null и показывал одно и то же общее сообщение
// "проверь ключ", даже если ключ был в порядке, а падало что-то другое
// (лимит запросов, временная сетевая проблема и т.п.) — это не давало понять
// настоящую причину нестабильной работы.
async function translatePlainText(text, sourceLang, targetLang) {
    if (!DEEPSEEK_API_KEY) return { error: 'DEEPSEEK_API_KEY не настроен на сервере' };
    if (!text) return { error: 'Пустой текст для перевода' };
    const langNames = LANG_NAMES;
    const prompt = `Translate the following short announcement from ${langNames[sourceLang] || sourceLang} to ${langNames[targetLang] || targetLang}. Preserve tone and brevity — this is a short daily alliance notice, not a formal document. Do not translate proper nouns or in-game terms (e.g. ZOG, S72, FoE, BfE, dome, capital, SvS).\n\n${GAME_TERMINOLOGY_NOTE}\n\nRespond with ONLY the translated text, nothing else — no quotes, no commentary.\n\n${text}`;
    try {
        const apiRes = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: 'deepseek-v4-flash',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 500,
                thinking: { type: 'disabled' } // см. комментарий у /api/translate — та же причина пустых ответов
            })
        });
        if (!apiRes.ok) {
            const errBody = await apiRes.text();
            console.error('DeepSeek API error:', apiRes.status, errBody);
            // 401/403 — неверный ключ; 402 — кончился баланс; 429 — лимит запросов
            // (самая вероятная причина "иногда работает, иногда нет"); остальное —
            // как есть, текст ошибки DeepSeek обычно сам всё объясняет.
            const reasons = { 401: 'неверный ключ', 403: 'доступ запрещён', 402: 'закончился баланс на аккаунте DeepSeek', 429: 'превышен лимит запросов (слишком часто) — подожди немного и попробуй снова' };
            return { error: `Ошибка DeepSeek API (${apiRes.status}${reasons[apiRes.status] ? ': ' + reasons[apiRes.status] : ''})` };
        }
        const data = await apiRes.json();
        const choice = data.choices && data.choices[0];
        const raw = (choice && choice.message && choice.message.content) || '';
        if (!raw.trim()) {
            console.error('DeepSeek empty content, finish_reason:', choice && choice.finish_reason, JSON.stringify(data));
            return { error: `DeepSeek вернул пустой ответ (finish_reason: ${choice && choice.finish_reason})` };
        }
        return { text: raw.trim() };
    } catch (e) {
        console.error('translatePlainText error:', e);
        return { error: `Сетевая ошибка при обращении к DeepSeek: ${e.message}` };
    }
}

// Недельный цикл уведомлений — читать может любой, без пароля
app.get('/api/notifications/week', (req, res) => {
    res.json(weeklyNotifications);
});

// Сохранение всех 6 дней разом — только командир. Каждый день пишется на
// английском; перевод больше НЕ делается сразу при сохранении (раньше был
// жёстко зашит только русский — при добавлении французского/любого другого
// языка это плодило бы всё больше переводов впустую на каждое сохранение).
// Теперь перевод — по требованию при чтении, как у статей (см. эндпоинт
// /api/notifications/day/:day/translate ниже). Если у дня менялся английский
// текст — старые переводы на другие языки сбрасываются (иначе читатель увидит
// перевод старой версии текста молча, как будто он актуален).
app.post('/api/notifications/week', (req, res) => {
    const { secretKey, days } = req.body || {};
    if (!COMMANDER_PASSWORDS.includes(secretKey)) {
        return res.status(403).json({ error: 'Неверный пароль командования' });
    }
    if (!days || typeof days !== 'object') {
        return res.status(400).json({ error: 'Не хватает поля days' });
    }

    const result = {};
    for (const dayNum of ['1', '2', '3', '4', '5', '6', '7']) {
        const entry = days[dayNum] || {};
        const raw = (entry.text || '').trim();
        if (!raw) continue; // пустой день — не сохраняем, показывать будет нечего

        const existing = weeklyNotifications[dayNum];
        const enChanged = !existing || existing.en !== raw;
        result[dayNum] = enChanged
            ? { en: raw, articleId: entry.articleId || null }
            : { ...existing, articleId: entry.articleId || null }; // текст тот же — переводы сохраняем
    }

    weeklyNotifications = result;
    saveWeeklyNotifications();
    res.json(weeklyNotifications);
});

// Перевод ОДНОГО дня на конкретный язык — по требованию, вызывается при чтении
// (см. translateTodayNotification на клиенте). Открыт всем читателям, не только
// командирам — так же, как /api/articles/:id/translate: не доверяет тексту от
// клиента (сам берёт day.en с сервера) и пишет только day[targetLang], поэтому
// пароль тут не нужен.
app.post('/api/notifications/day/:day/translate', async (req, res) => {
    const { targetLang } = req.body || {};
    const day = weeklyNotifications[req.params.day];
    if (!day || !day.en) {
        return res.status(404).json({ error: 'День не найден' });
    }
    if (day[targetLang]) {
        return res.json(day); // уже переведено — просто возвращаем как есть
    }

    const result = await translatePlainText(day.en, 'en', targetLang);
    if (!result.text) {
        return res.status(502).json({ error: result.error || 'Перевод не сработал' });
    }

    day[targetLang] = result.text;
    saveWeeklyNotifications();
    res.json(day);
});

server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Сервер тактического планировщика запущен!`);
    console.log(`Адрес: http://localhost:${PORT}`);
    console.log(`Пароли командиров: ${COMMANDER_PASSWORDS.length > 0 ? `заданы (${COMMANDER_PASSWORDS.length})` : 'НЕ ЗАДАНЫ — см. .env'}`);
    console.log(`Перевод статей через DeepSeek API: ${DEEPSEEK_API_KEY ? 'включён' : 'ВЫКЛЮЧЕН (нет DEEPSEEK_API_KEY)'}`);
    console.log(`Сжатие фото при загрузке (sharp): ${sharp ? 'включено' : 'ВЫКЛЮЧЕНО (нужен Node.js 20+)'}`);
    console.log(`=================================================`);
});
