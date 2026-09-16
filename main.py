from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

# Importaciones ajustadas a tu carpeta src/backend/
from src.backend.crud import (
    get_all_notes,
    create_note,
    toggle_favorite,
    move_to_trash,
    delete_note_permanently,
    get_favorites,
    get_trash
)
from src.backend.models import NoteCreate

app = FastAPI(title="Notebook API")

# Habilitar CORS para conectar con el Frontend en local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Obtener todas las notas activas (no en papelera)
@app.get("/api/notes")
def read_notes():
    return get_all_notes()

# 2. Crear una nueva nota
@app.post("/api/notes")
def add_note(note: NoteCreate):
    return create_note(note)

# 3. Obtener notas marcadas como favoritas
@app.get("/api/favorites")
def read_favorites():
    return get_favorites()

# 4. Cambiar estado de favorito (True / False)
@app.put("/api/notes/{note_id}/favorite")
def set_favorite(note_id: int, is_favorite: bool = Query(...)):
    return toggle_favorite(note_id, is_favorite)

# 5. Mover nota a la papelera o restaurarla
@app.put("/api/notes/{note_id}/trash")
def set_trash(note_id: int, is_trash: bool = Query(...)):
    return move_to_trash(note_id, is_trash)

# 6. Obtener notas de la papelera
@app.get("/api/trash")
def read_trash():
    return get_trash()

# 7. Eliminar nota definitivamente de la BD
@app.delete("/api/notes/{note_id}")
def remove_note(note_id: int):
    return delete_note_permanently(note_id)