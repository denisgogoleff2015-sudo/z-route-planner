// ===== 10/10: СТАТЬИ (Устав / Туториалы VS / Межконт. война) =====
// Хранилище — простой JSON-файл на сервере (как и карта), редактор — Quill.js
// (грузится с CDN, работает в браузере). Перевод — через сервер, который
// проксирует запрос в DeepSeek API (ключ хранится только на сервере).
//
// Модель языков: НИ один язык не привилегирован. Автор пишет и правит статью
// прямо на том языке, что сейчас выбран на сайте (переключатель RU/EN/FR) —
// если сайт на русском, значит пишешь сразу на русском, без черновиков и
// промежуточных шагов. Другие языки — переводы по требованию, создаются при
// чтении, если для текущего языка сайта ещё ничего не написано вручную.
// Сохранение НЕ трогает другие языки статьи — если кто-то отредактирует RU,
// уже существующий EN/FR не сбрасывается автоматически (никто не отслеживает,
// "устарел" ли перевод — это, по сути, вики-модель: заметил нестыковку, поправил
// на своём языке сам).

let articlesCache = [];
let currentArticleId = null; // какая статья сейчас открыта/редактируется
let quillEditor = null;

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

// Первый язык статьи, у которого реально есть и заголовок, и текст — нужен как
// запасной вариант для показа/перевода, если для текущего языка сайта ничего
// ещё не написано. EN предпочитается как наиболее вероятный "общий" вариант,
// если написано на нескольких языках сразу.
function findAnyAvailableLang(article) {
    if (!article || !article.title || !article.content) return null;
    const available = Object.keys(article.title).filter(k => article.title[k] && article.content[k]);
    if (available.length === 0) return null;
    return available.includes('en') ? 'en' : available[0];
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
                        const fallbackLang = findAnyAvailableLang(a);
                        const title = (a.title && (a.title[LANG] || (fallbackLang && a.title[fallbackLang]))) || '(untitled)';
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

    const hasTranslation = !!(article.title && article.title[LANG] && article.content && article.content[LANG]);
    const fallbackLang = findAnyAvailableLang(article);
    const title = (article.title && (article.title[LANG] || (fallbackLang && article.title[fallbackLang]))) || '';
    const content = (article.content && (article.content[LANG] || (fallbackLang && article.content[fallbackLang]))) || '';
    document.getElementById('article-view-title').textContent = title;
    document.getElementById('article-view-content').innerHTML = content;

    const translateBtn = document.getElementById('btn-translate-view');
    if (translateBtn) {
        // Нечего переводить, если для текущего языка уже есть написанный вручную
        // текст, или если вообще ни на одном языке ничего не написано.
        translateBtn.style.display = (!hasTranslation && fallbackLang && !isViewerMode) ? 'flex' : 'none';
    }

    if (!hasTranslation && fallbackLang && isViewerMode) {
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

async function initQuillEditor() {
    await loadQuillIfNeeded();
    if (!quillEditor) quillEditor = new Quill('#editor-quill', { theme: 'snow' });
}

async function openArticleEditor(article) {
    if (isViewerMode) return;
    showArticlesPane('editor');
    try {
        await initQuillEditor();
    } catch (e) {
        showToast('Не удалось загрузить редактор — проверь интернет-соединение', 'error');
        return;
    }

    currentArticleId = article ? article.id : null;
    document.getElementById('editor-category').value = article ? article.category : 'charter';
    // Поля показывают то, что уже написано на ТЕКУЩЕМ языке сайта — если для
    // этого языка ещё ничего нет, поля просто пустые (не подставляем другой
    // язык вместо него, иначе легко случайно сохранить чужой текст как свой).
    document.getElementById('editor-title').value = (article && article.title && article.title[LANG]) || '';
    if (quillEditor) quillEditor.root.innerHTML = (article && article.content && article.content[LANG]) || '';
}

(function initArticles() {
    // Статьи — обычная сворачиваемая секция сайдбара (аккордеон уже
    // обрабатывается общим обработчиком .section-title в 09-mobile-i18n.js),
    // поэтому просто грузим список один раз при старте.
    loadArticles().then(renderArticlesList);

    // Перевод прямо с экрана просмотра статьи — берём любой уже написанный
    // язык как источник, переводим на текущий язык сайта, сохраняем в статью.
    // Следующему читателю на этом языке уже не придётся ждать перевод — он готов.
    const translateViewBtn = document.getElementById('btn-translate-view');
    if (translateViewBtn) translateViewBtn.addEventListener('click', async () => {
        if (isViewerMode || !currentArticleId) return;
        const article = articlesCache.find(a => a.id === currentArticleId);
        if (!article) return;

        const srcLang = findAnyAvailableLang(article);
        const titleSrc = srcLang && article.title[srcLang];
        const contentSrc = srcLang && article.content[srcLang];
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

            // Сохраняем перевод сразу в статью — следующий читатель на этом
            // языке увидит готовый вариант, без повторного обращения к ИИ.
            const payload = {
                secretKey: getSecretKey(),
                id: article.id,
                category: article.category,
                lang: LANG,
                title: data.title,
                content: data.content
            };
            const saveRes = await fetch('/api/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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
                if (data.url && quillEditor) {
                    const range = quillEditor.getSelection(true) || { index: quillEditor.getLength() };
                    quillEditor.insertEmbed(range.index, 'image', data.url);

                    // Подпись — необязательно. Пусто/отмена = ничего не добавляем,
                    // только само фото.
                    const caption = (prompt('Подпись под фото (необязательно — оставь пустым, если не нужна):') || '').trim();
                    if (caption) {
                        const afterImage = range.index + 1;
                        quillEditor.insertText(afterImage, caption + '\n', { italic: true, align: 'center' });
                        quillEditor.setSelection(afterImage + caption.length + 1);
                    } else {
                        quillEditor.setSelection(range.index + 1);
                    }
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

    // Сохранение статьи — пишет на ТЕКУЩЕМ языке сайта (не всегда EN, как
    // раньше). Другие языки статьи не трогаются: сохраняем только то, что
    // реально отредактировали, не более.
    const saveBtn = document.getElementById('btn-save-article');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
        if (isViewerMode) return;
        const titleText = document.getElementById('editor-title').value.trim();
        const contentText = quillEditor ? quillEditor.root.innerHTML : '';
        if (!titleText || !contentText || contentText === '<p><br></p>') {
            showToast(t('articles.needTitleContent'), 'error');
            return;
        }

        const payload = {
            secretKey: getSecretKey(),
            id: currentArticleId || undefined,
            category: document.getElementById('editor-category').value,
            lang: LANG,
            title: titleText,
            content: contentText
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
