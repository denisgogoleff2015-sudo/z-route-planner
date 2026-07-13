// ===== 10/10: СТАТЬИ (Устав / Туториалы VS / Межконт. война) =====
// Хранилище — простой JSON-файл на сервере (как и карта), редактор — Quill.js
// (грузится с CDN, работает в браузере). Перевод — через сервер, который
// проксирует запрос в DeepSeek API (ключ хранится только на сервере).
//
// Модель языков: английский — ЕДИНСТВЕННЫЙ оригинал статьи (article.title.en/
// content.en — обязательные поля, редактируются через основную форму, с
// необязательным черновиком на русском для тех, кому проще сначала написать на
// родном языке). Другие языки — переводы:
//   - обычно создаются автоматически кнопкой "Перевести" при чтении;
//   - при изменении английского текста ТАКИЕ (не редактированные руками)
//     переводы стираются — читатель на этом языке просто переведёт заново;
//   - НО если перевод был отредактирован вручную (кнопка "Поправить этот
//     перевод"), при следующем изменении английского он НЕ стирается, а лишь
//     помечается "стоит перепроверить" — так ручной труд не пропадает зря.

let articlesCache = [];
let currentArticleId = null; // какая статья сейчас открыта/редактируется
let editorTargetLang = 'en'; // какой язык сейчас в форме редактирования (en = оригинал)
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
                        // Английский — основной язык статьи, всегда существует; текущий
                        // язык сайта показываем, если для него уже готов перевод.
                        const title = (a.title && (a.title[LANG] || a.title.en)) || '(untitled)';
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

    // EN — всегда существующий базовый текст. Если открыт язык сайта, для
    // которого перевода ещё нет, временно показываем EN как запасной вариант.
    const hasTranslation = LANG === 'en' || !!(article.title && article.title[LANG]);
    const title = (article.title && (article.title[LANG] || article.title.en)) || '';
    const content = (article.content && (article.content[LANG] || article.content.en)) || '';
    document.getElementById('article-view-title').textContent = title;
    document.getElementById('article-view-content').innerHTML = content;

    const translateBtn = document.getElementById('btn-translate-view');
    if (translateBtn) {
        translateBtn.style.display = (!hasTranslation && LANG !== 'en') ? 'flex' : 'none';
    }

    // "Поправить этот перевод" — только если перевод для текущего (не EN) языка
    // уже существует; правка через эту кнопку помечает язык как отредактированный
    // вручную (см. openArticleEditor/сохранение), чтобы он не стирался молча.
    const editTranslationBtn = document.getElementById('btn-edit-translation');
    if (editTranslationBtn) {
        editTranslationBtn.style.display = (hasTranslation && LANG !== 'en') ? 'flex' : 'none';
    }

    // Предупреждение "может быть устарело" — только для отредактированных вручную
    // переводов, у которых английский текст с тех пор поменялся (staleLangs).
    const staleWarning = document.getElementById('article-stale-warning');
    if (staleWarning) {
        const isStale = LANG !== 'en' && article.staleLangs && article.staleLangs.includes(LANG);
        staleWarning.style.display = isStale ? 'block' : 'none';
    }

    if (!hasTranslation && LANG !== 'en' && isViewerMode) {
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

// lang: 'en' — обычная правка оригинала (по умолчанию); любой другой код —
// правка конкретного перевода напрямую (кнопка "Поправить этот перевод").
async function openArticleEditor(article, lang) {
    if (isViewerMode) return;
    editorTargetLang = lang || 'en';
    showArticlesPane('editor');
    try {
        await initQuillEditor();
    } catch (e) {
        showToast('Не удалось загрузить редактор — проверь интернет-соединение', 'error');
        return;
    }

    currentArticleId = article ? article.id : null;
    document.getElementById('editor-category').value = article ? article.category : 'charter';
    document.getElementById('editor-title').value = (article && article.title && article.title[editorTargetLang]) || '';
    if (quillEditor) quillEditor.root.innerHTML = (article && article.content && article.content[editorTargetLang]) || '';

    // Черновик на русском и подпись поля имеют смысл только при правке ОРИГИНАЛА
    // (EN) — при прямой правке конкретного перевода это лишнее и сбивает с толку.
    const isEnglishEdit = editorTargetLang === 'en';
    const draftBox = document.getElementById('ru-draft-box');
    if (draftBox) draftBox.style.display = isEnglishEdit ? 'block' : 'none';
    const titleLabel = document.getElementById('editor-title-label');
    if (titleLabel) {
        if (isEnglishEdit) {
            titleLabel.setAttribute('data-i18n', 'articles.titleEn');
            titleLabel.textContent = t('articles.titleEn');
        } else {
            titleLabel.removeAttribute('data-i18n');
            titleLabel.textContent = `${t('articles.titleLabel')} (${editorTargetLang.toUpperCase()})`;
        }
    }
    // Черновик — временное поле, не привязано к статье, всегда чистое при открытии.
    const draftTitle = document.getElementById('ru-draft-title');
    const draftContent = document.getElementById('ru-draft-content');
    if (draftTitle) draftTitle.value = '';
    if (draftContent) draftContent.value = '';
}

(function initArticles() {
    // Статьи — обычная сворачиваемая секция сайдбара (аккордеон уже
    // обрабатывается общим обработчиком .section-title в 09-mobile-i18n.js),
    // поэтому просто грузим список один раз при старте.
    loadArticles().then(() => {
        renderArticlesList();
        // Уведомление на Главной могло отрисоваться РАНЬШЕ, чем список статей
        // успел загрузиться — кнопка "Подробнее" проверяет articlesCache, и если
        // на тот момент он был ещё пуст, кнопка оставалась скрытой навсегда.
        // Перерисовываем после того, как статьи точно готовы.
        if (typeof renderHomeNotification === 'function') renderHomeNotification();
    });

    // Перевод прямо с экрана просмотра статьи — читаем EN (всегда есть),
    // переводим на текущий язык сайта, сохраняем в статью. Следующему читателю
    // на этом языке уже не придётся ждать перевод — он готов. Это АВТОМАТИЧЕСКИЙ
    // перевод — НЕ помечаем его как отредактированный вручную, он по-прежнему
    // будет стёрт при следующем изменении английского текста (это ожидаемо).
    const translateViewBtn = document.getElementById('btn-translate-view');
    if (translateViewBtn) translateViewBtn.addEventListener('click', async () => {
        if (isViewerMode || !currentArticleId) return;
        const article = articlesCache.find(a => a.id === currentArticleId);
        if (!article) return;

        const titleSrc = article.title && article.title.en;
        const contentSrc = article.content && article.content.en;
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
                body: JSON.stringify({ secretKey: getSecretKey(), title: titleSrc, content: contentSrc, sourceLang: 'en', targetLang: LANG })
            });
            const data = await res.json();
            if (!data.title || !data.content) {
                showToast(data.error || t('articles.translateError'), 'error');
                return;
            }

            const payload = {
                secretKey: getSecretKey(), id: article.id, category: article.category,
                lang: LANG, title: data.title, content: data.content
                // isManualTranslationEdit не передаём — это автоперевод, а не ручная правка
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

    // "Поправить этот перевод" — открывает редактор ПРЯМО для текущего (не EN)
    // языка сайта. Сохранение отсюда помечает язык как отредактированный
    // вручную — при следующем изменении английского он не сотрётся молча.
    const editTranslationBtn = document.getElementById('btn-edit-translation');
    if (editTranslationBtn) editTranslationBtn.addEventListener('click', () => {
        const article = articlesCache.find(a => a.id === currentArticleId);
        if (article) openArticleEditor(article, LANG);
    });

    const backBtn = document.getElementById('btn-back-to-list');
    if (backBtn) backBtn.addEventListener('click', () => showArticlesPane('list'));

    const cancelBtn = document.getElementById('btn-cancel-edit');
    if (cancelBtn) cancelBtn.addEventListener('click', () => showArticlesPane(currentArticleId ? 'view' : 'list'));

    const newBtn = document.getElementById('btn-new-article');
    if (newBtn) newBtn.addEventListener('click', () => openArticleEditor(null, 'en'));

    const editBtn = document.getElementById('btn-edit-article');
    if (editBtn) editBtn.addEventListener('click', () => {
        const article = articlesCache.find(a => a.id === currentArticleId);
        if (article) openArticleEditor(article, 'en');
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

    // Черновик на русском (необязательно) — переводит в рабочие EN-поля, не
    // сохраняет ничего сам по себе, просто предзаполняет форму для проверки.
    const translateDraftBtn = document.getElementById('btn-translate-ru-draft');
    if (translateDraftBtn) translateDraftBtn.addEventListener('click', async () => {
        if (isViewerMode) return;
        const titleRu = document.getElementById('ru-draft-title').value.trim();
        const contentRuRaw = document.getElementById('ru-draft-content').value.trim();
        if (!titleRu || !contentRuRaw) {
            showToast(t('articles.needRuDraft'), 'error');
            return;
        }
        // Черновик — простой текст, оборачиваем в <p> построчно, чтобы получить
        // корректный HTML для перевода и последующей вставки в Quill.
        const contentRuHtml = contentRuRaw.split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join('');

        showToast(t('articles.translating'), 'info');
        translateDraftBtn.disabled = true;
        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secretKey: getSecretKey(), title: titleRu, content: contentRuHtml, sourceLang: 'ru', targetLang: 'en' })
            });
            const data = await res.json();
            if (data.title && data.content) {
                document.getElementById('editor-title').value = data.title;
                if (quillEditor) quillEditor.root.innerHTML = data.content;
                showToast(t('articles.translated'), 'success');
            } else {
                showToast(data.error || t('articles.translateError'), 'error');
            }
        } catch (err) {
            showToast(t('articles.translateError'), 'error');
        } finally {
            translateDraftBtn.disabled = false;
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

    // Сохранение статьи. editorTargetLang === 'en' — обычная правка оригинала
    // (создание новой статьи возможно ТОЛЬКО так). Любой другой язык — прямая
    // правка перевода, помечается как isManualTranslationEdit, чтобы сервер
    // не стирал её при следующем изменении английского текста.
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
            lang: editorTargetLang,
            title: titleText,
            content: contentText,
            isManualTranslationEdit: editorTargetLang !== 'en'
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
