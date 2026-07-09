// ===== 08/9: EVENT BINDINGS, ГЕНЕРАЦИЯ КАРТЫ ПО УМОЛЧАНИЮ, INIT =====
// -------------------------------------------------------------
// EVENT BINDINGS
// -------------------------------------------------------------

// Profile Action Bindings
if (DOM.btnShowProfile) {
    DOM.btnShowProfile.addEventListener('click', () => {
        openOnboardingModal(true);
    });
}
if (DOM.btnImportPlayer) {
    DOM.btnImportPlayer.addEventListener('click', importPlayerBase);
}

// Tool selection triggers (single loop over pre-cached NodeList)
toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        setTool(btn.dataset.tool);
    });
});

// Arrow Color selector dots
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.activeArrowColor = dot.dataset.color;
        // If we are currently drawing an arrow, update it
        if (state.isDrawingArrow) {
            DOM.tempArrow.setAttribute('stroke', state.activeArrowColor);
        }
    });
});

// Resize grid trigger
if (DOM.btnResize) {
    DOM.btnResize.addEventListener('click', resizeGrid);
}

// Clear grid trigger
DOM.btnClearAll.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear the map? This resets all bases and movement routes.")) {
        state.bases = [];
        state.arrows = [];
        cancelArrowDrawing();
        // Regenerate default background zones just in case
        generateDefaultMap();
        showToast("Bases and routes cleared!", "success");
        notifyServerOfMapChange();
    }
});

// Session control triggers
DOM.btnSave.addEventListener('click', saveSession);
DOM.btnLoadList.addEventListener('click', openLoadModal);
DOM.closeModal.addEventListener('click', () => DOM.loadModal.classList.remove('active'));
DOM.btnExport.addEventListener('click', exportJson);
DOM.importFile.addEventListener('change', importJson);
DOM.btnAiPrompt.addEventListener('click', generateAiPrompt);

// Edit Player Base Modal bindings
DOM.closeEditBaseModal.addEventListener('click', () => DOM.editBaseModal.classList.remove('active'));
DOM.btnSaveEditBase.addEventListener('click', saveEditBase);

// Paste JSON Modal triggers
DOM.btnPasteJson.addEventListener('click', () => {
    DOM.pasteJsonTextarea.value = '';
    DOM.pasteModal.classList.add('active');
});
DOM.closePasteModal.addEventListener('click', () => DOM.pasteModal.classList.remove('active'));
DOM.btnLoadPasted.addEventListener('click', () => {
    const rawText = DOM.pasteJsonTextarea.value.trim();
    if (!rawText) {
        showToast("Please paste JSON data first!", "error");
        return;
    }
    try {
        // Clean up possible markdown wrappers from AI
        let cleanedText = rawText;
        if (cleanedText.includes('```json')) {
            cleanedText = cleanedText.split('```json')[1].split('```')[0].trim();
        } else if (cleanedText.includes('```')) {
            cleanedText = cleanedText.split('```')[1].split('```')[0].trim();
        }
        
        const parsed = JSON.parse(cleanedText);
        if (loadMapState(parsed)) {
            DOM.pasteModal.classList.remove('active');
            DOM.pasteJsonTextarea.value = '';
            showToast("Model loaded successfully from AI!", "success");
        }
    } catch (e) {
        showToast("Invalid JSON syntax. Ensure the block is complete.", "error");
    }
});

// Close modals if clicked outside
window.addEventListener('click', (e) => {
    if (e.target === DOM.loadModal) {
        DOM.loadModal.classList.remove('active');
    }
    if (e.target === DOM.pasteModal) {
        DOM.pasteModal.classList.remove('active');
    }
    if (e.target === DOM.editBaseModal) {
        DOM.editBaseModal.classList.remove('active');
    }
});

// Window resize listener to fit grid within screen (debounced to save CPU)
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        recalculateCellSize();
        // Update wrapper sizes
        DOM.mapCanvasWrapper.style.width = `${state.gridWidth * state.cellSize}px`;
        DOM.mapCanvasWrapper.style.height = `${state.gridHeight * state.cellSize}px`;
        // Redraw overlays
        renderBases();
        renderArrows();
        renderMarkers();
    }, 100);
});

// Sidebar Toggle Click trigger
DOM.btnToggleSidebar.addEventListener('click', () => {
    const isCollapsed = DOM.sidebar.classList.toggle('collapsed');
    DOM.btnToggleSidebar.classList.toggle('collapsed');
    
    // Update icon class
    const icon = DOM.btnToggleSidebar.querySelector('i');
    if (isCollapsed) {
        icon.className = 'fa-solid fa-chevron-right';
        showToast("Sidebar hidden - fullscreen mode active", "info");
    } else {
        icon.className = 'fa-solid fa-chevron-left';
    }
});

// Re-adjust sizes when sidebar completes sliding transition
DOM.sidebar.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'margin-left') {
        recalculateCellSize();
        DOM.mapCanvasWrapper.style.width = `${state.gridWidth * state.cellSize}px`;
        DOM.mapCanvasWrapper.style.height = `${state.gridHeight * state.cellSize}px`;
        renderBases();
        renderArrows();
        renderMarkers();
    }
});

// -------------------------------------------------------------
// DEFAULT MAP GENERATOR (Z Route Redemption Battlefield)
// -------------------------------------------------------------

function generateDefaultMap() {
    state.gridWidth = 48;
    state.gridHeight = 48;
    state.coordOffset = { x: 428, y: 428 };
    state.cells = {};
    state.bases = [];
    state.arrows = [];
    state.markers = [];
    
    // Auto-paint zones using game coordinates (compressed to 1/3 scale)
    // Grid index c represents game X coords: [428 + c*3, 428 + c*3 + 2]
    // Capital is game [491, 509] -> grid indices 21 to 27 inclusive (since 428 + 21*3 = 491, 428 + 27*3 + 2 = 511)
    // Gray Zone is game [450, 551] -> grid indices 7 to 41 inclusive (since 428 + 7*3 = 449, 428 + 41*3 + 2 = 553)
    // Green Zone is everything else (outer border of 7-8 cells)
    for (let r = 0; r < 48; r++) {
        for (let c = 0; c < 48; c++) {
            const key = `${r}-${c}`;
            
            if (r >= 21 && r <= 27 && c >= 21 && c <= 27) {
                state.cells[key] = 'capital';
            } else if (r >= 7 && r <= 41 && c >= 7 && c <= 41) {
                state.cells[key] = 'gray-zone';
            } else {
                state.cells[key] = 'green-zone';
            }
        }
    }
    
    // Target markers are drawn dynamically with progress bars in renderCapitalTargets()
    state.markers = [];
    
    buildGrid();
    showToast("Z Route Redemption battlefield upscaled & generated!", "success");
}

// Render markers on the map
function renderMarkers() {
    DOM.markersOverlay.innerHTML = '';
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------

// Generate the default Z Route Redemption map
generateDefaultMap();
initProfile();
setTool('neutral');
initRealTimeSync();

// Hide/Show AI buttons dynamically based on secret key === '1998'
if (showAiTools) {
    if (DOM.btnPasteJson) DOM.btnPasteJson.style.display = 'block';
    if (DOM.btnAiPrompt) DOM.btnAiPrompt.style.display = 'block';
} else {
    if (DOM.btnPasteJson) DOM.btnPasteJson.style.display = 'none';
    if (DOM.btnAiPrompt) DOM.btnAiPrompt.style.display = 'none';
}

if (isViewerMode) {
    DOM.currentToolText.innerText = "Read-Only Viewer";
    const statusTextEl = document.querySelector('.status-text');
    if (statusTextEl) statusTextEl.innerHTML = `Mode: <strong>Read-Only Viewer</strong>`;
    
    // Check if profile exists
    const hasProfile = localStorage.getItem('z_player_profile');
    if (!hasProfile) {
        showToast("Пожалуйста, заполните профиль игрока слева, чтобы поставить свою базу!", "warning");
    } else {
        showToast("Режим просмотра. Вы можете управлять своей базой.", "info");
    }
} else {
    showToast("Welcome to Commander Editor Mode!", "success");
}

