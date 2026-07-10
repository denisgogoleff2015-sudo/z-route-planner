// ===== 10/10: СТАТЬИ (Устав / Туториалы VS / Межконт. война) =====
// Хранилище — простой JSON-файл на сервере (как и карта), редактор — Quill.js
// (грузится с CDN, работает в браузере). Перевод — через сервер, который
// проксирует запрос в Claude API (ключ хранится только на сервере).

let articlesCache = [];
let currentArticleId = null; // какая статья сейчас открыта/редактируется
let quillRu = null, quillEn = null;

const ARTICLE_CATEGORIES = [
    { key: 'charter', labelKey: 'articles.cat.charter' },
    { key: 'vs_tutorial', labelKey: 'articles.cat.vs' },
    { key: 'intercontinental_war', labelKey: 'articles.cat.war' }
];

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

async function loadArticles() {
    try {
        const res = await fetch('/api/articles');
        articlesCache = await res.json();
    } catch (e) {
        console.error('Не удалось загрузить статьи:', e);
        articlesCache = [];
    }
}

function renderArticlesList() {
    const container = document.getElementById('articles-categories');
    if (!container) return;

    if (articlesCache.length === 0) {
        container.innerHTML = `<div style="color:var(--text-secondary);text-align:center;padding:20px;font-size:12px;">${t('articles.empty')}</div>`;
        return;
    }

    let html = '';
    ARTICLE_CATEGORIES.forEach(cat => {
        const list = articlesCache.filter(a => a.category === cat.key);
        if (list.length === 0) return;
        html += `
            <div class="roster-alliance-group open">
                <div class="roster-alliance-header" style="border-left-color:#00d2ff;">
                    <span style="color:#00d2ff;"><i class="fa-solid fa-folder"></i> ${t(cat.labelKey)} (${list.length})</span>
                    <i class="fa-solid fa-chevron-down roster-toggle-icon"></i>
                </div>
                <div class="roster-alliance-list" style="max-height:none;">
                    ${list.map(a => {
                        const title = (a.title && (a.title[LANG] || a.title.ru)) || '(без названия)';
                        return `<div class="roster-entry" onclick="openArticleView('${a.id}')"><span class="roster-entry-name">${escapeHtml(title)}</span></div>`;
                    }).join('')}
                </div>
            </div>`;
    });
    container.innerHTML = html || `<div style="color:var(--text-secondary);text-align:center;padding:20px;font-size:12px;">${t('articles.empty')}</div>`;
}

function showArticlesPane(name) {
    document.getElementById('articles-list-view').style.display = name === 'list' ? 'block' : 'none';
    document.getElementById('article-view').style.display = name === 'view' ? 'block' : 'none';
    document.getElementById('article-editor-view').style.display = name === 'editor' ? 'block' : 'none';
}

function openArticleView(id) {
    const article = articlesCache.find(a => a.id === id);
    if (!article) return;
    currentArticleId = id;
    showArticlesPane('view');

    const hasTranslation = !!(article.title && article.title[LANG]);
    const title = (article.title && (article.title[LANG] || article.title.ru)) || '';
    const content = (article.content && (article.content[LANG] || article.content.ru)) || '';
    document.getElementById('article-view-title').textContent = title;
    document.getElementById('article-view-content').innerHTML = content;

    // Кнопка перевода — только если для текущего языка перевода ещё нет, и не
    // для базового языка статьи (RU и так уже есть, переводить не на что).
    const translateBtn = document.getElementById('btn-translate-view');
    if (translateBtn) {
        translateBtn.style.display = (!hasTranslation && LANG !== 'ru') ? 'flex' : 'none';
    }

    if (!hasTranslation && LANG !== 'ru' && isViewerMode) {
        showToast(t('articles.noTranslation'), 'info');
    }
}
// Вызывается из inline onclick в динамически генерируемом списке — должна быть в global scope.
window.openArticleView = openArticleView;

let quillLoadPromise = null;
function loadQuillIfNeeded() {
    if (typeof Quill !== 'undefined') return Promise.resolve();
    if (quillLoadPromise) return quillLoadPromise;

    quillLoadPromise = new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Не удалось загрузить редактор статей'));
        document.head.appendChild(script);
    });
    return quillLoadPromise;
}

async function initQuillEditors() {
    await loadQuillIfNeeded();
    if (!quillRu) quillRu = new Quill('#editor-quill-ru', { theme: 'snow' });
    if (!quillEn) quillEn = new Quill('#editor-quill-en', { theme: 'snow' });
}

async function openArticleEditor(article) {
    if (isViewerMode) return;
    showArticlesPane('editor');
    try {
        await initQuillEditors();
    } catch (e) {
        showToast('Не удалось загрузить редактор — проверь интернет-соединение', 'error');
        return;
    }

    currentArticleId = article ? article.id : null;
    document.getElementById('editor-category').value = article ? article.category : 'charter';
    document.getElementById('editor-title-ru').value = (article && article.title && article.title.ru) || '';
    document.getElementById('editor-title-en').value = (article && article.title && article.title.en) || '';
    if (quillRu) quillRu.root.innerHTML = (article && article.content && article.content.ru) || '';
    if (quillEn) quillEn.root.innerHTML = (article && article.content && article.content.en) || '';
}

(function initArticles() {
    const openBtn = document.getElementById('btn-open-articles');
    const closeBtn = document.getElementById('btn-close-articles');
    const modal = document.getElementById('articles-modal');

    if (openBtn && modal) {
        openBtn.addEventListener('click', async () => {
            modal.classList.add('active');
            showArticlesPane('list');
            await loadArticles();
            renderArticlesList();
        });
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    // Перевод прямо с экрана просмотра статьи (не только из редактора) — командир
    // читает статью и сразу видит кнопку "Перевести", если для текущего языка
    // перевода ещё нет. Результат сохраняется в статью — следующему читателю
    // переводить уже не придётся.
    const translateViewBtn = document.getElementById('btn-translate-view');
    if (translateViewBtn) translateViewBtn.addEventListener('click', async () => {
        if (isViewerMode || !currentArticleId) return;
        const article = articlesCache.find(a => a.id === currentArticleId);
        if (!article) return;

        const srcLang = 'ru'; // база статей всегда пишется на RU
        const titleSrc = article.title && article.title[srcLang];
        const contentSrc = article.content && article.content[srcLang];
        if (!titleSrc || !contentSrc) {
            showToast(t('articles.needTitleContent'), 'error');
            return;
        }

        showToast(t('articles.translating'), 'info');
        translateViewBtn.disabled = true;
        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: getSecretKey(), title: titleSrc, content: contentSrc, sourceLang: srcLang, targetLang: LANG })
            });
            const data = await res.json();
            if (!data.title || !data.content) {
                showToast(data.error || t('articles.translateError'), 'error');
                return;
            }

            // Сохраняем перевод сразу в статью — следующий читатель на этом языке
            // увидит готовый перевод, без повторного обращения к ИИ.
            const newTitle = Object.assign({}, article.title, { [LANG]: data.title });
            const newContent = Object.assign({}, article.content, { [LANG]: data.content });
            const saveRes = await fetch('/api/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: getSecretKey(), id: article.id, category: article.category, title: newTitle, content: newContent })
            });
            const saved = await saveRes.json();
            if (saved.id) {
                showToast(t('articles.translated'), 'success');
                await loadArticles();
                openArticleView(article.id); // перерисовать уже с переводом
            } else {
                showToast(saved.error || t('articles.translateError'), 'error');
            }
        } catch (err) {
            showToast(t('articles.translateError'), 'error');
        } finally {
            translateViewBtn.disabled = false;
        }
    });

    const backBtn = document.getElementById('btn-back-to-list');
    if (backBtn) backBtn.addEventListener('click', () => showArticlesPane('list'));

    const cancelBtn = document.getElementById('btn-cancel-edit');
    if (cancelBtn) cancelBtn.addEventListener('click', () => showArticlesPane(currentArticleId ? 'view' : 'list'));

    const newBtn = document.getElementById('btn-new-article');
    if (newBtn) newBtn.addEventListener('click', () => openArticleEditor(null));

    const editBtn = document.getElementById('btn-edit-article');
    if (editBtn) editBtn.addEventListener('click', () => {
        const article = articlesCache.find(a => a.id === currentArticleId);
        if (article) openArticleEditor(article);
    });

    const deleteBtn = document.getElementById('btn-delete-article');
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (isViewerMode || !currentArticleId) return;
        if (!confirm(t('articles.confirmDelete'))) return;
        try {
            const res = await fetch(`/api/articles/${currentArticleId}?secretKey=${encodeURIComponent(getSecretKey())}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast(t('articles.deleted'), 'success');
                await loadArticles();
                renderArticlesList();
                showArticlesPane('list');
            } else {
                showToast(data.error || 'Error', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    });

    // Добавление фото — грузим на сервер (сжимается в WebP там же), вставляем в Quill
    const addImageBtn = document.getElementById('btn-add-image');
    const imageInput = document.getElementById('editor-image-input');
    if (addImageBtn && imageInput) {
        addImageBtn.addEventListener('click', () => { if (!isViewerMode) imageInput.click(); });
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('secretKey', getSecretKey());
            formData.append('image', file);
            showToast('Загружаем фото...', 'info');
            try {
                const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.url && quillRu) {
                    const range = quillRu.getSelection(true) || { index: quillRu.getLength() };
                    quillRu.insertEmbed(range.index, 'image', data.url);
                    showToast('Фото добавлено', 'success');
                } else {
                    showToast(data.error || 'Ошибка загрузки фото', 'error');
                }
            } catch (err) {
                showToast('Ошибка загрузки фото', 'error');
            }
            e.target.value = '';
        });
    }

    // Перевод статьи через Claude API (сервер — прокси, ключ только на сервере)
    const translateBtn = document.getElementById('btn-translate-article');
    if (translateBtn) translateBtn.addEventListener('click', async () => {
        if (isViewerMode) return;
        const titleRu = document.getElementById('editor-title-ru').value.trim();
        const contentRu = quillRu ? quillRu.root.innerHTML : '';
        if (!titleRu || !contentRu || contentRu === '<p><br></p>') {
            showToast(t('articles.needTitleContent'), 'error');
            return;
        }
        showToast(t('articles.translating'), 'info');
        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: getSecretKey(), title: titleRu, content: contentRu, sourceLang: 'ru', targetLang: 'en' })
            });
            const data = await res.json();
            if (data.title && data.content) {
                document.getElementById('editor-title-en').value = data.title;
                if (quillEn) quillEn.root.innerHTML = data.content;
                showToast(t('articles.translated'), 'success');
            } else {
                showToast(data.error || t('articles.translateError'), 'error');
            }
        } catch (err) {
            showToast(t('articles.translateError'), 'error');
        }
    });

    // Сохранение статьи (создание либо обновление, если currentArticleId уже есть)
    const saveBtn = document.getElementById('btn-save-article');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
        if (isViewerMode) return;
        const titleRu = document.getElementById('editor-title-ru').value.trim();
        const contentRu = quillRu ? quillRu.root.innerHTML : '';
        if (!titleRu || !contentRu || contentRu === '<p><br></p>') {
            showToast(t('articles.needTitleContent'), 'error');
            return;
        }
        const payload = {
            secretKey: getSecretKey(),
            id: currentArticleId || undefined,
            category: document.getElementById('editor-category').value,
            title: { ru: titleRu, en: document.getElementById('editor-title-en').value.trim() },
            content: { ru: contentRu, en: quillEn ? quillEn.root.innerHTML : '' }
        };
        try {
            const res = await fetch('/api/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.id) {
                showToast(t('articles.saved'), 'success');
                currentArticleId = data.id;
                await loadArticles();
                renderArticlesList();
                showArticlesPane('list');
            } else {
                showToast(data.error || 'Error', 'error');
            }
        } catch (e) {
            showToast('Error', 'error');
        }
    });
})();
