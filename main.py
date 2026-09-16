from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# Configuración de CORS para permitir la comunicación con el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# RUTAS / ENDPOINTS DE LA API
# ==========================================

@app.get("/api/notes")
def read_notes():
    return get_all_notes()

@app.post("/api/notes")
def add_note(note: NoteCreate):
    return create_note(note.title, note.content, note.color, note.category)

@app.put("/api/notes/{note_id}/favorite")
def set_favorite(note_id: int, is_favorite: bool):
    return toggle_favorite(note_id, is_favorite)

@app.put("/api/notes/{note_id}/trash")
def trash_note(note_id: int):
    return move_to_trash(note_id)

@app.delete("/api/notes/{note_id}")
def purge_note(note_id: int):
    return delete_note_permanently(note_id)

@app.get("/api/favorites")
def read_favorites():
    return get_favorites()

@app.get("/api/trash")
def read_trash():
    return get_trash()