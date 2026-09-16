document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://127.0.0.1:8000/api';

    // Detección automática de la vista
    let currentView = 'notes';
    const path = window.location.pathname;

    if (path.includes('favoritos.html')) {
        currentView = 'favorites';
    } else if (path.includes('papelera.html')) {
        currentView = 'trash';
    } else if (path.includes('categorias.html')) {
        currentView = 'categories';
    }

    let categoryFilter = null;

    // Normalizador de clases de color
    function getColorClass(colorName) {
        if (!colorName) return 'card-peach';
        const str = String(colorName).toLowerCase().trim();

        if (str.includes('mint') || str.includes('menta')) return 'card-mint';
        if (str.includes('lavender') || str.includes('lavanda')) return 'card-lavender';
        if (str.includes('peach') || str.includes('durazno')) return 'card-peach';
        if (str.startsWith('card-')) return str;

        return 'card-peach';
    }

    // Elementos del DOM
    const notesGrid = document.querySelector('.notes-grid') || document.querySelector('.categories-grid') || document.getElementById('trashGrid');
    const modal = document.getElementById('editor-modal');
    const btnSaveNote = document.getElementById('btn-save-note');
    const btnCancel = document.getElementById('btn-cancel');
    const inputTitle = document.getElementById('note-title');
    const inputContent = document.getElementById('note-content');
    const selectColor = document.getElementById('note-color');
    const selectCategory = document.getElementById('note-category');

    // Botones de navegación
    const btnNewNote = document.querySelector('.card-new');
    const btnFavs = document.querySelector('.card-favs');
    const btnCategories = document.querySelector('.card-categories');
    const btnTrash = document.querySelector('.trash-btn');

    // Petición genérica a la API
    async function fetchAPI(endpoint, method = 'GET', body = null) {
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) options.body = JSON.stringify(body);

            const response = await fetch(`${API_URL}${endpoint}`, options);
            if (!response.ok) {
                console.error(`Error HTTP ${response.status} en ${endpoint}`);
                return null;
            }
            return await response.json();
        } catch (err) {
            console.error(`Error de conexión con la API (${endpoint}):`, err);
            return null;
        }
    }

    // Cargar la vista actual
    async function loadCurrentView() {
        if (!notesGrid) return;

        if (currentView === 'categories') {
            renderCategories();
            return;
        }

        notesGrid.className = currentView === 'favorites' ? 'notes-grid list-mode' : (currentView === 'trash' ? 'trash-grid' : 'notes-grid');
        notesGrid.innerHTML = '<p style="color: white; font-weight: 600;">Cargando notas de la base de datos...</p>';

        const endpoint = (currentView === 'trash') ? '/trash' : '/notes';
        const data = await fetchAPI(endpoint);

        console.log('Datos recibidos de la BD:', data); // Diagnóstico en consola

        let items = Array.isArray(data) ? data : [];

        if (currentView === 'favorites') {
            items = items.filter(item => item.is_favorite === true || item.favorite === true);
        } else if (currentView === 'notes' && categoryFilter) {
            items = items.filter(item => item.category === categoryFilter);
        }

        renderNotes(items);
    }

    // Renderizar tarjetas
    function renderNotes(items) {
        notesGrid.innerHTML = '';

        if (items.length === 0) {
            const mensaje = categoryFilter
                ? `No hay notas en la categoría "${categoryFilter}".`
                : (currentView === 'trash' ? 'La papelera está vacía.' : 'No hay notas para mostrar.');
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600; font-size: 18px;" class="empty-msg">${mensaje}</p>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            const isTrash = currentView === 'trash';
            const colorClass = getColorClass(item.color);

            card.className = isTrash ? 'trash-card' : `note-card ${colorClass}`;

            if (isTrash) {
                card.innerHTML = `
                    <div class="trash-card-info">
                        <h3>${item.title || 'Sin título'}</h3>
                        <p>${item.content || ''}</p>
                    </div>
                    <div class="trash-actions">
                        <button class="btn-restore">🔄 Restaurar</button>
                        <button class="btn-delete-perm">❌ Eliminar</button>
                    </div>
                `;

                card.querySelector('.btn-restore')?.addEventListener('click', async () => {
                    await fetchAPI(`/notes/${item.id}/trash?is_trash=false`, 'PUT');
                    loadCurrentView();
                });

                card.querySelector('.btn-delete-perm')?.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar definitivamente?`)) {
                        await fetchAPI(`/notes/${item.id}`, 'DELETE');
                        loadCurrentView();
                    }
                });
            } else {
                card.innerHTML = `
                    <div class="card-header-icons">
                        <button class="btn-fav" title="Favorito">⭐</button>
                        <button class="btn-delete" title="Mover a Papelera">🗑️</button>
                    </div>
                    <div class="card-body">
                        <h3>${item.title || 'Sin título'}</h3>
                        <p>${item.content || ''}</p>
                    </div>
                    <div class="card-footer">
                        <span>📁 ${item.category || 'General'}</span>
                    </div>
                `;

                card.querySelector('.btn-fav')?.addEventListener('click', async () => {
                    const isFav = item.is_favorite || item.favorite;
                    await fetchAPI(`/notes/${item.id}/favorite?is_favorite=${!isFav}`, 'PUT');
                    loadCurrentView();
                });

                card.querySelector('.btn-delete')?.addEventListener('click', async () => {
                    await fetchAPI(`/notes/${item.id}/trash?is_trash=true`, 'PUT');
                    loadCurrentView();
                });
            }

            notesGrid.appendChild(card);
        });
    }

    function renderCategories() {
        notesGrid.innerHTML = '';
        const categoriesData = [
            { name: 'General', color: 'var(--butter)', icon: '📁' },
            { name: 'Trabajo', color: 'var(--pink)', icon: '💼' },
            { name: 'Escuela', color: 'var(--matcha)', icon: '🎓' },
            { name: 'Casa', color: 'var(--tangerine)', icon: '🏠' }
        ];

        categoriesData.forEach(cat => {
            const card = document.createElement('article');
            card.className = 'category-card';
            card.style.backgroundColor = cat.color;
            card.innerHTML = `<span class="category-icon">${cat.icon}</span><h3>${cat.name}</h3>`;
            card.addEventListener('click', () => {
                window.location.href = `./index.html?category=${encodeURIComponent(cat.name)}`;
            });
            notesGrid.appendChild(card);
        });
    }

    // Verificar filtros URL
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('category');
    if (catParam) categoryFilter = catParam;

    // Guardar Nota
    if (btnSaveNote) {
        btnSaveNote.addEventListener('click', async () => {
            const title = inputTitle.value.trim();
            const content = inputContent.value.trim();
            const color = selectColor ? selectColor.value : 'card-peach';
            const category = selectCategory ? selectCategory.value : 'General';

            if (!title || !content) {
                alert('Por favor completa el título y el contenido.');
                return;
            }

            const payload = { title, content, color, category };
            console.log('Enviando a BD:', payload);

            const res = await fetchAPI('/notes', 'POST', payload);

            if (res) {
                if (modal) modal.classList.remove('active');
                inputTitle.value = '';
                inputContent.value = '';
                loadCurrentView();
            } else {
                alert('Ocurrió un error al guardar en la base de datos.');
            }
        });
    }

    if (btnNewNote) {
        btnNewNote.addEventListener('click', () => {
            if (modal) modal.classList.add('active');
        });
    }

    if (btnCancel && modal) {
        btnCancel.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (btnFavs) btnFavs.addEventListener('click', () => window.location.href = './favoritos.html');
    if (btnTrash) btnTrash.addEventListener('click', () => window.location.href = './papelera.html');
    if (btnCategories) btnCategories.addEventListener('click', () => window.location.href = './categorias.html');

    // Carga inicial
    loadCurrentView();
});