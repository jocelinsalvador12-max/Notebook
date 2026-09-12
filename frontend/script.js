document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos del DOM
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

    // Estado de la aplicación y almacenamiento LocalStorage
    let notes = JSON.parse(localStorage.getItem('my_notes_app')) || [
        {
            id: 1,
            title: 'tema 2',
            content: 'Actualizar la interfaz gráfica y verificar la persistencia de datos.',
            color: 'card-peach',
            date: 'Hace un momento',
            isFav: false,
            inTrash: false
        }
    ];

    let currentFilter = 'all'; // 'all', 'favs', 'trash'

    // Guardar datos en LocalStorage
    function saveToLocalStorage() {
        localStorage.setItem('my_notes_app', JSON.stringify(notes));
    }

    // Renderizar tarjetas en pantalla
    function renderNotes() {
        notesGrid.innerHTML = '';

        let filteredNotes = notes.filter(note => {
            if (currentFilter === 'trash') return note.inTrash;
            if (currentFilter === 'favs') return note.isFav && !note.inTrash;
            return !note.inTrash;
        });

        if (filteredNotes.length === 0) {
            notesGrid.innerHTML = `<p style="color: white; font-weight: 600;">No hay notas para mostrar en esta sección.</p>`;
            return;
        }

        filteredNotes.forEach(note => {
            const card = document.createElement('article');
            card.className = `note-card ${note.color}`;

            card.innerHTML = `
        <div class="card-header-icons">
          <button class="btn-fav" title="Favorito">${note.isFav ? '⭐' : '📌'}</button>
          <button class="btn-delete" title="Papelera">${note.inTrash ? '🔄' : '🗑️'}</button>
        </div>
        <div class="card-body">
          <h3>${note.title}</h3>
          <p>${note.content}</p>
        </div>
        <div class="card-footer">
          <span>📅 ${note.date}</span>
        </div>
      `;

            // Evento Favorito
            card.querySelector('.btn-fav').addEventListener('click', () => {
                note.isFav = !note.isFav;
                saveToLocalStorage();
                renderNotes();
            });

            // Evento Mover a Papelera / Restaurar
            card.querySelector('.btn-delete').addEventListener('click', () => {
                note.inTrash = !note.inTrash;
                saveToLocalStorage();
                renderNotes();
            });

            notesGrid.appendChild(card);
        });
    }

    // Mostrar u Ocultar Modal
    function openModal() {
        inputTitle.value = '';
        inputContent.value = '';
        modal.classList.add('active');
    }

    function closeModal() {
        modal.classList.remove('active');
    }

    // Guardar una nueva nota
    btnSaveNote.addEventListener('click', () => {
        const title = inputTitle.value.trim();
        const content = inputContent.value.trim();

        if (!title || !content) {
            alert('Por favor completa el título y el contenido.');
            return;
        }

        const newNote = {
            id: Date.now(),
            title: title,
            content: content,
            color: selectColor.value,
            date: 'Hace un momento',
            isFav: false,
            inTrash: false
        };

        notes.unshift(newNote);
        saveToLocalStorage();
        renderNotes();
        closeModal();
    });

    // Filtros de la barra superior y lateral
    btnNewNote.addEventListener('click', openModal);
    btnCancel.addEventListener('click', closeModal);

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
        sectionTitle.textContent = 'Todas las Tareas / Categorías';
        renderNotes();
    });

    // Carga inicial
    renderNotes();
});