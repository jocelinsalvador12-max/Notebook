from data import query_turso

def get_all_notes():
    return query_turso("SELECT id, title, content, color, category FROM notes WHERE in_trash = 0 ORDER BY id DESC;")

def create_note(title: str, content: str, color: str = "card-peach", category: str = "General"):
    sql = "INSERT INTO notes (title, content, color, category, is_favorite, in_trash) VALUES (?, ?, ?, ?, 0, 0);"
    return query_turso(sql, [title, content, color, category])

def toggle_favorite(note_id: int, is_favorite: bool):
    val = 1 if is_favorite else 0
    return query_turso("UPDATE notes SET is_favorite = ? WHERE id = ?;", [val, note_id])

def move_to_trash(note_id: int):
    return query_turso("UPDATE notes SET in_trash = 1 WHERE id = ?;", [note_id])

def delete_note_permanently(note_id: int):
    return query_turso("DELETE FROM notes WHERE id = ?;", [note_id])