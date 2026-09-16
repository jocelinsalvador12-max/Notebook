document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.querySelector('.app-container');
    const notesGrid = document.querySelector('.notes-grid');
    const btnNewNote = document.querySelector('.card-new');
    const btnFavs = document.querySelector('.card-favs');
    const btnCategories = document.querySelector('.card-categories');
    const btnTrash = document.querySelector('.trash-btn');
    const sectionTitle = document.querySelector('.section-title');

    const modal = document.getElementById('editor-modal');
    const btnSaveNote = document.getElementById('btn-save-note');
    const btnCancel = document.getElementById('btn-cancel');
    const inputTitle = document.getElementById('note-title');
    const inputContent = document.getElementById('note-content');
    const selectColor = document.getElementById('note-color');
    const selectCategory = document.getElementById('note-category');

    let currentTable = 'Notas';
    let categoryFilter = null;

    const TURSO_URL = "https://notebook-jocelinsalvador.aws-us-west-2.turso.io/v2/pipeline";
    const TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODkxODM0OTcsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.QYp6S4BmRrAfaI-s0Ome95SnZf4j7txUx4GwROH0MZDa56An8_-_OV6rqtXNKA9ZJcz8k0gpGi_xJAfynUIcBw";

    async function queryTurso(sql, args = []) {
        try {
            const response = await fetch(TURSO_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests: [
                        { type: "execute", stmt: { sql, args } },
                        { type: "close" }
                    ]
                })
            });
            const data = await response.json();

            const result = data?.results?.[0];
            if (result?.type === 'error') {
                console.error(`Error SQL en "${sql}":`, result.error);
                alert(`Error de base de datos: ${result.error.message}`);
            }

            return data;
        } catch (err) {
            console.error('Error al conectar con Turso:', err);
            alert('No se pudo conectar con la base de datos.');
            return null;
        }
    }

    function buildNotesQuery() {
        let sql = currentTable === 'Notas'
            ? `SELECT id, title, content, color, category FROM ${currentTable}`
            : `SELECT id, title, content, color FROM ${currentTable}`;
        const args = [];
        if (currentTable === 'Notas' && categoryFilter) {
            sql += ` WHERE category = ?`;
            args.push({ type: "text", value: categoryFilter });
        }
        sql += ` ORDER BY id DESC`;
        return { sql, args };
    }

    function setupFullScreenHeader() {
        // Elimina encabezados previos si existían
        const oldHeader = document.querySelector('.fullscreen-header');
        if (oldHeader) oldHeader.remove();

        if (currentTable === 'Favoritos' || currentTable === 'Papelera' || currentTable === 'Categorías' || categoryFilter) {
            appContainer.classList.add('full-screen-mode');

            // Define el título dinámico según la vista activa
            let titleText = currentTable;
            if (categoryFilter) titleText = `Categoría: ${categoryFilter}`;

            // Crea el contenedor del encabezado
            const header = document.createElement('header');
            header.className = 'fullscreen-header';
            header.innerHTML = `
                <h2>${titleText}</h2>
                <button class="btn-back">← Volver</button>
            `;

            // Evento para regresar al inicio (Notas)
            header.querySelector('.btn-back').addEventListener('click', () => {
                currentTable = 'Notas';
                categoryFilter = null;
                appContainer.classList.remove('full-screen-mode');
                loadCurrentView();
            });

            const mainContent = document.querySelector('.main-content');
            mainContent.insertBefore(header, mainContent.firstChild);
        } else {
            appContainer.classList.remove('full-screen-mode');
            if (sectionTitle) sectionTitle.textContent = 'Tareas recientes';
        }
    }

    async function loadCurrentView() {
        notesGrid.className = 'notes-grid';
        notesGrid.innerHTML = '<p style="color: white;">Cargando...</p>';

        setupFullScreenHeader();

        const { sql, args } = buildNotesQuery();
        const data = await queryTurso(sql, args);
        const rows = data?.results?.[0]?.response?.result?.rows || [];

        const items = rows.map(row => ({
            id: row[0]?.value,
            title: row[1]?.value || 'Sin título',
            content: row[2]?.value || '',
            color: row[3]?.value || 'card-peach',
            category: row[4]?.value || 'General'
        }));

        renderNotes(items);
    }

    const FAVORITOS_PALETTE = [
        { bg: '#F08C21', text: '#ffffff' },
        { bg: '#F2D88F', text: '#5c4a1a' },
        { bg: '#E36888', text: '#ffffff' },
        { bg: '#6698CC', text: '#ffffff' },
        { bg: '#B4B534', text: '#ffffff' }
    ];

    function renderFavoritosList(items) {
        notesGrid.className = 'notes-grid list-mode';
        notesGrid.innerHTML = '';

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

            row.querySelector('.btn-unfav').addEventListener('click', async () => {
                await queryTurso("DELETE FROM Favoritos WHERE id = ?", [
                    { type: "integer", value: item.id.toString() }
                ]);
                loadCurrentView();
            });

            notesGrid.appendChild(row);
        });
    }

    function renderNotes(items) {
        notesGrid.className = 'notes-grid';
        notesGrid.innerHTML = '';

        if (currentTable === 'Favoritos') {
            renderFavoritosList(items);
            return;
        }

        if (items.length === 0) {
            const mensaje = currentTable === 'Notas' && categoryFilter
                ? `No hay notas en la categoría "${categoryFilter}".`
                : `No hay notas en ${currentTable}.`;
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600;">${mensaje}</p>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            card.className = `note-card ${item.color}`;

            let iconsHTML;
            if (currentTable === 'Papelera') {
                iconsHTML = `<button class="btn-restore" title="Restaurar nota">🔄</button>
                             <button class="btn-delete-forever" title="Eliminar definitivamente">❌</button>`;
            } else {
                iconsHTML = `<button class="btn-fav" title="Favorito">⭐</button>
                             <button class="btn-delete" title="Mover a Papelera">🗑️</button>`;
            }

            card.innerHTML = `
                <div class="card-header-icons">${iconsHTML}</div>
                <div class="card-body">
                  <h3>${item.title}</h3>
                  <p>${item.content}</p>
                </div>
                <div class="card-footer">
                  <span>📁 ${item.category}</span>
                </div>
            `;

            if (currentTable === 'Papelera') {
                card.querySelector('.btn-restore').addEventListener('click', async () => {
                    await queryTurso("INSERT INTO Notas (title, content, color, category) VALUES (?, ?, ?, ?)", [
                        { type: "text", value: item.title },
                        { type: "text", value: item.content },
                        { type: "text", value: item.color },
                        { type: "text", value: item.category }
                    ]);
                    await queryTurso("DELETE FROM Papelera WHERE id = ?", [
                        { type: "integer", value: item.id.toString() }
                    ]);
                    loadCurrentView();
                });

                card.querySelector('.btn-delete-forever').addEventListener('click', async () => {
                    const confirmar = confirm(`¿Eliminar "${item.title}" para siempre? Esta acción no se puede deshacer.`);
                    if (!confirmar) return;
                    await queryTurso("DELETE FROM Papelera WHERE id = ?", [
                        { type: "integer", value: item.id.toString() }
                    ]);
                    loadCurrentView();
                });

            } else {
                card.querySelector('.btn-fav').addEventListener('click', async () => {
                    const result = await queryTurso("INSERT INTO Favoritos (title, content, color) VALUES (?, ?, ?)", [
                        { type: "text", value: item.title },
                        { type: "text", value: item.content },
                        { type: "text", value: item.color }
                    ]);
                    if (result?.results?.[0]?.type !== 'error') {
                        alert('Agregado a Favoritos ⭐');
                    }
                });

                card.querySelector('.btn-delete').addEventListener('click', async () => {
                    await queryTurso("INSERT INTO Papelera (title, content, color) VALUES (?, ?, ?)", [
                        { type: "text", value: item.title },
                        { type: "text", value: item.content },
                        { type: "text", value: item.color }
                    ]);
                    await queryTurso(`DELETE FROM ${currentTable} WHERE id = ?`, [
                        { type: "integer", value: item.id.toString() }
                    ]);
                    loadCurrentView();
                });
            }

            notesGrid.appendChild(card);
        });
    }

    function mostrarCategorias() {
        currentTable = 'Categorías';
        categoryFilter = null;

        setupFullScreenHeader();

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
                currentTable = 'Notas';
                categoryFilter = cat.name;
                loadCurrentView();
            });

            notesGrid.appendChild(card);
        });
    }

    btnSaveNote.addEventListener('click', async () => {
        const title = inputTitle.value.trim();
        const content = inputContent.value.trim();
        const color = selectColor.value;
        const category = selectCategory ? selectCategory.value : 'General';

        if (!title || !content) {
            alert('Por favor completa el título y el contenido.');
            return;
        }

        await queryTurso(
            "INSERT INTO Notas (title, content, color, category) VALUES (?, ?, ?, ?)",
            [
                { type: "text", value: title },
                { type: "text", value: content },
                { type: "text", value: color },
                { type: "text", value: category }
            ]
        );

        modal.classList.remove('active');
        appContainer.classList.remove('full-screen-mode');
        currentTable = 'Notas';
        categoryFilter = null;
        loadCurrentView();
    });

    btnNewNote.addEventListener('click', () => {
        inputTitle.value = '';
        inputContent.value = '';
        modal.classList.add('active');
    });

    btnCancel.addEventListener('click', () => modal.classList.remove('active'));

    btnFavs.addEventListener('click', () => {
        currentTable = 'Favoritos';
        categoryFilter = null;
        loadCurrentView();
    });

    btnTrash.addEventListener('click', () => {
        currentTable = 'Papelera';
        categoryFilter = null;
        loadCurrentView();
    });

    btnCategories.addEventListener('click', mostrarCategorias);

    loadCurrentView();
});