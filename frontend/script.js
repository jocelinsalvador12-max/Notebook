document.addEventListener('DOMContentLoaded', () => {
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
            return await response.json();
        } catch (err) {
            console.error('Error al conectar con Turso:', err);
            return null;
        }
    }

    async function loadCurrentView() {
        notesGrid.innerHTML = '<p style="color: white;">Cargando...</p>';
        const data = await queryTurso(`SELECT id, title, content, color, category FROM ${currentTable} ORDER BY id DESC`);

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

    function renderNotes(items) {
        notesGrid.innerHTML = '';

        if (items.length === 0) {
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600;">No hay notas en ${currentTable}.</p>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            card.className = `note-card ${item.color}`;

            let iconsHTML = currentTable === 'Papelera'
                ? `<button class="btn-restore" title="Restaurar nota">🔄</button>`
                : `<button class="btn-fav" title="Favorito">⭐</button>
           <button class="btn-delete" title="Mover a Papelera">🗑️</button>`;

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
            } else {
                card.querySelector('.btn-fav').addEventListener('click', async () => {
                    await queryTurso("INSERT INTO Favoritos (title, content, color, category) VALUES (?, ?, ?, ?)", [
                        { type: "text", value: item.title },
                        { type: "text", value: item.content },
                        { type: "text", value: item.color },
                        { type: "text", value: item.category }
                    ]);
                    alert('Copiado a Favoritos');
                });

                card.querySelector('.btn-delete').addEventListener('click', async () => {
                    await queryTurso("INSERT INTO Papelera (title, content, color, category) VALUES (?, ?, ?, ?)", [
                        { type: "text", value: item.title },
                        { type: "text", value: item.content },
                        { type: "text", value: item.color },
                        { type: "text", value: item.category }
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
        currentTable = 'Notas';
        sectionTitle.textContent = 'Tareas recientes';
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
        sectionTitle.textContent = 'Notas Favoritas ⭐';
        loadCurrentView();
    });

    btnTrash.addEventListener('click', () => {
        currentTable = 'Papelera';
        sectionTitle.textContent = 'Papelera 🗑️';
        loadCurrentView();
    });

    btnCategories.addEventListener('click', () => {
        currentTable = 'Notas';
        sectionTitle.textContent = 'Todas las Categorías 📁';
        loadCurrentView();
    });

    loadCurrentView();
});