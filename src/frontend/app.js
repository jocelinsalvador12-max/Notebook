// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
// Apuntamos al puerto donde está ejecutándose el servidor Express
const API_URL = 'http://localhost:5080/api';

// Elementos del DOM
const notesContainer = document.getElementById('notes-container');
const editorModal = document.getElementById('editor-modal');
const btnNewNote = document.querySelector('.card-new');
const btnFavs = document.querySelector('.card-favs');
const btnCategories = document.querySelector('.card-categories');
const btnTrash = document.querySelector('.trash-btn');
const btnCancel = document.getElementById('btn-cancel');
const btnSaveNote = document.getElementById('btn-save-note');

// ==========================================
// 1. CONTROL DEL MODAL Y NAVEGACIÓN
// ==========================================

// Abrir Modal de Nueva Nota
if (btnNewNote) {
  btnNewNote.addEventListener('click', () => {
    if (editorModal) editorModal.style.display = 'flex';
  });
}

// Cerrar Modal
if (btnCancel) {
  btnCancel.addEventListener('click', () => {
    if (editorModal) editorModal.style.display = 'none';
    limpiarFormulario();
  });
}

// Navegación de Botones
if (btnTrash) {
  btnTrash.addEventListener('click', () => {
    window.location.href = './papelera.html';
  });
}

if (btnFavs) {
  btnFavs.addEventListener('click', () => {
    window.location.href = './favoritos.html';
  });
}

if (btnCategories) {
  btnCategories.addEventListener('click', () => {
    window.location.href = './categorias.html';
  });
}

// ==========================================
// 2. OBTENER Y RENDERIZAR NOTAS (GET)
// ==========================================

async function cargarNotas(endpoint = '/notes') {
  try {
    const response = await fetch(`${API_URL}${endpoint}`);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

    const notas = await response.json();
    renderizarNotas(notas);
  } catch (error) {
    console.error('Error al cargar notas:', error);
    if (notesContainer) {
      notesContainer.innerHTML = `<p style="color: red; padding: 1rem;">Error al conectar con la base de datos (puerto 5080).</p>`;
    }
  }
}

function renderizarNotas(notas) {
  if (!notesContainer) return;

  if (!Array.isArray(notas) || notas.length === 0) {
    notesContainer.innerHTML = '<p class="text-gray-500 italic">No hay notas para mostrar.</p>';
    return;
  }

  notesContainer.innerHTML = notas.map(nota => `
        <article class="note-card ${nota.color || 'card-peach'}">
            <div class="card-header-icons">
                <button onclick="toggleFavorito('${nota.id}', ${nota.is_favorite})" title="Favorito">
                    ${nota.is_favorite ? '⭐' : '☆'}
                </button>
                <button onclick="moverAPapelera('${nota.id}')" title="Eliminar">🗑️</button>
            </div>
            <div class="card-body">
                <h3>${escapeHTML(nota.title)}</h3>
                <p>${escapeHTML(nota.content)}</p>
            </div>
            <div class="card-footer">
                <span>🏷️ ${escapeHTML(nota.category || 'General')}</span>
            </div>
        </article>
    `).join('');
}

// ==========================================
// 3. GUARDAR NUEVA NOTA (POST)
// ==========================================

if (btnSaveNote) {
  btnSaveNote.addEventListener('click', async (e) => {
    e.preventDefault();

    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');
    const colorInput = document.getElementById('note-color');

    const title = titleInput ? titleInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';
    const color = colorInput ? colorInput.value : 'card-peach';

    if (!title || !content) {
      alert('Por favor, ingresa un título y un contenido para la nota.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, color })
      });

      if (response.ok) {
        if (editorModal) editorModal.style.display = 'none';
        limpiarFormulario();
        determinarVistaYRecargar();
      } else {
        const errData = await response.json();
        alert(`No se pudo guardar la nota: ${errData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error al guardar la nota:', error);
      alert('Error de red al intentar guardar la nota.');
    }
  });
}

// ==========================================
// 4. FUNCIONES AUXILIARES
// ==========================================

function limpiarFormulario() {
  const title = document.getElementById('note-title');
  const content = document.getElementById('note-content');
  if (title) title.value = '';
  if (content) content.value = '';
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>"']/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[match]));
}

function determinarVistaYRecargar() {
  const path = window.location.pathname;
  if (path.includes('favoritos.html')) {
    cargarNotas('/favorites');
  } else if (path.includes('papelera.html')) {
    cargarNotas('/trash');
  } else {
    cargarNotas('/notes');
  }
}

// Hacer globales las funciones llamadas desde el HTML dinámico
window.toggleFavorito = async function (id, estadoActual) {
  try {
    await fetch(`${API_URL}/notes/${id}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: !estadoActual })
    });
    determinarVistaYRecargar();
  } catch (err) {
    console.error(err);
  }
};

window.moverAPapelera = async function (id) {
  try {
    await fetch(`${API_URL}/notes/${id}/trash`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_trashed: true })
    });
    determinarVistaYRecargar();
  } catch (err) {
    console.error(err);
  }
};

// Cargar notas al iniciar
document.addEventListener('DOMContentLoaded', determinarVistaYRecargar);