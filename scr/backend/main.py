from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import libsql_client
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TURSO_URL = "libsql://notebook-jocelinsalvador.aws-us-west-2.turso.io"
TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg5MjI0OTMsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.QHKN3nVYK5BTLEYsIBeO4I1ta3P2WFla47UnQQ6w1E3afZJg_PF5Gw_alAsq1U9xW01F7IOcp__7sIaKSj1ZCg"

def get_db():
    return libsql_client.create_client_sync(url=TURSO_URL, auth_token=TURSO_TOKEN)

class NoteModel(BaseModel):
    title: str
    content: Optional[str] = ""

@app.get("/api/notes")
def get_notes():
    with get_db() as client:
        result = client.execute("SELECT id, title, content FROM Notas ORDER BY id DESC")
        return [{"id": row[0], "title": row[1], "content": row[2]} for row in result.rows]

@app.post("/api/notes")
def create_note(note: NoteModel):
    with get_db() as client:
        result = client.execute("INSERT INTO Notas (title, content) VALUES (?, ?)", [note.title, note.content])
        return {"message": "Creada", "id": result.last_insert_rowid}

@app.put("/api/notes/{note_id}")
def update_note(note_id: int, note: NoteModel):
    with get_db() as client:
        client.execute("UPDATE Notas SET title = ?, content = ? WHERE id = ?", [note.title, note.content, note_id])
        return {"message": "Actualizada"}

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    with get_db() as client:
        client.execute("DELETE FROM Notas WHERE id = ?", [note_id])
        return {"message": "Eliminada"}