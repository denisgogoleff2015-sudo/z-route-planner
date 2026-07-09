// ===== 07/9: ИМПОРТ РОСТЕРА ИЗ EXCEL =====
// -------------------------------------------------------------
// ИМПОРТ СПИСКА УЧАСТНИКОВ ИЗ EXCEL (.xlsx)
// -------------------------------------------------------------
// Парсинг происходит целиком в браузере (библиотека SheetJS) — на сервер уходит
// только уже готовый список баз через тот же канал, что и обычные правки карты.
// Ожидаемые колонки (из реального файла ростера): Participant, Base Level/Rank,
// Choice, Combat Power, Registered Combat Role. Формат Choice: 1=атака, 2=подкрепление,
// 3=блокада/защита, "Flexible"/неоднозначные значения ("2 or 3") — трактуем как
// подкрепление (роль легко поправить вручную после импорта через "Правка").
let rosterImportRows = []; // распарсенные строки, ждут подтверждения импорта

function parseRosterLevel(raw) {
    if (raw === null || raw === undefined) return 1;
    const m = String(raw).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
}

function parseRosterChoiceToRole(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === '1') return 'attack';
    if (s === '3') return 'defense';
    if (s === '2') return 'reinforce';
    return 'reinforce'; // Flexible, "2 or 3", пусто и т.п. — безопасный дефолт, правится вручную
}

function parseRosterCombatPower(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (/n\/a/i.test(s)) return null; // "N/A (Notice Board)", "2 or 3 - N/A (Notice Board)" и т.п.
    const n = parseInt(s.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// Ищет значение колонки по имени, не завися от лишних пробелов вокруг заголовка
// в самом файле (в реальном ростере, например, колонка была " Combat Power  ").
function findRosterColumn(row, normalizedName) {
    for (const key of Object.keys(row)) {
        if (key.trim().toLowerCase() === normalizedName) return row[key];
    }
    return '';
}

// Читает .xlsx-файл целиком в браузере и возвращает распарсенные строки участников.
function parseRosterFile(file, callback) {
    if (typeof XLSX === 'undefined') {
        showToast('Библиотека чтения Excel не загрузилась (нет интернета?)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            const rows = [];
            for (const r of raw) {
                const name = String(findRosterColumn(r, 'participant')).trim();
                if (!name) continue;

                const choiceRaw = findRosterColumn(r, 'choice');
                const roleRaw = findRosterColumn(r, 'registered combat role');
                // Внизу листа обычно идёт сводный подсчёт (Attacker/Reinforce/Blockade/Flexible
                // с числом вместо реальных данных) — строки без Choice И без Role пропускаем,
                // это не участники. У настоящих строк Choice всегда заполнен.
                if (String(choiceRaw).trim() === '' && String(roleRaw).trim() === '') continue;

                rows.push({
                    name,
                    level: parseRosterLevel(findRosterColumn(r, 'base level/rank')),
                    role: parseRosterChoiceToRole(choiceRaw),
                    cp: parseRosterCombatPower(findRosterColumn(r, 'combat power')),
                    rawChoice: choiceRaw,
                    include: true
                });
            }
            callback(rows);
        } catch (err) {
            console.error(err);
            showToast('Не удалось прочитать файл — проверь формат .xlsx', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

const ROLE_LABELS_RU = { attack: 'Атака', defense: 'Защита', reinforce: 'Подкрепление', capture: 'Захват' };

function renderRosterPreview() {
    const list = document.getElementById('roster-import-list');
    const summary = document.getElementById('roster-import-summary');
    const preview = document.getElementById('roster-import-preview');
    if (!list || !summary || !preview) return;

    if (rosterImportRows.length === 0) {
        preview.style.display = 'none';
        return;
    }
    preview.style.display = 'flex';

    const includedCount = rosterImportRows.filter(r => r.include).length;
    summary.textContent = `Найдено участников: ${rosterImportRows.length}. Будет импортировано: ${includedCount}. Роль можно поправить после импорта в "Правке".`;

    list.innerHTML = rosterImportRows.map((r, i) => `
        <label style="display:flex; align-items:center; gap:6px; font-size:10px; padding:4px 6px; border-radius:4px; background: rgba(0,0,0,0.25); cursor:pointer;">
            <input type="checkbox" data-roster-idx="${i}" ${r.include ? 'checked' : ''} style="flex-shrink:0;">
            <span style="flex:1; color: var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.name}</span>
            <span style="color: var(--text-secondary);">ур.${r.level}</span>
            <span style="color: var(--text-secondary);">${ROLE_LABELS_RU[r.role] || r.role}</span>
            ${r.cp ? `<span style="color: var(--text-secondary);">CP ${(r.cp/1e6).toFixed(1)}M</span>` : ''}
        </label>
    `).join('');

    list.querySelectorAll('[data-roster-idx]').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = parseInt(cb.dataset.rosterIdx, 10);
            rosterImportRows[idx].include = cb.checked;
            renderRosterPreview();
        });
    });
}

// Импортирует отмеченные строки: существующих по имени игроков обновляет
// (уровень/роль), новых — создаёт и авто-расставляет в Зелёной зоне. Сортировка
// по боевой мощи (CP) используется только для порядка расстановки (кто раньше
// получит клетку) — сам CP нигде не сохраняется в данные базы, т.к. быстро устаревает.
function confirmRosterImport() {
    const color = document.getElementById('roster-import-alliance').value;
    const toImport = rosterImportRows.filter(r => r.include);
    if (toImport.length === 0) {
        showToast('Нечего импортировать — сними хотя бы одну галочку обратно', 'error');
        return;
    }

    toImport.sort((a, b) => (b.cp || 0) - (a.cp || 0));

    let created = 0, updated = 0, skipped = 0;
    toImport.forEach(row => {
        const existing = state.bases.find(b =>
            b.player && b.player.name && b.player.name.toLowerCase() === row.name.toLowerCase()
        );
        if (existing) {
            existing.player.level = row.level;
            existing.player.role = row.role;
            existing.color = color;
            updated++;
            return;
        }
        const cell = findFreeGreenZoneCell();
        if (!cell) { skipped++; return; }
        state.bases.push({
            id: 'base_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            row: cell.row,
            col: cell.col,
            color,
            shield: false,
            dome: false,
            player: { name: row.name, level: row.level, role: row.role, active: true }
        });
        created++;
    });

    renderBases();
    notifyServerOfMapChange();

    let msg = `Импорт: новых — ${created}, обновлено — ${updated}`;
    if (skipped > 0) msg += `, не хватило места — ${skipped}`;
    showToast(msg, created + updated > 0 ? 'success' : 'error');

    rosterImportRows = [];
    renderRosterPreview();
    const fileInput = document.getElementById('roster-import-file');
    if (fileInput) fileInput.value = '';
}

(function initRosterImport() {
    const chooseBtn = document.getElementById('roster-import-choose');
    const fileInput = document.getElementById('roster-import-file');
    const confirmBtn = document.getElementById('roster-import-confirm');
    if (!chooseBtn || !fileInput || !confirmBtn) return;

    chooseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        parseRosterFile(file, (rows) => {
            rosterImportRows = rows;
            if (rows.length === 0) {
                showToast('В файле не нашлось строк с именами участников', 'error');
                return;
            }
            renderRosterPreview();
        });
    });
    confirmBtn.addEventListener('click', confirmRosterImport);
})();

