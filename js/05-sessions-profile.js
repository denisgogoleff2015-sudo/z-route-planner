// ===== 05/9: СЕССИИ (save/load/export), AI-ПРОМПТ, ПРОФИЛЬ ИГРОКА =====
// -------------------------------------------------------------
// SESSION MANAGEMENT (LOCALSTORAGE & JSON EXPORT/IMPORT)
// -------------------------------------------------------------

// Serialize state to JSON object
function serializeMapState() {
    return {
        gridWidth: state.gridWidth,
        gridHeight: state.gridHeight,
        coordOffset: state.coordOffset,
        cells: state.cells,
        bases: state.bases,
        arrows: state.arrows,
        markers: state.markers
    };
}

// Load state from JSON object
function loadMapState(data) {
    if (!data || typeof data.gridWidth !== 'number' || typeof data.gridHeight !== 'number') {
        showToast("Invalid map session data!", "error");
        return false;
    }
    
    state.gridWidth = data.gridWidth;
    state.gridHeight = data.gridHeight;
    state.coordOffset = data.coordOffset || { x: 0, y: 0 };
    state.cells = data.cells || {};
    state.bases = data.bases || [];
    state.arrows = data.arrows || [];
    state.markers = data.markers || [];
    
    if (DOM.gridWidthInput) DOM.gridWidthInput.value = state.gridWidth;
    if (DOM.gridHeightInput) DOM.gridHeightInput.value = state.gridHeight;
    
    buildGrid();
    return true;
}

// Save to localStorage
function saveSession() {
    const sessionName = DOM.sessionNameInput.value.trim();
    if (!sessionName) {
        showToast("Please enter a session name", "error");
        return;
    }
    
    const savedSessions = JSON.parse(localStorage.getItem('z_route_sessions') || '{}');
    savedSessions[sessionName] = {
        timestamp: Date.now(),
        data: serializeMapState()
    };
    
    localStorage.setItem('z_route_sessions', JSON.stringify(savedSessions));
    showToast(`Session "${sessionName}" saved!`, "success");
}

// Delete session
function deleteSession(sessionName) {
    const savedSessions = JSON.parse(localStorage.getItem('z_route_sessions') || '{}');
    if (savedSessions[sessionName]) {
        delete savedSessions[sessionName];
        localStorage.setItem('z_route_sessions', JSON.stringify(savedSessions));
        showToast(`Session "${sessionName}" deleted`, "success");
        openLoadModal(); // refresh
    }
}

// Open modal and show saved maps list
function openLoadModal() {
    DOM.sessionList.innerHTML = '';
    const savedSessions = JSON.parse(localStorage.getItem('z_route_sessions') || '{}');
    const keys = Object.keys(savedSessions).sort((a,b) => savedSessions[b].timestamp - savedSessions[a].timestamp);
    
    if (keys.length === 0) {
        DOM.sessionList.innerHTML = '<li style="color:var(--text-secondary); text-align:center; padding: 15px;">No saved maps found</li>';
    } else {
        keys.forEach(key => {
            const item = savedSessions[key];
            const date = new Date(item.timestamp).toLocaleString();
            
            const li = document.createElement('li');
            li.className = 'session-item';
            li.innerHTML = `
                <div class="session-details">
                    <span class="session-title-text">${key}</span>
                    <span class="session-meta-text">Saved: ${date} (${item.data.gridWidth}x${item.data.gridHeight})</span>
                </div>
                <div class="session-actions">
                    <button class="session-btn load-icon" title="Load Map"><i class="fa-solid fa-folder-open"></i></button>
                    <button class="session-btn delete-icon" title="Delete Map"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `;
            
            // Load trigger
            li.querySelector('.load-icon').addEventListener('click', (e) => {
                e.stopPropagation();
                if (loadMapState(item.data)) {
                    DOM.sessionNameInput.value = key;
                    DOM.loadModal.classList.remove('active');
                    showToast(`Session "${key}" loaded!`, "success");
                }
            });
            
            // Delete trigger
            li.querySelector('.delete-icon').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete session "${key}"?`)) {
                    deleteSession(key);
                }
            });
            
            // Clicking row also loads
            li.addEventListener('click', () => {
                if (loadMapState(item.data)) {
                    DOM.sessionNameInput.value = key;
                    DOM.loadModal.classList.remove('active');
                    showToast(`Session "${key}" loaded!`, "success");
                }
            });
            
            DOM.sessionList.appendChild(li);
        });
    }
    
    DOM.loadModal.classList.add('active');
}

// Export state as JSON file
function exportJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(serializeMapState(), null, 2));
    const downloadAnchor = document.createElement('a');
    const sessionName = DOM.sessionNameInput.value.trim().replace(/\s+/g, '_') || 'map_session';
    
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${sessionName}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("JSON configuration downloaded", "success");
}

// Import state from JSON file
function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (loadMapState(data)) {
                // Set session name matching filename
                const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                DOM.sessionNameInput.value = nameWithoutExt.replace(/_/g, ' ');
                showToast("JSON configuration imported!", "success");
            }
        } catch (err) {
            showToast("Failed to parse JSON file", "error");
        }
    };
    reader.readAsText(file);
}

// -------------------------------------------------------------
// AI PROMPT EXPORTER
// -------------------------------------------------------------

function generateAiPrompt() {
    const rawData = serializeMapState();
    
    // Group painted cells by type
    const zoneSummaries = {
        'green-zone': [],
        'gray-zone': [],
        'capital': []
    };
    
    for (const key in rawData.cells) {
        const zoneType = rawData.cells[key];
        const [r, c] = key.split('-').map(Number);
        const gx = c * 3 + rawData.coordOffset.x;
        const gy = r * 3 + rawData.coordOffset.y;
        if (zoneSummaries[zoneType]) {
            zoneSummaries[zoneType].push(`Cell (${r},${c}) [Game X: ${gx}-${gx+2}, Y: ${gy}-${gy+2}]`);
        }
    }
    
    // Condensed details
    const greenZoneStr = zoneSummaries['green-zone'].length > 0 ? zoneSummaries['green-zone'].join(', ') : 'None';
    const grayZoneStr = zoneSummaries['gray-zone'].length > 0 ? zoneSummaries['gray-zone'].join(', ') : 'None';
    const capitalStr = zoneSummaries['capital'].length > 0 ? zoneSummaries['capital'].join(', ') : 'None';
    
    const basesStr = rawData.bases.map(b => {
        const shieldVal = computeShieldCount(b);
        const domeStatus = b.dome ? "[SHIELD DOME ACTIVE]" : "[NO DOME]";
        const shieldStatus = shieldVal > 0 ? `[SHIELD LEVEL: ${shieldVal}]` : "[NO SHIELD]";
        
        let allianceClan = b.color.toUpperCase();
        if (b.color === 'coral') allianceClan = "ZOG (Coral)";
        else if (b.color === 'blue') allianceClan = "S72 (Rubi) (Blue)";
        else if (b.color === 'green') allianceClan = "FoE (Green)";
        else if (b.color === 'yellow') allianceClan = "FoE2 (Yellow)";
        else if (b.color === 'purple') allianceClan = "BfE (Purple)";
        else if (b.color === 'allied') allianceClan = "Allied Support (Cyan)";
        else if (b.color === 'red') allianceClan = "Enemy Hostility (Red)";
        
        const gx = b.col * 3 + rawData.coordOffset.x;
        const gy = b.row * 3 + rawData.coordOffset.y;
        
        return `- ${allianceClan} base at grid cell (${b.row}, ${b.col}) [representing game coordinate range X: ${gx}-${gx+2}, Y: ${gy}-${gy+2}] ${domeStatus} ${shieldStatus}`;
    }).join('\n') || 'None';
    
    const arrowsStr = rawData.arrows.map(a => {
        const sx = a.startCell.col * 3 + rawData.coordOffset.x;
        const sy = a.startCell.row * 3 + rawData.coordOffset.y;
        const ex = a.endCell.col * 3 + rawData.coordOffset.x;
        const ey = a.endCell.row * 3 + rawData.coordOffset.y;
        return `- Movement path from grid cell (${a.startCell.row}, ${a.startCell.col}) [Game X: ${sx}-${sx+2}, Y: ${sy}-${sy+2}] to cell (${a.endCell.row}, ${a.endCell.col}) [Game X: ${ex}-${ex+2}, Y: ${ey}-${ey+2}] (Arrow Color: ${a.color})`;
    }).join('\n') || 'None';
    
    const promptText = `State of the Z Route Redemption Tactical Map (1/3 compressed scale):
- Dimensions: ${rawData.gridWidth} columns (X grid: 0 to ${rawData.gridWidth-1}) x ${rawData.gridHeight} rows (Y grid: 0 to ${rawData.gridHeight-1})
- Game Coordinate Offset: X starts at ${rawData.coordOffset.x}, Y starts at ${rawData.coordOffset.y} (1 Grid Cell = 3x3 Game Cells)

- Special Zones (Grid indices and game ranges):
  * Green Zones (Safe sectors): ${greenZoneStr}
  * Gray Zones (Contested wastelands): ${grayZoneStr}
  * Capital Zones (Main objectives): ${capitalStr}

- Active Bases (occupying 1x1 grid cell):
${basesStr}

- Squad Movements (Arrows):
${arrowsStr}

---
JSON State for Editor Import (you can modify this JSON to add bases, zones, or arrows, and output it back so the user can import it):
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`
---
Instructions for AI: You can analyze this map to suggest combat strategies, optimal routes, base vulnerability, or edit the JSON data directly to design new operations. If you make modifications, present the updated JSON inside a single code block.`;

    // Copy to clipboard
    navigator.clipboard.writeText(promptText).then(() => {
        showToast("AI Prompt copied to clipboard!", "success");
    }).catch(err => {
        showToast("Failed to copy clipboard automatically", "error");
        console.log(promptText); // fallback
    });
}

// -------------------------------------------------------------
// PLAYER PROFILE & PERSONAL BASE PLACEMENT
// -------------------------------------------------------------

// Load profile session on startup
function initProfile() {
    // We will let the initial map update trigger checkOnboarding
}

// Check if user is logged in, and handle onboarding modal
let onboardingChecked = false;
function checkOnboarding() {
    if (onboardingChecked) return;
    onboardingChecked = true;
    
    const activeUser = localStorage.getItem('z_active_user');
    if (activeUser) {
        const found = state.bases.find(b => b.player && b.player.name && b.player.name.toLowerCase() === activeUser.toLowerCase());
        if (found) {
            focusBaseOnMap(found);
            return;
        }
    }
    openOnboardingModal(false);
}

// Bind search input to filter/focus players
(function initPlayerSearch() {
    const input = document.getElementById('player-search-input');
    if (!input) return;
    
    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        const entries = document.querySelectorAll('.action-log-entry');
        entries.forEach(el => {
            const nickEl = el.querySelector('span');
            if (nickEl) {
                const name = nickEl.textContent.split(' ')[0].toLowerCase();
                if (name.includes(query)) {
                    el.style.display = 'flex';
                    const group = el.closest('.action-log-alliance-group');
                    if (group) group.style.display = 'block';
                } else {
                    el.style.display = 'none';
                }
            }
        });
        
        document.querySelectorAll('.action-log-alliance-group').forEach(group => {
            const totalEntries = group.querySelectorAll('.action-log-entry');
            let hasAnyVisible = false;
            totalEntries.forEach(entry => {
                if (entry.style.display !== 'none') hasAnyVisible = true;
            });
            if (hasAnyVisible) {
                group.style.display = 'block';
            } else {
                group.style.display = 'none';
            }
        });
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = input.value.trim().toLowerCase();
            if (!query) return;
            const found = state.bases.find(b => b.player && b.player.name && b.player.name.toLowerCase() === query);
            if (found) {
                focusBaseOnMap(found);
            } else {
                const partial = state.bases.find(b => b.player && b.player.name && b.player.name.toLowerCase().includes(query));
                if (partial) {
                    focusBaseOnMap(partial);
                }
            }
        }
    });
})();

// Open onboarding modal for editing or signup
function openOnboardingModal(isEditMode = false) {
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;
    
    const nickInput = document.getElementById('ob-nickname');
    const extra = document.getElementById('ob-extra');
    const hint = document.getElementById('ob-hint');
    const submit = document.getElementById('ob-submit');
    const skip = document.getElementById('ob-skip');
    
    const activeUser = localStorage.getItem('z_active_user') || '';
    
    if (isEditMode && activeUser) {
        nickInput.value = activeUser;
        const userBase = state.bases.find(b => b.player && b.player.name && b.player.name.toLowerCase() === activeUser.toLowerCase());
        if (userBase) {
            document.getElementById('ob-alliance').value = userBase.color;
            document.getElementById('ob-level').value = userBase.player.level || 1;
            document.getElementById('ob-role').value = userBase.player.role || 'attack';
            document.getElementById('ob-rank').value = userBase.player.rank || 'R1';
        }
        
        extra.style.display = 'flex';
        hint.textContent = t('ob.editTitle');
        submit.textContent = t('ob.save');
        skip.style.display = 'block';
    } else {
        nickInput.value = '';
        extra.style.display = 'none';
        hint.textContent = t('ob.hint');
        submit.textContent = t('ob.continue');
        skip.style.display = 'block';
    }
    
    modal.classList.add('active');
}

// Отрисовка активности состава по альянсам
function renderSquadActivity() {
    const container = document.getElementById('squad-activity-container');
    if (!container) return;
    
    const bases = state.bases || [];
    const playerBases = bases.filter(b => b.player && b.player.name && b.color !== 'red');
    
    if (playerBases.length === 0) {
        container.innerHTML = `<div class="log-empty-msg" style="color: var(--text-secondary); text-align: center; padding: 10px;">${t('sa.noPlayers')}</div>`;
        return;
    }
    
    const groups = {
        coral: { title: "ZOG (Coral)", color: "#ff7f50", players: [] },
        blue: { title: "S72 (Blue)", color: "#1e90ff", players: [] },
        green: { title: "FoE (Green)", color: "#2ed573", players: [] },
        yellow: { title: "FoE2 (Yellow)", color: "#ffa500", players: [] },
        purple: { title: "BfE (Purple)", color: "#9b59b6", players: [] },
        allied: { title: "Allied (Cyan)", color: "#00d2ff", players: [] },
        other: { title: t('sa.group.other'), color: "#a4b0be", players: [] }
    };
    
    playerBases.forEach(base => {
        const outArrows = state.arrows.filter(a => isCellInBase(a.startCell.row, a.startCell.col, base));
        
        const targets = outArrows.map(arrow => {
            const endName = getCellName(arrow.endCell.row, arrow.endCell.col);
            if (endName.isBase) {
                return `${t('sa.action.help')} ${endName.name}`;
            } else if (endName.isCapital) {
                return `${t('sa.action.assault')} ${endName.name}`;
            }
            return t('sa.action.cell');
        });
        
        const statuses = [];
        if (base.dome) statuses.push(`<span style="color: #2ed573; border: 1px solid rgba(46,213,115,0.3); padding: 1px 4px; border-radius: 3px; font-size: 8px;">${t('sa.status.dome')}</span>`);
        if (base.shield) statuses.push(`<span style="color: #ff9f43; border: 1px solid rgba(255,159,67,0.3); padding: 1px 4px; border-radius: 3px; font-size: 8px;">${t('sa.status.shield')}</span>`);
        if (base.player && base.player.active === false) {
            statuses.push(`<span style="color: #ff4757; border: 1px solid rgba(255,71,87,0.3); padding: 1px 4px; border-radius: 3px; font-size: 8px;">${t('sa.status.inactive')}</span>`);
        } else {
            statuses.push(`<span style="color: #00d2ff; border: 1px solid rgba(0,210,255,0.3); padding: 1px 4px; border-radius: 3px; font-size: 8px;">${t('sa.status.active')}</span>`);
        }
        
        let roleName = t('sa.role.attack');
        if (base.player.role === 'defense') roleName = t('sa.role.defense');
        else if (base.player.role === 'capture') roleName = t('sa.role.capture');
        else if (base.player.role === 'reinforce') roleName = t('sa.role.reinforce');
        
        const playerInfo = {
            name: base.player.name,
            level: base.player.level || 1,
            role: roleName,
            statuses: statuses.join(' '),
            targets: targets.length > 0 ? targets.join(', ') : t('sa.action.reserve'),
            row: base.row,
            col: base.col
        };
        
        const alliance = base.color || 'other';
        if (groups[alliance]) {
            groups[alliance].players.push(playerInfo);
        } else {
            groups.other.players.push(playerInfo);
        }
    });
    
    let html = '';
    
    Object.keys(groups).forEach(key => {
        const group = groups[key];
        if (group.players.length > 0) {
            html += `
                <div class="action-log-alliance-group">
                    <div class="action-log-alliance-header" style="color: ${group.color};">
                        <i class="fa-solid fa-shield-halved"></i> ${group.title}
                    </div>
                    <div class="action-log-entries-list" style="display: flex; flex-direction: column; gap: 6px;">
            `;
            
            group.players.forEach(p => {
                const isReserve = p.targets === t('sa.action.reserve');
                html += `
                    <div class="action-log-entry" onclick="focusBaseOnMapCoordinates(${p.row}, ${p.col})" style="cursor: pointer; padding: 6px; border-radius: 4px; background: rgba(0,0,0,0.35); border-left: 3px solid ${group.color}; margin-bottom: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-weight: bold; color: var(--text-primary); font-size: 11px;">${p.name} <span style="font-weight: normal; color: var(--text-secondary); font-size: 9px;">(ур. ${p.level}, ${p.role})</span></span>
                            <div style="display: flex; gap: 3px;">${p.statuses}</div>
                        </div>
                        <div style="color: var(--text-secondary); font-size: 9px; line-height: 1.2;">
                            <span style="color: rgba(255,255,255,0.4);">${t('sa.action.label')}</span> <span style="color: ${isReserve ? 'var(--text-secondary)' : '#2ed573'}; font-weight: ${isReserve ? 'normal' : '500'};">${p.targets}</span>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html || `<div class="log-empty-msg" style="color: var(--text-secondary); text-align: center; padding: 10px;">${t('sa.empty')}</div>`;
}

// Helper: Find a free cell in the Green Zone starting from the bottom
function findFreeGreenZoneCell() {
    for (let r = state.gridHeight - 1; r >= 0; r--) {
        for (let c = 0; c < state.gridWidth; c++) {
            const key = `${r}-${c}`;
            if (state.cells[key] === 'green-zone') {
                const occupied = state.bases.some(b => b.row === r && b.col === c);
                if (!occupied) {
                    return { row: r, col: c };
                }
            }
        }
    }
    return null;
}

// Все клетки зелёной зоны в фиксированном порядке сканирования (тот же порядок,
// что использует findFreeGreenZoneCell) — используется для группировки баз.
function getGreenZoneCellsInScanOrder() {
    const cells = [];
    for (let r = state.gridHeight - 1; r >= 0; r--) {
        for (let c = 0; c < state.gridWidth; c++) {
            if (state.cells[`${r}-${c}`] === 'green-zone') {
                cells.push({ row: r, col: c });
            }
        }
    }
    return cells;
}

const REGROUP_ALLIANCE_ORDER = ['coral', 'blue', 'green', 'yellow', 'purple', 'allied', 'red'];
const REGROUP_ROLE_ORDER = ['attack', 'defense', 'reinforce', 'capture'];
const REGROUP_GAP = 2; // клеток пропуска между кластерами — визуальный разрыв между группами

// "Группировка": переставляет ВСЕ базы на карте в компактные кучки по альянсу,
// а внутри альянса — по роли игрока (тот же порядок, что в "Списке баз"), вместо
// одной сплошной линии, где не разобрать, кто есть кто, не тыкая в каждую базу.
function regroupAllBases() {
    if (isViewerMode) return;
    if (state.bases.length === 0) {
        showToast('На карте пока нет баз для группировки', 'error');
        return;
    }

    // Группы в том же порядке, что и в сайдбарном "Списке баз"
    const byColor = {};
    REGROUP_ALLIANCE_ORDER.forEach(c => { byColor[c] = []; });
    const otherColor = [];
    state.bases.forEach(b => {
        if (byColor[b.color]) byColor[b.color].push(b);
        else otherColor.push(b);
    });

    const buckets = [];
    const pushRoleBuckets = (list) => {
        const byRole = {};
        REGROUP_ROLE_ORDER.forEach(r => { byRole[r] = []; });
        const noRole = [];
        list.forEach(b => {
            const role = b.player && b.player.role;
            if (role && byRole[role]) byRole[role].push(b);
            else noRole.push(b);
        });
        REGROUP_ROLE_ORDER.forEach(role => {
            if (byRole[role].length > 0) buckets.push(byRole[role]);
        });
        if (noRole.length > 0) buckets.push(noRole);
    };
    REGROUP_ALLIANCE_ORDER.forEach(color => {
        if (byColor[color].length > 0) pushRoleBuckets(byColor[color]);
    });
    if (otherColor.length > 0) pushRoleBuckets(otherColor);

    // Запоминаем, к какой базе (по id) привязан каждый конец каждой стрелки —
    // ДО перемещения, чтобы потом корректно перепривязать, даже если старая
    // позиция одной базы совпадёт с новой позицией другой во время переноса.
    const arrowBindings = state.arrows.map(arrow => {
        const startBase = state.bases.find(b => isCellInBase(arrow.startCell.row, arrow.startCell.col, b));
        const endBase = state.bases.find(b => isCellInBase(arrow.endCell.row, arrow.endCell.col, b));
        return { arrow, startBaseId: startBase ? startBase.id : null, endBaseId: endBase ? endBase.id : null };
    });

    const freeCells = getGreenZoneCellsInScanOrder();
    let cursor = 0, placed = 0, skipped = 0;

    buckets.forEach(bucketBases => {
        // Стабильный порядок внутри группы — по имени, чтобы результат был предсказуем
        bucketBases.sort((a, b) => {
            const na = (a.player && a.player.name) || '';
            const nb = (b.player && b.player.name) || '';
            return na.localeCompare(nb);
        });
        bucketBases.forEach(base => {
            if (cursor >= freeCells.length) { skipped++; return; }
            const cell = freeCells[cursor];
            base.row = cell.row;
            base.col = cell.col;
            cursor++;
            placed++;
        });
        cursor += REGROUP_GAP; // разрыв перед следующей группой
    });

    // Перепривязываем стрелки к новым позициям их баз (по запомненным id)
    arrowBindings.forEach(({ arrow, startBaseId, endBaseId }) => {
        if (startBaseId) {
            const b = state.bases.find(x => x.id === startBaseId);
            if (b) { arrow.startCell.row = b.row; arrow.startCell.col = b.col; }
        }
        if (endBaseId) {
            const b = state.bases.find(x => x.id === endBaseId);
            if (b) { arrow.endCell.row = b.row; arrow.endCell.col = b.col; }
        }
    });

    renderBases();
    renderArrows();
    notifyServerOfMapChange();

    showToast(
        `Базы сгруппированы на карте: ${placed}` + (skipped > 0 ? `, не хватило места в зелёной зоне — ${skipped}` : ''),
        placed > 0 ? 'success' : 'error'
    );
}

// Save profile to localStorage and auto-place base in green zone
function saveProfile() {
    const nickname = DOM.profileNickname.value.trim();
    const alliance = DOM.profileAlliance.value;
    const rank = DOM.profileRank ? DOM.profileRank.value : 'R1';
    const level = parseInt(DOM.profileLevel.value) || 1;
    const role = DOM.profileRole.value;
    const active = DOM.profileActive.checked;
    
    if (!nickname) {
        showToast("Please enter your Nickname!", "error");
        return;
    }
    
    if (level < 1 || level > 30) {
        showToast("Level must be between 1 and 30!", "error");
        return;
    }
    
    // Check if this is the user's own profile vs a different player
    let savedProfile = null;
    try {
        const raw = localStorage.getItem('z_player_profile');
        if (raw) savedProfile = JSON.parse(raw);
    } catch (e) {}
    
    const isOwnProfile = !savedProfile || !savedProfile.nickname || savedProfile.nickname.toLowerCase() === nickname.toLowerCase();
    
    if (isOwnProfile) {
        // Update user's own profile
        const profile = { nickname, alliance, rank, level, role, active };
        localStorage.setItem('z_player_profile', JSON.stringify(profile));
        DOM.profileActions.style.display = 'flex';
        
        let userBase = state.bases.find(b => b.id === 'user_base');
        if (userBase) {
            userBase.color = alliance;
            userBase.player = { name: nickname, level: level, role: role, active: active, rank: rank };
            
            // Update connected arrows color to match new source base color (Constraint 3)
            state.arrows.forEach(arrow => {
                if (isCellInBase(arrow.startCell.row, arrow.startCell.col, userBase)) {
                    arrow.color = ALLIANCE_ARROW_COLORS[alliance] || arrow.color;
                }
            });
            
            renderBases();
            renderArrows();
            showToast(`Профиль "${nickname}" успешно обновлен и подсвечен на карте!`, "success");
            
            // Highlight ping
            const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${userBase.row}"][data-col="${userBase.col}"]`);
            if (baseEl) {
                baseEl.classList.add('highlight-ping');
                setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
            }
            notifyServerOfMapChange();
        } else {
            const freeCell = findFreeGreenZoneCell();
            if (freeCell) {
                state.bases.push({
                    id: 'user_base',
                    row: freeCell.row,
                    col: freeCell.col,
                    color: alliance,
                    shield: false,
                    dome: false,
                    player: { name: nickname, level: level, role: role, active: active, rank: rank }
                });
                renderBases();
                showToast(`Профиль "${nickname}" сохранен, база размещена автоматически!`, "success");
                
                // Highlight ping
                const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${freeCell.row}"][data-col="${freeCell.col}"]`);
                if (baseEl) {
                    baseEl.classList.add('highlight-ping');
                    setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
                }
                notifyServerOfMapChange();
            } else {
                showToast("No free cells available in the Green Zone!", "error");
            }
        }
    } else {
        // This is a different player! Add or update as a separate player base
        let existingBase = state.bases.find(b => b.player && b.player.name.toLowerCase() === nickname.toLowerCase());
        
        if (existingBase) {
            existingBase.color = alliance;
            existingBase.player = { name: nickname, level: level, role: role, active: active };
            
            // Update connected arrows color
            state.arrows.forEach(arrow => {
                if (isCellInBase(arrow.startCell.row, arrow.startCell.col, existingBase)) {
                    arrow.color = ALLIANCE_ARROW_COLORS[alliance] || arrow.color;
                }
            });
            
            renderBases();
            renderArrows();
            showToast(`Игрок "${nickname}" уже добавлен! База подсвечена и обновлена.`, "warning");
            
            // Highlight ping
            const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${existingBase.row}"][data-col="${existingBase.col}"]`);
            if (baseEl) {
                baseEl.classList.add('highlight-ping');
                setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
            }
            notifyServerOfMapChange();
        } else {
            const freeCell = findFreeGreenZoneCell();
            if (freeCell) {
                state.bases.push({
                    id: 'player_' + nickname.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now(),
                    row: freeCell.row,
                    col: freeCell.col,
                    color: alliance,
                    shield: false,
                    dome: false,
                    player: { name: nickname, level: level, role: role, active: active, rank: rank }
                });
                renderBases();
                showToast(`Новый игрок "${nickname}" добавлен и подсвечен на карте!`, "success");
                
                // Highlight ping
                const baseEl = DOM.basesOverlay.querySelector(`.base-block[data-row="${freeCell.row}"][data-col="${freeCell.col}"]`);
                if (baseEl) {
                    baseEl.classList.add('highlight-ping');
                    setTimeout(() => baseEl.classList.remove('highlight-ping'), 3000);
                }
                notifyServerOfMapChange();
            } else {
                showToast("No free cells available in the Green Zone!", "error");
            }
        }
    }
}

// Triggers active tool to place personal base (Deprecated for players, kept for compatibility check)
function startPlaceMyBase() {
    state.activeTool = 'place-user-base';
    DOM.currentToolText.innerText = "Click on Green Zone to Place Your Base";
    showToast("Click on any cell in the GREEN ZONE to place/move your base!", "info");
}

// Logic to place user base (restricted to green-zone)
function placeUserBase(r, c) {
    const nickname = DOM.profileNickname.value.trim();
    const alliance = DOM.profileAlliance.value;
    const rank = DOM.profileRank ? DOM.profileRank.value : 'R1';
    const level = parseInt(DOM.profileLevel.value) || 1;
    const role = DOM.profileRole.value;
    const active = DOM.profileActive.checked;
    
    // Boundary check
    if (r >= state.gridHeight || c >= state.gridWidth || r < 0 || c < 0) {
        showToast("Out of grid boundaries", "error");
        return;
    }
    
    // Check zone type
    const cellType = state.cells[`${r}-${c}`];
    if (cellType !== 'green-zone') {
        showToast("Personal bases can only be placed in the Green Zone!", "error");
        return;
    }
    
    // Check overlap with existing bases (excluding self)
    const overlaps = state.bases.some(b => b.id !== 'user_base' && b.row === r && b.col === c);
    if (overlaps) {
        showToast("Overlaps with another base!", "error");
        return;
    }
    
    // Remove previous user base if any
    state.bases = state.bases.filter(b => b.id !== 'user_base');
    
    // Add personal base
    state.bases.push({
        id: 'user_base',
        row: r,
        col: c,
        color: alliance,
        shield: false,
        dome: false,
        player: {
            name: nickname,
            level: level,
            role: role,
            active: active,
            rank: rank
        }
    });
    
    state.activeTool = 'neutral';
    DOM.currentToolText.innerText = isViewerMode ? "Read-Only Viewer" : "Neutral Zone";
    renderBases();
    showToast("Your base placed successfully!", "success");
    
    // Notify server of updates
    notifyServerOfMapChange();
}

// Copy user base info as shareable JSON string
function copyUserBaseCode() {
    const userBase = state.bases.find(b => b.id === 'user_base');
    if (!userBase) {
        showToast("Please place your base on the map first!", "error");
        return;
    }
    
    const codeObj = {
        type: "player_base",
        color: userBase.color,
        row: userBase.row,
        col: userBase.col,
        player: userBase.player
    };
    
    const codeStr = JSON.stringify(codeObj);
    
    navigator.clipboard.writeText(codeStr).then(() => {
        showToast("Base code copied to clipboard! Send it to your commander.", "success");
    }).catch(err => {
        showToast("Failed to copy automatically. Code: " + codeStr, "error");
    });
}

// Importer for Commanders to place shared base codes
function importPlayerBase() {
    const rawInput = prompt("Paste the player's base code here:");
    if (!rawInput) return;
    
    try {
        const data = JSON.parse(rawInput.trim());
        if (data.type !== 'player_base' || !data.player || !data.player.name || !data.player.level || typeof data.row !== 'number' || typeof data.col !== 'number') {
            showToast("Invalid player base code format!", "error");
            return;
        }
        
        // Remove existing base matching this player name
        state.bases = state.bases.filter(b => !b.player || b.player.name.toLowerCase() !== data.player.name.toLowerCase());
        
        // Push base to state
        state.bases.push({
            id: 'player_' + data.player.name.toLowerCase() + '_' + Date.now(),
            row: data.row,
            col: data.col,
            color: data.color || 'allied',
            shield: data.shield || false,
            dome: data.dome || false,
            player: {
                name: data.player.name,
                level: data.player.level,
                role: data.player.role || 'attack',
                active: data.player.active !== false
            }
        });
        
        renderBases();
        showToast(`Player base for "${data.player.name}" imported successfully!`, "success");
        
        // Notify server of updates
        notifyServerOfMapChange();
    } catch (e) {
        showToast("Failed to parse base code JSON!", "error");
    }
}
