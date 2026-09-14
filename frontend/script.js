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

    let notes = [];
    let currentFilter = 'all';

    // Configuración de credenciales de Turso
    const TURSO_URL = "https://notebook-jocelinsalvador.aws-us-west-2.turso.io/v2/pipeline";
    const TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODkxODM0OTcsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.QYp6S4BmRrAfaI-s0Ome95SnZf4j7txUx4GwROH0MZDa56An8_-_OV6rqtXNKA9ZJcz8k0gpGi_xJAfynUIcBw";

    // Función helper para enviar SQL a Turso
    async function queryTurso(sql, args = []) {
        const response = await fetch(TURSO_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        type: "execute",
                        stmt: { sql, args }
                    },
                    { type: "close" }
                ]
            })
        });
        return await response.json();
    }

    // 1. Obtener notas desde Turso
    async function fetchNotes() {
        try {
            const data = await queryTurso("SELECT id, title, content, color, is_fav, in_trash FROM Notas ORDER BY id DESC");
            const rows = data.results[0].response.result.rows;

            notes = rows.map(row => ({
                id: row[0].value,
                title: row[1].value,
                content: row[2].value,
                color: row[3].value || 'card-peach',
                is_fav: Number(row[4].value),
                in_trash: Number(row[5].value)
            }));

            renderNotes();
        } catch (error) {
            console.error('Error al cargar notas:', error);
        }
    }

    // 2. Renderizar tarjetas
    function renderNotes() {
        notesGrid.innerHTML = '';

        let filteredNotes = notes.filter(note => {
            if (currentFilter === 'trash') return note.in_trash === 1;
            if (currentFilter === 'favs') return note.is_fav === 1 && note.in_trash === 0;
            return note.in_trash === 0;
        });

        if (filteredNotes.length === 0) {
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600;">No hay notas en esta sección.</p>`;
            return;
        }

        filteredNotes.forEach(note => {
            const card = document.createElement('article');
            card.className = `note-card ${note.color}`;

            card.innerHTML = `
        <div class="card-header-icons">
          <button class="btn-fav" title="Favorito">${note.is_fav ? '⭐' : '📌'}</button>
          <button class="btn-delete" title="Papelera">${note.in_trash ? '🔄' : '🗑️'}</button>
        </div>
        <div class="card-body">
          <h3>${note.title}</h3>
          <p>${note.content}</p>
        </div>
        <div class="card-footer">
          <span>📅 Reciente</span>
        </div>
      `;

            // Evento Favorito
            card.querySelector('.btn-fav').addEventListener('click', async () => {
                const newStatus = note.is_fav === 1 ? 0 : 1;
                await queryTurso("UPDATE Notas SET is_fav = ? WHERE id = ?", [
                    { type: "integer", value: newStatus.toString() },
                    { type: "integer", value: note.id.toString() }
                ]);
                note.is_fav = newStatus;
                renderNotes();
            });

            // Evento Papelera
            card.querySelector('.btn-delete').addEventListener('click', async () => {
                const newStatus = note.in_trash === 1 ? 0 : 1;
                await queryTurso("UPDATE Notas SET in_trash = ? WHERE id = ?", [
                    { type: "integer", value: newStatus.toString() },
                    { type: "integer", value: note.id.toString() }
                ]);
                note.in_trash = newStatus;
                renderNotes();
            });

            notesGrid.appendChild(card);
        });
    }

    // 3. Guardar nueva nota
    btnSaveNote.addEventListener('click', async () => {
        const title = inputTitle.value.trim();
        const content = inputContent.value.trim();
        const color = selectColor.value;

        if (!title || !content) {
            alert('Por favor completa el título y el contenido.');
            return;
        }

        try {
            await queryTurso(
                "INSERT INTO Notas (title, content, color, is_fav, in_trash) VALUES (?, ?, ?, 0, 0)",
                [
                    { type: "text", value: title },
                    { type: "text", value: content },
                    { type: "text", value: color }
                ]
            );

            modal.classList.remove('active');
            fetchNotes(); // Recargar notas desde la base de datos
        } catch (error) {
            console.error('Error al guardar:', error);
            alert('No se pudo guardar la nota.');
        }
    });

    // Eventos de interfaz
    btnNewNote.addEventListener('click', () => {
        inputTitle.value = '';
        inputContent.value = '';
        modal.classList.add('active');
    });

    btnCancel.addEventListener('click', () => modal.classList.remove('active'));

    btnFavs.addEventListener('click', () => {
        currentFilter = 'favs';
        sectionTitle.textContent = 'Notas Favoritas ⭐';
        renderNotes();
    });

    btnTrash.addEventListener('click', () => {
        currentFilter = 'trash';
        sectionTitle.textContent = 'Papelera 🗑️';
        renderNotes();
    });

    btnCategories.addEventListener('click', () => {
        currentFilter = 'all';
        sectionTitle.textContent = 'Tareas recientes';
        renderNotes();
    });

    fetchNotes();
});