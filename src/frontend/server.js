const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Conexión directa a Turso con credenciales
const db = createClient({
    url: 'libsql://notebook-jocelinsalvador.aws-us-west-2.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk3ODc0OTQsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.8HZ5x7eHFz6xXBZAWHIn9jHf4y__9t4tMCN45HDBBKySaeOjWQplPVoFrMPbOybcTJI_ZE2wdJ2k5cznB17rBQ'
});

// GET: Obtener todas las notas activas (no en papelera)
app.get('/api/notes', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash FROM Notas WHERE in_trash = 0 ORDER BY id DESC'
        });
        res.json(result.rows);
    } catch (error) {
        console.error('Error al consultar notas activas:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Guardar nueva nota en Turso DB
app.post('/api/notes', async (req, res) => {
    const { title, content, color, category } = req.body;
    try {
        const result = await db.execute({
            sql: `INSERT INTO Notas (title, content, color, category, is_favorite, in_trash) VALUES (?, ?, ?, ?, 0, 0)`,
            args: [
                title || 'Sin título',
                content || '',
                color || 'card-peach',
                category || 'General'
            ]
        });
        const newId = result.lastInsertRowid ? Number(result.lastInsertRowid) : null;
        res.status(201).json({ id: newId, message: 'Nota guardada en Turso DB' });
    } catch (error) {
        console.error('Error al insertar nota:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET: Obtener notas marcadas como favoritas
app.get('/api/favorites', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash FROM Notas WHERE in_trash = 0 AND is_favorite = 1 ORDER BY id DESC'
        });
        res.json(result.rows);
    } catch (error) {
        console.error('Error al consultar favoritos:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT / PATCH: Alternar favorito (is_favorite: 1 o 0)
const handleFavorite = async (req, res) => {
    const { id } = req.params;
    let isFav = req.query.is_favorite !== undefined ? req.query.is_favorite : req.body.is_favorite;
    const val = (isFav === true || isFav === 'true' || isFav === 1 || isFav === '1') ? 1 : 0;

    try {
        await db.execute({
            sql: 'UPDATE Notas SET is_favorite = ? WHERE id = ?',
            args: [val, id]
        });
        res.json({ success: true, id, is_favorite: val });
    } catch (error) {
        console.error('Error al actualizar favorito:', error);
        res.status(500).json({ error: error.message });
    }
};
app.put('/api/notes/:id/favorite', handleFavorite);
app.patch('/api/notes/:id/favorite', handleFavorite);

// GET: Obtener notas en la papelera
app.get('/api/trash', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash FROM Notas WHERE in_trash = 1 ORDER BY id DESC'
        });
        res.json(result.rows);
    } catch (error) {
        console.error('Error al consultar papelera:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT / PATCH: Mover a papelera o restaurar (in_trash: 1 o 0)
const handleTrash = async (req, res) => {
    const { id } = req.params;
    let isTrash = req.query.is_trash !== undefined ? req.query.is_trash : (req.body.is_trash !== undefined ? req.body.is_trash : req.body.is_trashed);
    const val = (isTrash === true || isTrash === 'true' || isTrash === 1 || isTrash === '1') ? 1 : 0;

    try {
        await db.execute({
            sql: 'UPDATE Notas SET in_trash = ? WHERE id = ?',
            args: [val, id]
        });
        res.json({ success: true, id, in_trash: val });
    } catch (error) {
        console.error('Error al mover/restaurar papelera:', error);
        res.status(500).json({ error: error.message });
    }
};
app.put('/api/notes/:id/trash', handleTrash);
app.patch('/api/notes/:id/trash', handleTrash);

// DELETE: Eliminar permanentemente una nota de la BD
app.delete('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute({
            sql: 'DELETE FROM Notas WHERE id = ?',
            args: [id]
        });
        res.json({ success: true, message: 'Nota eliminada permanentemente' });
    } catch (error) {
        console.error('Error al eliminar nota:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET: Categorías disponibles
app.get('/api/categories', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM Categorias');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al consultar categorías:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 5080;
app.listen(PORT, () => {
    console.log(`SERVIDOR EN http://localhost:${PORT}`);
});