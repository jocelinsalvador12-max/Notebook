document.addEventListener('DOMContentLoaded', () => {
    // 1. Configuración de la API local
    const API_URL = 'http://127.0.0.1:8000/api';

    // 2. Detección automática de la vista basada en la URL física del navegador
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

    // 3. Elementos del DOM
    const notesGrid = document.querySelector('.notes-grid');
    const sectionTitle = document.querySelector('.section-title');

    // Botones de navegación (en index.html)
    const btnNewNote = document.querySelector('.card-new');
    const btnFavs = document.querySelector('.card-favs');
    const btnCategories = document.querySelector('.card-categories');
    const btnTrash = document.querySelector('.trash-btn');

    // Modal y Formulario
    const modal = document.getElementById('editor-modal');
    const btnSaveNote = document.getElementById('btn-save-note');
    const btnCancel = document.getElementById('btn-cancel');
    const inputTitle = document.getElementById('note-title');
    const inputContent = document.getElementById('note-content');
    const selectColor = document.getElementById('note-color');
    const selectCategory = document.getElementById('note-category');

    const FAVORITOS_PALETTE = [
        { bg: '#F08C21', text: '#ffffff' },
        { bg: '#F2D88F', text: '#5c4a1a' },
        { bg: '#E36888', text: '#ffffff' },
        { bg: '#6698CC', text: '#ffffff' },
        { bg: '#B4B534', text: '#ffffff' }
    ];

    // 4. Peticiones HTTP a FastAPI
    async function fetchAPI(endpoint, method = 'GET', body = null) {
        try {
            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) options.body = JSON.stringify(body);

            const response = await fetch(`${API_URL}${endpoint}`, options);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error(`Error en petición ${endpoint}:`, err);
            return null;
        }
    }

    // 5. Cargar datos según la vista
    async function loadCurrentView() {
        if (!notesGrid) return;

        notesGrid.className = 'notes-grid';
        notesGrid.innerHTML = '<p style="color: white; font-weight: 600;">Cargando...</p>';

        if (currentView === 'categories') {
            renderCategories();
            return;
        }

        // Consultamos siempre el endpoint principal /notes o /trash
        const endpoint = (currentView === 'trash') ? '/trash' : '/notes';
        const data = await fetchAPI(endpoint);
        let items = data || [];

        // Filtrado dinámico según la vista actual
        if (currentView === 'favorites') {
            items = items.filter(item => item.is_favorite === true || item.favorite === true);
        } else if (currentView === 'notes' && categoryFilter) {
            items = items.filter(item => item.category === categoryFilter);
        }

        renderNotes(items);
    }

    // 6. Renderizado de notas y tarjetas
    function renderNotes(items) {
        notesGrid.innerHTML = '';

        if (currentView === 'favorites') {
            renderFavoritesList(items);
            return;
        }

        if (items.length === 0) {
            const mensaje = categoryFilter
                ? `No hay notas en la categoría "${categoryFilter}".`
                : `No hay notas para mostrar.`;
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600;">${mensaje}</p>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            card.className = `note-card ${item.color || 'card-peach'}`;

            const isTrash = currentView === 'trash';
            const iconsHTML = isTrash
                ? `<button class="btn-restore" title="Restaurar nota">🔄</button>
                   <button class="btn-delete-forever" title="Eliminar definitivamente">❌</button>`
                : `<button class="btn-fav" title="Favorito">⭐</button>
                   <button class="btn-delete" title="Mover a Papelera">🗑️</button>`;

            card.innerHTML = `
                <div class="card-header-icons">${iconsHTML}</div>
                <div class="card-body">
                    <h3>${item.title}</h3>
                    <p>${item.content}</p>
                </div>
                <div class="card-footer">
                    <span>📁 ${item.category || 'General'}</span>
                </div>
            `;

            if (isTrash) {
                card.querySelector('.btn-restore')?.addEventListener('click', async () => {
                    await fetchAPI('/notes', 'POST', item);
                    await fetchAPI(`/notes/${item.id}`, 'DELETE');
                    loadCurrentView();
                });

                card.querySelector('.btn-delete-forever')?.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar "${item.title}" definitivamente?`)) {
                        await fetchAPI(`/notes/${item.id}`, 'DELETE');
                        loadCurrentView();
                    }
                });
            } else {
                card.querySelector('.btn-delete')?.addEventListener('click', async () => {
                    await fetchAPI(`/notes/${item.id}/trash`, 'PUT');
                    loadCurrentView();
                });
            }

            notesGrid.appendChild(card);
        });
    }

    function renderFavoritesList(items) {
        notesGrid.className = 'notes-grid list-mode';

        if (items.length === 0) {
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600;">No hay notas en Favoritos.</p>`;
            return;
        }

        items.forEach((item, index) => {
            const paletteColor = FAVORITOS_PALETTE[index % FAVORITOS_PALETTE.length];
            const row = document.createElement('article');
            row.className = 'favorite-row';
            row.style.background = paletteColor.bg;
            row.style.color = paletteColor.text;

            row.innerHTML = `
                <span class="fav-number">${index + 1}</span>
                <div class="fav-text">
                    <h3>${item.title}</h3>
                    <p>${item.content}</p>
                </div>
                <button class="btn-unfav" title="Quitar de Favoritos">💔</button>
            `;

            row.querySelector('.btn-unfav')?.addEventListener('click', async () => {
                await fetchAPI(`/notes/${item.id}/favorite?is_favorite=false`, 'PUT');
                loadCurrentView();
            });

            notesGrid.appendChild(row);
        });
    }

    function renderCategories() {
        if (sectionTitle) sectionTitle.textContent = '';
        notesGrid.className = 'categories-grid';
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

            card.innerHTML = `
                <span class="category-icon">${cat.icon}</span>
                <h3>${cat.name}</h3>
            `;

            card.addEventListener('click', () => {
                currentView = 'notes';
                categoryFilter = cat.name;
                loadCurrentView();
            });

            notesGrid.appendChild(card);
        });
    }

    // 7. Eventos de UI
    if (btnSaveNote) {
        btnSaveNote.addEventListener('click', async () => {
            const title = inputTitle.value.trim();
            const content = inputContent.value.trim();
            const color = selectColor.value;
            const category = selectCategory ? selectCategory.value : 'General';

            if (!title || !content) {
                alert('Por favor completa el título y el contenido.');
                return;
            }

            await fetchAPI('/notes', 'POST', { title, content, color, category });

            if (modal) modal.classList.remove('active');
            currentView = 'notes';
            categoryFilter = null;
            loadCurrentView();
        });
    }

    if (btnNewNote) {
        btnNewNote.addEventListener('click', () => {
            if (inputTitle) inputTitle.value = '';
            if (inputContent) inputContent.value = '';
            if (modal) modal.classList.add('active');
        });
    }

    if (btnCancel && modal) {
        btnCancel.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (btnFavs) {
        btnFavs.addEventListener('click', () => {
            currentView = 'favorites';
            categoryFilter = null;
            loadCurrentView();
        });
    }

    if (btnTrash) {
        btnTrash.addEventListener('click', () => {
            currentView = 'trash';
            categoryFilter = null;
            loadCurrentView();
        });
    }

    if (btnCategories) {
        btnCategories.addEventListener('click', () => {
            currentView = 'categories';
            categoryFilter = null;
            loadCurrentView();
        });
    }

    // Inicializa la vista
    loadCurrentView();
});