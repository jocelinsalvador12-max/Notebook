from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import libsql_client
from typing import Optional

app = FastAPI()

# Permitir peticiones desde el frontend (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configura tus credenciales de Turso
TURSO_URL = "libsql://notebook-jocelinsalvador.aws-us-west-2.turso.io"  
TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg4NDA4NTUsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.fbIT_yL92AYfXaxyvCFWvyGkvo1VvBa0a2HqGpfB84eI6AMF9YQnrrYXKWi-T-LiJG2Y6wS-1luVStA56lRuCQ"                       # Reemplaza con tu Token de Turso

def get_db():
    return libsql_client.create_client_sync(url=TURSO_URL, auth_token=TURSO_TOKEN)

# Modelos Pydantic para validar datos
class NoteCreate(BaseModel):
    title: str
    content: Optional[str] = ""

class NoteUpdate(BaseModel):
    title: str
    content: Optional[str] = ""

# --- RUTAS DE LA API ---

@app.get("/api/notes")
def get_notes():
    with get_db() as client:
        result = client.execute("SELECT id, title, content, created_at FROM notes ORDER BY id DESC")
        notes = []
        for row in result.rows:
            notes.append({
                "id": row[0],
                "title": row[1],
                "content": row[2],
                "created_at": row[3]
            })
        return notes

@app.post("/api/notes")
def create_note(note: NoteCreate):
    with get_db() as client:
        result = client.execute(
            "INSERT INTO notes (title, content) VALUES (?, ?)",
            [note.title, note.content]
        )
        return {"message": "Nota creada con éxito", "id": result.last_insert_rowid}

@app.put("/api/notes/{note_id}")
def update_note(note_id: int, note: NoteUpdate):
    with get_db() as client:
        client.execute(
            "UPDATE notes SET title = ?, content = ? WHERE id = ?",
            [note.title, note.content, note_id]
        )
        return {"message": "Nota actualizada con éxito"}

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    with get_db() as client:
        client.execute("DELETE FROM notes WHERE id = ?", [note_id])
        return {"message": "Nota eliminada con éxito"}
        return {"message": "Nota eliminada con éxito"}