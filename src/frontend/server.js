const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const permanentFolderNames = new Set([
    'proyectos', 'projects',
    'negocios', 'business', 'trabajo',
    'personal', 'casa',
    'general'
]);

// Conexión directa a Turso con credenciales
const db = createClient({
    url: 'libsql://notebook-jocelinsalvador.aws-us-west-2.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk3ODc0OTQsImlkIjoiMDFhMDdjYjMtMTIwMS03YWU0LTkxNGUtMDczZDhkNGQ0NGQxIiwia2lkIjoiVzF5UmdJSk83R0tYZU9icF93aXBuYU1ySUVKcjRjakZhZV9LdzFKS0hiWSIsInJpZCI6IjhjNGM1MTc4LWY1NTctNGVjYS1iYjlkLTAzYTBjN2QyMzVlYyJ9.8HZ5x7eHFz6xXBZAWHIn9jHf4y__9t4tMCN45HDBBKySaeOjWQplPVoFrMPbOybcTJI_ZE2wdJ2k5cznB17rBQ'
});

// GET: Obtener todas las notas activas (no en papelera)
app.get('/api/notes', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, assigned_at, due_at FROM Notas WHERE in_trash = 0 ORDER BY id DESC'
        });
        res.json(result.rows);
    } catch (error) {
        console.error('Error al consultar notas activas:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Guardar nueva nota en Turso DB
app.post('/api/notes', async (req, res) => {
    const { title, content, color, category, assigned_at, due_at } = req.body;
    try {
        const result = await db.execute({
            sql: `INSERT INTO Notas (title, content, color, category, is_favorite, in_trash, assigned_at, due_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
            args: [
                title || 'Sin título',
                content || '',
                color || 'card-peach',
                category || 'General',
                assigned_at || null,
                due_at || null
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
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, assigned_at, due_at FROM Notas WHERE in_trash = 0 AND is_favorite = 1 ORDER BY id DESC'
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
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, assigned_at, due_at FROM Notas WHERE in_trash = 1 ORDER BY id DESC'
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

// PUT / PATCH: Mover o asignar nota a una carpeta (Jalar nota)
const handleNoteCategory = async (req, res) => {
    const { id } = req.params;
    const { category } = req.body;
    try {
        await db.execute({
            sql: 'UPDATE Notas SET category = ? WHERE id = ?',
            args: [category || 'General', id]
        });
        res.json({ success: true, id, category: category || 'General', message: 'Nota movida a la carpeta' });
    } catch (error) {
        console.error('Error al mover nota a carpeta:', error);
        res.status(500).json({ error: error.message });
    }
};
app.put('/api/notes/:id/category', handleNoteCategory);
app.patch('/api/notes/:id/category', handleNoteCategory);

// GET: Categorías / Carpetas disponibles
app.get('/api/categories', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM Categorias ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al consultar categorías:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear nueva categoría / carpeta (Materia)
app.post('/api/categories', async (req, res) => {
    const { name, color, icon } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la carpeta es requerido' });
    }
    try {
        if (permanentFolderNames.has(name.trim().toLowerCase())) {
            return res.status(409).json({ error: 'Ese nombre está reservado para una carpeta permanente' });
        }
        const duplicate = await db.execute({
            sql: 'SELECT id FROM Categorias WHERE lower(name) = lower(?) LIMIT 1',
            args: [name.trim()]
        });
        if (duplicate.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        const result = await db.execute({
            sql: 'INSERT INTO Categorias (name, color, icon) VALUES (?, ?, ?)',
            args: [
                name.trim(),
                color || '#FCF5BF',
                icon || '📁'
            ]
        });
        const newId = result.lastInsertRowid ? Number(result.lastInsertRowid) : null;
        res.status(201).json({ id: newId, name: name.trim(), color, icon, message: 'Carpeta creada exitosamente' });
    } catch (error) {
        console.error('Error al crear categoría:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Renombrar una carpeta creada por el usuario
app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const name = String(req.body.name || '').trim();
    if (!name) {
        return res.status(400).json({ error: 'El nombre de la carpeta es requerido' });
    }
    try {
        const currentResult = await db.execute({
            sql: 'SELECT id, name FROM Categorias WHERE id = ?',
            args: [id]
        });
        const current = currentResult.rows[0];
        if (!current) return res.status(404).json({ error: 'No se encontró la carpeta' });
        if (permanentFolderNames.has(String(current.name).trim().toLowerCase())) {
            return res.status(403).json({ error: 'Las carpetas permanentes no se pueden editar' });
        }
        if (permanentFolderNames.has(name.toLowerCase())) {
            return res.status(409).json({ error: 'Ese nombre está reservado para una carpeta permanente' });
        }
        const duplicate = await db.execute({
            sql: 'SELECT id FROM Categorias WHERE lower(name) = lower(?) AND id <> ? LIMIT 1',
            args: [name, id]
        });
        if (duplicate.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        await db.execute({
            sql: 'UPDATE Categorias SET name = ? WHERE id = ?',
            args: [name, id]
        });
        await db.execute({
            sql: 'UPDATE Notas SET category = ? WHERE lower(category) = lower(?)',
            args: [name, current.name]
        });
        res.json({ success: true, id, name, message: 'Carpeta actualizada' });
    } catch (error) {
        console.error('Error al actualizar carpeta:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Eliminar categoría / carpeta
app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.execute({
            sql: 'SELECT name FROM Categorias WHERE id = ?',
            args: [id]
        });
        const folder = result.rows[0];
        if (folder && permanentFolderNames.has(String(folder.name).trim().toLowerCase())) {
            return res.status(403).json({ error: 'Las carpetas permanentes no se pueden eliminar' });
        }
        await db.execute({
            sql: 'DELETE FROM Categorias WHERE id = ?',
            args: [id]
        });
        res.json({ success: true, message: 'Carpeta eliminada' });
    } catch (error) {
        console.error('Error al eliminar categoría:', error);
        res.status(500).json({ error: error.message });
    }
});

async function initializePermanentFolders() {
    await db.execute(
        'CREATE TABLE IF NOT EXISTS AppMigrations (' +
        'name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    );
    const migrationName = 'seed-permanent-folders-v2';
    const migration = await db.execute({
        sql: 'SELECT name FROM AppMigrations WHERE name = ?',
        args: [migrationName]
    });
    if (migration.rows.length > 0) return;

    const existingResult = await db.execute('SELECT name FROM Categorias');
    const existingNames = new Set(existingResult.rows.map(row => String(row.name || '').trim().toLowerCase()));
    const folders = [
        { name: 'Proyectos', color: '#FCF5BF', icon: '📁', aliases: ['proyectos', 'projects'] },
        { name: 'Negocios', color: '#FF99C8', icon: '💼', aliases: ['negocios', 'business', 'trabajo'] },
        { name: 'Personal', color: '#A8DEFA', icon: '⭐', aliases: ['personal', 'casa'] },
        { name: 'General', color: '#D0F4E0', icon: '📝', aliases: ['general'] }
    ];
    for (const folder of folders) {
        if (folder.aliases.some(alias => existingNames.has(alias))) continue;
        await db.execute({
            sql: 'INSERT INTO Categorias (name, color, icon) VALUES (?, ?, ?)',
            args: [folder.name, folder.color, folder.icon]
        });
    }
    await db.execute({
        sql: 'INSERT OR IGNORE INTO AppMigrations (name) VALUES (?)',
        args: [migrationName]
    });
}

const PORT = 5080;
initializePermanentFolders()
    .catch(error => console.error('No se pudieron inicializar las carpetas permanentes en Turso:', error))
    .finally(() => {
        app.listen(PORT, () => {
            console.log('SERVIDOR EN http://localhost:' + PORT);
        });
    });
