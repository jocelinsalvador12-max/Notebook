document.addEventListener('DOMContentLoaded', () => {
    // Apunta al servidor Node.js en el puerto 5080 (o proxy)
    const API_URL = 'http://localhost:5080/api';
    const savedUsername = localStorage.getItem('notebookUsername')?.trim();
    document.querySelectorAll('.user-greeting').forEach(greeting => {
        greeting.textContent = `¡Hola, ${savedUsername || 'Peter'}!`;
    });
    const permanentFolderNames = new Set([
        'proyectos', 'projects',
        'negocios', 'business', 'trabajo',
        'personal', 'casa',
        'general'
    ]);
    const permanentFolderDefaults = [
        { name: 'Proyectos', color: '#FCF5BF', icon: '📁', aliases: ['proyectos', 'projects'] },
        { name: 'Negocios', color: '#FF99C8', icon: '💼', aliases: ['negocios', 'business', 'trabajo'] },
        { name: 'Personal', color: '#A8DEFA', icon: '⭐', aliases: ['personal', 'casa'] },
        { name: 'General', color: '#D0F4E0', icon: '📝', aliases: ['general'] }
    ];
    const folderOrder = [
        ['proyectos', 'projects'],
        ['negocios', 'business', 'trabajo'],
        ['personal', 'casa'],
        ['general']
    ];
    const isPermanentFolder = name => permanentFolderNames.has(String(name || '').trim().toLowerCase());
    const sortFolders = folders => [...folders].sort((a, b) => {
        const aName = String(a.name || '').trim().toLowerCase();
        const bName = String(b.name || '').trim().toLowerCase();
        const aIndex = folderOrder.findIndex(group => group.includes(aName));
        const bIndex = folderOrder.findIndex(group => group.includes(bName));
        return (aIndex < 0 ? folderOrder.length : aIndex) - (bIndex < 0 ? folderOrder.length : bIndex);
    });
    const withPermanentFolders = folders => {
        const available = Array.isArray(folders) ? [...folders] : [];
        const existingNames = new Set(available.map(folder => String(folder.name || '').trim().toLowerCase()));
        permanentFolderDefaults.forEach(folder => {
            if (!folder.aliases.some(alias => existingNames.has(alias))) {
                available.push({ ...folder, id: null });
            }
        });
        const displayFolders = available.map(folder => {
            const normalizedName = String(folder.name || '').trim().toLowerCase();
            const permanentFolder = permanentFolderDefaults.find(item => item.aliases.includes(normalizedName));
            return permanentFolder
                ? { ...permanentFolder, ...folder, name: permanentFolder.name }
                : folder;
        });
        return sortFolders(displayFolders);
    };

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
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        let d = dateVal ? new Date(dateVal) : new Date();
        if (isNaN(d.getTime())) {
            d = new Date();
        }
        return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()}`;
    }

    // Formateador de fecha y hora para asignación y entrega de tareas
    function formatDateTime(val) {
        if (!val) return '';
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${day} ${month} ${year}, ${hours}:${minutes}`;
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
    const inputAssigned = document.getElementById('note-assigned');
    const inputDue = document.getElementById('note-due');
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

    async function renderSidebarFolders() {
        const sidebarFolders = document.getElementById('sidebar-user-folders');
        if (!sidebarFolders) return;

        const categories = await fetchAPI('/categories');
        const folders = withPermanentFolders((Array.isArray(categories) ? categories : [])
            .filter(folder => folder && folder.name));

        sidebarFolders.innerHTML = '';
        folders.forEach(folder => {
            const link = document.createElement('a');
            link.className = 'category-tag-item custom-folder-drop';
            link.href = './app.html?category=' + encodeURIComponent(folder.name);
            link.dataset.category = folder.name;
            link.title = 'Suelta una nota aquí para moverla a esta carpeta';
            link.innerHTML = '<span class="category-dot" style="background-color:' + escapeHTML(folder.color || '#A855F7') + '"></span><span>' + escapeHTML(folder.name) + '</span>';
            link.addEventListener('click', event => {
                const isNotesPage = window.location.pathname.includes('app.html')
                    || window.location.pathname === '/'
                    || window.location.pathname.endsWith('/');
                if (!isNotesPage) return;
                event.preventDefault();
                currentCategoryFilter = folder.name;
                filterTabs.forEach(tab => tab.classList.remove('active'));
                applyFiltersAndRender();
            });
            link.addEventListener('dragover', event => {
                event.preventDefault();
                link.classList.add('drop-target');
            });
            link.addEventListener('dragleave', () => link.classList.remove('drop-target'));
            link.addEventListener('drop', async event => {
                event.preventDefault();
                link.classList.remove('drop-target');
                const noteId = event.dataTransfer.getData('text/plain');
                if (!noteId) return;
                const moved = await fetchAPI('/notes/' + encodeURIComponent(noteId) + '/category', 'PUT', { category: folder.name });
                if (moved) {
                    if (filterFeedback) {
                        filterFeedback.textContent = 'Nota movida a ' + folder.name + '.';
                        filterFeedback.style.display = 'inline-block';
                    }
                    await loadCurrentView();
                }
            });
            sidebarFolders.appendChild(link);
        });
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

        // 1. Filtro por categoría con soporte para sinónimos/alias y materias personalizadas
        if (currentCategoryFilter && currentCategoryFilter !== 'All') {
            const filterCat = currentCategoryFilter.toLowerCase().trim();
            filtered = filtered.filter(item => {
                const itemCat = (item.category || 'General').toLowerCase().trim();
                if (itemCat === filterCat) return true;
                // Soporte para notas existentes en español / inglés
                if ((filterCat === 'business' || filterCat === 'negocios') && (itemCat === 'trabajo' || itemCat === 'business' || itemCat === 'negocios')) return true;
                if ((filterCat === 'projects' || filterCat === 'proyectos') && (itemCat === 'projects' || itemCat === 'proyectos')) return true;
                if (filterCat === 'personal' && (itemCat === 'personal' || itemCat === 'casa')) return true;
                if (filterCat === 'general' && itemCat === 'general') return true;
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

            if (!isTrash && currentView === 'notes') {
                card.draggable = true;
                card.title = 'Arrastra esta nota a una carpeta de la barra lateral';
                card.addEventListener('dragstart', event => {
                    event.dataTransfer.setData('text/plain', String(item.id));
                    event.dataTransfer.effectAllowed = 'move';
                    card.classList.add('is-dragging');
                });
                card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
            }

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

                    ${(item.assigned_at || item.due_at) ? `
                        <div class="card-dates-info">
                            ${item.assigned_at ? `<span class="card-date-item">📌 <strong>Asignada:</strong> ${formatDateTime(item.assigned_at)}</span>` : ''}
                            ${item.due_at ? (() => {
                                const isOverdue = new Date(item.due_at).getTime() < Date.now();
                                return `<span class="card-date-item due-date ${isOverdue ? 'urgent' : ''}">⏰ <strong>Entrega:</strong> ${formatDateTime(item.due_at)}${isOverdue ? ' ⚠️' : ''}</span>`;
                            })() : ''}
                        </div>
                    ` : ''}

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

    // Renderizar carpetas / materias
    async function renderCategories() {
        if (!notesGrid) return;
        notesGrid.innerHTML = '<p class="empty-msg">Cargando carpetas de Turso DB...</p>';

        const [dbCategories, allNotes] = await Promise.all([
            fetchAPI('/categories'),
            fetchAPI('/notes')
        ]);

        const notesList = Array.isArray(allNotes) ? allNotes : [];
        const categoriesData = withPermanentFolders((Array.isArray(dbCategories) ? dbCategories : [])
            .filter(c => c && c.name)
            .map(c => ({
                id: isPermanentFolder(c.name) ? null : c.id,
                name: c.name,
                color: c.color || '#FCF5BF',
                icon: c.icon || '📁'
            })));

        notesGrid.innerHTML = '';
        if (categoriesData.length === 0) {
            notesGrid.innerHTML = '<p class="empty-msg">Aún no tienes carpetas. Crea una para empezar a organizar tus notas.</p>';
        }
        categoriesData.forEach(cat => {
            const catNameLower = cat.name.toLowerCase().trim();
            const count = notesList.filter(n => {
                const noteCat = (n.category || 'General').toLowerCase().trim();
                if (noteCat === catNameLower) return true;
                if ((catNameLower === 'proyectos' || catNameLower === 'projects') && (noteCat === 'projects' || noteCat === 'proyectos')) return true;
                if ((catNameLower === 'negocios' || catNameLower === 'business') && (noteCat === 'business' || noteCat === 'negocios' || noteCat === 'trabajo')) return true;
                if (catNameLower === 'personal' && (noteCat === 'personal' || noteCat === 'casa')) return true;
                if (catNameLower === 'general' && noteCat === 'general') return true;
                return false;
            }).length;

            const card = document.createElement('article');
            card.className = 'category-card';
            card.style.backgroundColor = cat.color;
            card.innerHTML = `
                <div class="category-card-top">
                    <span class="category-icon">${cat.icon}</span>
                    ${cat.id ? `<button class="btn-delete-folder" title="Eliminar carpeta" data-id="${cat.id}">&times;</button>` : ''}
                </div>
                <h3 class="category-title">${escapeHTML(cat.name)}</h3>
                <span class="category-count">${count} ${count === 1 ? 'nota guardada' : 'notas guardadas'}</span>
                <span class="category-open-hint">Abrir y crear notas →</span>
            `;

            if (cat.id) {
                const cardTop = card.querySelector('.category-card-top');
                const actions = document.createElement('div');
                actions.className = 'category-card-actions';
                const deleteButton = cardTop.querySelector('.btn-delete-folder');
                if (deleteButton) actions.appendChild(deleteButton);
                const editButton = document.createElement('button');
                editButton.className = 'btn-edit-folder';
                editButton.type = 'button';
                editButton.title = 'Editar nombre de carpeta';
                editButton.setAttribute('aria-label', 'Editar carpeta ' + cat.name);
                editButton.textContent = '✎';
                actions.appendChild(editButton);
                cardTop.appendChild(actions);
            }

            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-folder, .btn-edit-folder')) return;
                window.location.href = `./app.html?category=${encodeURIComponent(cat.name)}`;
            });

            const btnEdit = card.querySelector('.btn-edit-folder');
            if (btnEdit) {
                btnEdit.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const name = prompt('Nuevo nombre para la carpeta:', cat.name);
                    if (!name || !name.trim() || name.trim() === cat.name) return;
                    const updated = await fetchAPI('/categories/' + cat.id, 'PUT', { name: name.trim() });
                    if (updated) {
                        await renderCategories();
                        renderSidebarFolders();
                    } else {
                        alert('No se pudo actualizar la carpeta. Verifica que el nombre no esté en uso.');
                    }
                });
            }

            const btnDel = card.querySelector('.btn-delete-folder');
            if (btnDel) {
                btnDel.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm('¿Eliminar la carpeta "' + cat.name + '"?')) {
                        if (cat.id) {
                            await fetchAPI('/categories/' + cat.id, 'DELETE');
                        }
                        await renderCategories();
                        renderSidebarFolders();
                    }
                });
            }

            notesGrid.appendChild(card);
        });

        setupFolderModal();
        renderSidebarFolders();
    }

    // Modal para crear nueva carpeta / materia
    function setupFolderModal() {
        const btnAddFolder = document.getElementById('btn-add-folder');
        const folderModal = document.getElementById('folder-modal');
        const folderModalClose = document.getElementById('folder-modal-close');
        const folderModalCancel = document.getElementById('folder-modal-cancel');
        const folderModalSave = document.getElementById('folder-modal-save');
        const folderNameInput = document.getElementById('folder-name-input');
        const folderColorVal = document.getElementById('folder-color-val');
        const folderColorSwatches = document.querySelectorAll('#folder-color-swatches .swatch-btn');

        if (!btnAddFolder || !folderModal) return;

        function openFModal() {
            folderModal.classList.add('active');
            if (folderNameInput) {
                folderNameInput.value = '';
                folderNameInput.focus();
            }
        }
        function closeFModal() {
            folderModal.classList.remove('active');
        }

        btnAddFolder.onclick = openFModal;
        if (folderModalClose) folderModalClose.onclick = closeFModal;
        if (folderModalCancel) folderModalCancel.onclick = closeFModal;

        folderColorSwatches.forEach(btn => {
            btn.onclick = () => {
                folderColorSwatches.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if (folderColorVal) folderColorVal.value = btn.getAttribute('data-color') || '#FCF5BF';
            };
        });

        if (folderModalSave) {
            folderModalSave.onclick = async () => {
                const name = folderNameInput ? folderNameInput.value.trim() : '';
                if (!name) {
                    alert('Por favor ingresa un nombre para la materia o carpeta.');
                    return;
                }
                const color = folderColorVal ? folderColorVal.value : '#FCF5BF';
                folderModalSave.disabled = true;
                folderModalSave.textContent = 'Creando...';
                const res = await fetchAPI('/categories', 'POST', { name, color, icon: '📁' });
                folderModalSave.disabled = false;
                folderModalSave.textContent = 'Crear Carpeta';
                if (res) {
                    closeFModal();
                    renderCategories();
                } else {
                    alert('Error al crear la carpeta.');
                }
            };
        }
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
        tagItem.addEventListener('click', (event) => {
            const cat = tagItem.getAttribute('data-category');
            if (cat) {
                // Si no estamos en la página de notas, redirigir a app.html con la categoría
                const isNotesPage = window.location.pathname.includes('app.html') || 
                                    window.location.pathname === '/' || 
                                    window.location.pathname.endsWith('/');
                if (!isNotesPage) {
                    window.location.href = `./app.html?category=${encodeURIComponent(cat)}`;
                    return;
                }

                event.preventDefault();
                currentCategoryFilter = cat;
                filterTabs.forEach(tab => {
                    const tabCat = (tab.getAttribute('data-category') || '').toLowerCase();
                    const targetCat = cat.toLowerCase();
                    if (tabCat === targetCat || 
                        (targetCat === 'projects' && tabCat === 'projects') || 
                        (targetCat === 'business' && tabCat === 'business')) {
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
    async function openModal() {
        if (modal) {
            modal.classList.add('active');
            if (inputTitle) inputTitle.focus();

            // Cargar dinámicamente las carpetas/materias disponibles en el select
            if (selectCategory) {
                try {
                    const cats = await fetchAPI('/categories');
                    if (Array.isArray(cats)) {
                        const currentVal = selectCategory.value;
                        selectCategory.innerHTML = '';
                        const categoryOptions = [
                            { name: 'Projects', label: 'Proyectos' },
                            { name: 'Business', label: 'Negocios' },
                            { name: 'Personal', label: 'Personal' },
                            { name: 'General', label: 'General' },
                            ...cats.filter(c => c && c.name && !permanentFolderNames.has(c.name.trim().toLowerCase()))
                                .filter(c => !['business', 'negocios', 'trabajo', 'personal', 'casa', 'general']
                                    .includes(c.name.trim().toLowerCase()))
                                .map(c => ({ name: c.name, label: c.name }))
                        ];
                        categoryOptions.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.name;
                            opt.textContent = c.label;
                            selectCategory.appendChild(opt);
                        });

                        // Pre-seleccionar la carpeta actual si estamos filtrando
                        if (currentCategoryFilter && currentCategoryFilter !== 'All') {
                            for (let opt of selectCategory.options) {
                                if (opt.value.toLowerCase() === currentCategoryFilter.toLowerCase()) {
                                    selectCategory.value = opt.value;
                                    break;
                                }
                            }
                        } else if (currentVal) {
                            selectCategory.value = currentVal;
                        }
                    }
                } catch (e) {
                    console.error('Error cargando categorías para el modal:', e);
                }
            }
        }
    }

    function closeModal() {
        if (modal) {
            modal.classList.remove('active');
            if (inputTitle) inputTitle.value = '';
            if (inputContent) inputContent.value = '';
            if (inputAssigned) inputAssigned.value = '';
            if (inputDue) inputDue.value = '';
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
            const assigned_at = inputAssigned && inputAssigned.value ? inputAssigned.value : null;
            const due_at = inputDue && inputDue.value ? inputDue.value : null;

            if (!title || !content) {
                alert('Por favor escribe un título y el contenido de la nota.');
                return;
            }

            const payload = { title, content, color, category, assigned_at, due_at };
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
    renderSidebarFolders();
    loadCurrentView();
});
