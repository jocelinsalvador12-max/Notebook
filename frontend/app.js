// Cargar notas al iniciar
document.addEventListener('DOMContentLoaded', cargarNotas);

async function cargarNotas() {
    // Petición a tu backend/Toro
    const res = await fetch('/api/notes');
    const notas = await res.json();

    const list = document.getElementById('notes-list');
    list.innerHTML = '';

    notas.forEach(nota => {
        const li = document.createElement('li');
        li.textContent = nota.title || 'Sin título';
        li.onclick = () => seleccionarNota(nota);
        list.appendChild(li);
    });
}

function seleccionarNota(nota) {
    document.getElementById('note-id').value = nota.id;
    document.getElementById('note-title').value = nota.title;
    document.getElementById('note-content').value = nota.content;
}

function nuevaNota() {
    document.getElementById('note-id').value = '';
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
}

async function guardarNota() {
    const id = document.getElementById('note-id').value;
    const title = document.getElementById('note-title').value;
    const content = document.getElementById('note-content').value;

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/notes/${id}` : '/api/notes';

    await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
    });

    nuevaNota();
    cargarNotas();
}

async function eliminarNota() {
    const id = document.getElementById('note-id').value;
    if (!id) return;

    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    nuevaNota();
    cargarNotas();
}