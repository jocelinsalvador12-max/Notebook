document.addEventListener('DOMContentLoaded', () => {
    // Apunta al servidor Node.js en el puerto 5080 (o proxy)
    const API_URL = 'http://localhost:5080/api';

    // Detección automática de la vista según la URL
    let currentView = 'notes';
    const path = window.location.pathname;

    if (path.includes('favoritos.html')) {
        currentView = 'favorites';
    } else if (path.includes('papelera.html')) {
        currentView = 'trash';
    } else if (path.includes('categorias.html')) {
        currentView = 'categories';
    }

    // Estado local para búsqueda y filtros reactivos en tiempo real
    let allNotesData = [];
    let currentCategoryFilter = 'All';
    let currentSearchQuery = '';

    // Mapeo de colores a la paleta oficial de la Imagen 2
    function getColorClass(colorName, categoryName) {
        if (colorName) {
            const str = String(colorName).toLowerCase().trim();
            if (str.includes('lavender') || str.includes('lavanda')) return 'card-lavender';
            if (str.includes('blue') || str.includes('azul') || str.includes('sky')) return 'card-blue';
            if (str.includes('mint') || str.includes('menta') || str.includes('green') || str.includes('matcha')) return 'card-mint';
            if (str.includes('yellow') || str.includes('amarillo') || str.includes('butter')) return 'card-yellow';
            if (str.includes('pink') || str.includes('rosa')) return 'card-pink';
            if (str.includes('peach') || str.includes('durazno')) return 'card-pink';
            if (str.startsWith('card-')) return str;
        }

        // Si no tiene color asignado, asignar según la categoría de la Imagen 1
        if (categoryName) {
            const cat = String(categoryName).toLowerCase();
            if (cat.includes('project')) return 'card-yellow';
            if (cat.includes('business') || cat.includes('trabajo')) return 'card-pink';
            if (cat.includes('personal') || cat.includes('casa')) return 'card-blue';
            if (cat.includes('escuela') || cat.includes('general')) return 'card-mint';
        }

        return 'card-lavender';
    }

    // Formateador de fecha similar al estilo de la Imagen 1 ("23 June, 2017")
    function formatNoteDate(dateVal, id) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let d = dateVal ? new Date(dateVal) : new Date();
        if (isNaN(d.getTime())) {
            d = new Date();
        }
        return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}`;
    }

    // Elementos del DOM
    const notesGrid = document.querySelector('.notes-grid') || 
                      document.querySelector('.categories-grid') || 
                      document.getElementById('trashGrid') || 
                      document.getElementById('notes-container');

    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const filterTabs = document.querySelectorAll('.filter-tab');
    const categoryTagItems = document.querySelectorAll('.category-tag-item');
    const filterFeedback = document.getElementById('filter-feedback');

    const modal = document.getElementById('editor-modal');
    const btnSaveNote = document.getElementById('btn-save-note');
    const btnCancel = document.getElementById('btn-cancel');
    const modalCloseIcon = document.getElementById('modal-close-icon');
    const inputTitle = document.getElementById('note-title');
    const inputContent = document.getElementById('note-content');
    const inputColor = document.getElementById('note-color');
    const selectCategory = document.getElementById('note-category');
    const colorSwatches = document.querySelectorAll('.swatch-btn');

    // Botones de acción / apertura modal
    const btnAddNote = document.getElementById('btn-add-note') || document.querySelector('.card-new');
    const btnSidebarAddNew = document.getElementById('btn-sidebar-add-new');

    // Petición genérica a la API de Turso DB
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

    // Cargar la vista actual desde el backend
    async function loadCurrentView() {
        if (!notesGrid) return;

        if (currentView === 'categories') {
            renderCategories();
            return;
        }

        notesGrid.innerHTML = '<p class="empty-msg">Cargando notas de Turso DB...</p>';

        const endpoint = (currentView === 'trash') 
            ? '/trash' 
            : (currentView === 'favorites' ? '/favorites' : '/notes');

        const data = await fetchAPI(endpoint);
        allNotesData = Array.isArray(data) ? data : [];

        // Leer parámetro categoría desde la URL si existe
        const urlParams = new URLSearchParams(window.location.search);
        const catParam = urlParams.get('category');
        if (catParam) {
            currentCategoryFilter = catParam;
            // Marcar el tab correspondiente
            filterTabs.forEach(tab => {
                if (tab.getAttribute('data-category').toLowerCase() === catParam.toLowerCase()) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
        }

        applyFiltersAndRender();
    }

    // Filtrar y renderizar en base a categoría y búsqueda
    function applyFiltersAndRender() {
        if (!notesGrid) return;

        let filtered = [...allNotesData];

        // 1. Filtro por categoría con soporte para sinónimos/alias
        if (currentCategoryFilter && currentCategoryFilter !== 'All') {
            const filterCat = currentCategoryFilter.toLowerCase();
            filtered = filtered.filter(item => {
                const itemCat = (item.category || 'General').toLowerCase();
                if (itemCat === filterCat) return true;
                // Soporte para notas existentes en español / inglés
                if (filterCat === 'business' && itemCat === 'trabajo') return true;
                if (filterCat === 'trabajo' && itemCat === 'business') return true;
                if (filterCat === 'personal' && itemCat === 'casa') return true;
                return false;
            });
        }

        // 2. Filtro por búsqueda en tiempo real
        if (currentSearchQuery.trim()) {
            const query = currentSearchQuery.trim().toLowerCase();
            filtered = filtered.filter(item => {
                const title = (item.title || '').toLowerCase();
                const content = (item.content || '').toLowerCase();
                const category = (item.category || '').toLowerCase();
                return title.includes(query) || content.includes(query) || category.includes(query);
            });
        }

        // Mostrar u ocultar mensaje de feedback
        if (filterFeedback) {
            if (currentSearchQuery.trim() || (currentCategoryFilter && currentCategoryFilter !== 'All')) {
                const searchLabel = currentSearchQuery ? ` coincidencias para "${escapeHTML(currentSearchQuery)}"` : '';
                const catLabel = currentCategoryFilter !== 'All' ? ` en ${escapeHTML(currentCategoryFilter)}` : '';
                filterFeedback.textContent = `Mostrando ${filtered.length} nota(s)${catLabel}${searchLabel}`;
                filterFeedback.style.display = 'inline-block';
            } else {
                filterFeedback.style.display = 'none';
            }
        }

        renderNotes(filtered);
    }

    // Renderizar tarjetas con diseño idéntico a la Imagen 1
    function renderNotes(items) {
        notesGrid.innerHTML = '';

        if (items.length === 0) {
            let mensaje = 'No hay notas para mostrar.';
            if (currentSearchQuery) {
                mensaje = `No se encontraron notas para "${escapeHTML(currentSearchQuery)}".`;
            } else if (currentCategoryFilter && currentCategoryFilter !== 'All') {
                mensaje = `No hay notas en la categoría "${escapeHTML(currentCategoryFilter)}".`;
            } else if (currentView === 'trash') {
                mensaje = 'La papelera está vacía.';
            } else if (currentView === 'favorites') {
                mensaje = 'No tienes notas marcadas como favoritas aún.';
            }
            notesGrid.innerHTML = `<p class="empty-msg">${mensaje}</p>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            const isTrash = currentView === 'trash';
            const colorClass = getColorClass(item.color, item.category);
            const isFav = item.is_favorite === 1 || item.is_favorite === true;
            const formattedDate = formatNoteDate(item.created_at || null, item.id);

            card.className = isTrash ? 'trash-card' : `note-card ${colorClass}`;

            if (isTrash) {
                card.innerHTML = `
                    <div class="trash-card-info">
                        <h3>${escapeHTML(item.title || 'Sin título')}</h3>
                        <p>${escapeHTML(item.content || '')}</p>
                    </div>
                    <div class="trash-actions">
                        <button class="btn-restore" title="Restaurar nota">🔄 Restaurar</button>
                        <button class="btn-delete-perm" title="Eliminar definitivamente">❌ Eliminar</button>
                    </div>
                `;

                card.querySelector('.btn-restore')?.addEventListener('click', async () => {
                    await fetchAPI(`/notes/${item.id}/trash?is_trash=false`, 'PUT');
                    loadCurrentView();
                });

                card.querySelector('.btn-delete-perm')?.addEventListener('click', async () => {
                    if (confirm(`¿Eliminar permanentemente "${item.title || 'esta nota'}"?`)) {
                        await fetchAPI(`/notes/${item.id}`, 'DELETE');
                        loadCurrentView();
                    }
                });
            } else {
                // Diseño de tarjeta como en la Imagen 1: Fecha arriba, título con punto de color, texto, categoría y botones de acción
                card.innerHTML = `
                    <div class="card-top-row">
                        <span class="note-date">${formattedDate}</span>
                        <div class="card-actions-quick">
                            <button class="btn-fav ${isFav ? 'active' : ''}" title="${isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}">
                                ${isFav ? '★' : '☆'}
                            </button>
                            <button class="btn-delete" title="Mover a Papelera">
                                🗑️
                            </button>
                        </div>
                    </div>

                    <div class="card-title-row">
                        <span class="title-dot"></span>
                        <h3>${escapeHTML(item.title || 'Sin título')}</h3>
                    </div>

                    <div class="card-body-content">
                        ${escapeHTML(item.content || '')}
                    </div>

                    <div class="card-bottom-row">
                        <span class="category-badge">${escapeHTML(item.category || 'General')}</span>
                    </div>
                `;

                card.querySelector('.btn-fav')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await fetchAPI(`/notes/${item.id}/favorite?is_favorite=${!isFav}`, 'PUT');
                    loadCurrentView();
                });

                card.querySelector('.btn-delete')?.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await fetchAPI(`/notes/${item.id}/trash?is_trash=true`, 'PUT');
                    loadCurrentView();
                });
            }

            notesGrid.appendChild(card);
        });
    }

    // Renderizar categorías
    async function renderCategories() {
        notesGrid.innerHTML = '<p class="empty-msg">Cargando categorías...</p>';
        const defaultCategories = [
            { name: 'Projects', color: 'var(--pastel-yellow)', icon: '📁' },
            { name: 'Business', color: 'var(--pastel-pink)', icon: '💼' },
            { name: 'Personal', color: 'var(--pastel-blue)', icon: '⭐' },
            { name: 'General', color: 'var(--pastel-mint)', icon: '📝' }
        ];

        const dbCategories = await fetchAPI('/categories');
        const categoriesData = (Array.isArray(dbCategories) && dbCategories.length > 0)
            ? dbCategories.map(c => ({
                name: c.name,
                color: c.color || 'var(--pastel-lavender)',
                icon: c.icon || '📁'
            }))
            : defaultCategories;

        notesGrid.innerHTML = '';
        categoriesData.forEach(cat => {
            const card = document.createElement('article');
            card.className = 'category-card';
            card.style.backgroundColor = cat.color;
            card.innerHTML = `<span class="category-icon">${cat.icon}</span><h3>${escapeHTML(cat.name)}</h3>`;
            card.addEventListener('click', () => {
                window.location.href = `./index.html?category=${encodeURIComponent(cat.name)}`;
            });
            notesGrid.appendChild(card);
        });
    }

    // Escapar texto HTML
    function escapeHTML(str) {
        return String(str || '').replace(/[&<>"']/g, match => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match]));
    }

    // =========================================================
    // EVENTOS DE BÚSQUEDA EN TIEMPO REAL (Imagen 1)
    // =========================================================
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value;
            if (searchClearBtn) {
                searchClearBtn.style.display = currentSearchQuery.length > 0 ? 'inline-block' : 'none';
            }
            applyFiltersAndRender();
        });
    }

    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                currentSearchQuery = '';
                searchClearBtn.style.display = 'none';
                applyFiltersAndRender();
                searchInput.focus();
            }
        });
    }

    // =========================================================
    // EVENTOS DE FILTRADO POR PESTAÑAS (All, Projects, Business, etc.)
    // =========================================================
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentCategoryFilter = tab.getAttribute('data-category') || 'All';
            applyFiltersAndRender();
        });
    });

    // Eventos al hacer clic en etiquetas del sidebar
    categoryTagItems.forEach(tagItem => {
        tagItem.addEventListener('click', () => {
            const cat = tagItem.getAttribute('data-category');
            if (cat) {
                currentCategoryFilter = cat;
                filterTabs.forEach(tab => {
                    if (tab.getAttribute('data-category').toLowerCase() === cat.toLowerCase()) {
                        tab.classList.add('active');
                    } else {
                        tab.classList.remove('active');
                    }
                });
                applyFiltersAndRender();
            }
        });
    });

    // =========================================================
    // SELECCIÓN DE COLOR PASTEL EN EL MODAL (Paleta Imagen 2)
    // =========================================================
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            colorSwatches.forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            if (inputColor) {
                inputColor.value = swatch.getAttribute('data-color') || 'card-lavender';
            }
        });
    });

    // =========================================================
    // MODAL DE CREACIÓN DE NOTA
    // =========================================================
    function openModal() {
        if (modal) {
            modal.classList.add('active');
            if (inputTitle) inputTitle.focus();
        }
    }

    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            if (inputTitle) inputTitle.value = '';
            if (inputContent) inputContent.value = '';
        }
    }

    if (btnAddNote) btnAddNote.addEventListener('click', openModal);
    if (btnSidebarAddNew) btnSidebarAddNew.addEventListener('click', openModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    if (modalCloseIcon) modalCloseIcon.addEventListener('click', closeModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // Guardar Nota en Turso DB
    if (btnSaveNote) {
        btnSaveNote.addEventListener('click', async () => {
            const title = inputTitle ? inputTitle.value.trim() : '';
            const content = inputContent ? inputContent.value.trim() : '';
            const color = inputColor ? inputColor.value : 'card-lavender';
            const category = selectCategory ? selectCategory.value : 'General';

            if (!title || !content) {
                alert('Por favor escribe un título y el contenido de la nota.');
                return;
            }

            const payload = { title, content, color, category };
            btnSaveNote.disabled = true;
            btnSaveNote.textContent = 'Guardando...';

            const res = await fetchAPI('/notes', 'POST', payload);

            btnSaveNote.disabled = false;
            btnSaveNote.textContent = 'Guardar Nota';

            if (res) {
                closeModal();
                loadCurrentView();
            } else {
                alert('Ocurrió un error al guardar la nota en la base de datos.');
            }
        });
    }

    // Carga inicial
    loadCurrentView();
});