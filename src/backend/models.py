from pydantic import BaseModel, Field
from typing import Optional

# ==========================================
# MODELOS PARA NOTAS
# ==========================================

class NoteBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="Título de la nota")
    content: str = Field(..., description="Contenido o cuerpo de la nota")
    color: str = Field(default="card-peach", description="Clase CSS o código de color asignado")
    category: str = Field(default="General", description="Categoría a la que pertenece")

class NoteCreate(NoteBase):
    """Esquema utilizado al crear una nueva nota."""
    pass

class NoteResponse(NoteBase):
    """Esquema utilizado para responder los datos de una nota con su ID de base de datos."""
    id: int

    class Config:
        from_attributes = True


# ==========================================
# MODELOS PARA FAVORITOS Y PAPELERA
# ==========================================

class FavoriteItem(BaseModel):
    id: int
    title: str
    content: str
    color: Optional[str] = "card-peach"

class TrashItem(BaseModel):
    id: int
    title: str
    content: str
    color: Optional[str] = "card-peach"
    category: Optional[str] = "General"