try:
    from src.backend.data import query_turso
except ImportError:
    try:
        from .data import query_turso
    except ImportError:
        from data import query_turso

def get_all_notes():
    return query_turso("SELECT id, title, content, color, category, is_favorite, in_trash FROM Notas WHERE in_trash = 0 ORDER BY id DESC;")

def create_note(title_or_obj, content: str = "", color: str = "card-peach", category: str = "General"):
    if hasattr(title_or_obj, "title"):
        title = title_or_obj.title
        content = getattr(title_or_obj, "content", "")
        color = getattr(title_or_obj, "color", "card-peach")
        category = getattr(title_or_obj, "category", "General")
    else:
        title = title_or_obj

    sql = "INSERT INTO Notas (title, content, color, category, is_favorite, in_trash) VALUES (?, ?, ?, ?, 0, 0);"
    return query_turso(sql, [title, content, color, category])

def get_favorites():
    return query_turso("SELECT id, title, content, color, category, is_favorite, in_trash FROM Notas WHERE in_trash = 0 AND is_favorite = 1 ORDER BY id DESC;")

def toggle_favorite(note_id: int, is_favorite: bool):
    val = 1 if is_favorite else 0
    return query_turso("UPDATE Notas SET is_favorite = ? WHERE id = ?;", [val, note_id])

def get_trash():
    return query_turso("SELECT id, title, content, color, category, is_favorite, in_trash FROM Notas WHERE in_trash = 1 ORDER BY id DESC;")

def move_to_trash(note_id: int, is_trash: bool = True):
    val = 1 if is_trash else 0
    return query_turso("UPDATE Notas SET in_trash = ? WHERE id = ?;", [val, note_id])

def delete_note_permanently(note_id: int):
    return query_turso("DELETE FROM Notas WHERE id = ?;", [note_id])