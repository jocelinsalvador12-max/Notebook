const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ──────────────────────────────────────────────
// Conexión a Turso (segura: no lanza excepciones
// a nivel de módulo para que Vercel pueda cargarlo)
// ──────────────────────────────────────────────
const db = (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN)
    ? createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
    })
    : null;

// Inicializar esquema (agregar columnas si no existen)
async function initializeWorkspaceSchema() {
    if (!db) return; // nada que hacer si no hay DB
    await db.execute(`CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL
    )`);
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Usuarios_username_unique ON Usuarios (lower(username))');
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Usuarios_email_unique ON Usuarios (lower(email))');
    for (const table of ['Notas', 'Categorias']) {
        const columns = await db.execute(`PRAGMA table_info(${table})`);
        if (!columns.rows.some(column => column.name === 'owner_id')) {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT`);
        }
    }
    const noteColumns = await db.execute('PRAGMA table_info(Notas)');
    if (!noteColumns.rows.some(column => column.name === 'created_at')) {
        await db.execute('ALTER TABLE Notas ADD COLUMN created_at TEXT');
    }
}

const workspaceSchemaReady = initializeWorkspaceSchema();

const SESSION_COOKIE = 'notebook_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
function sessionSecret() {
    return process.env.SESSION_SECRET || '';
}
function signSession(user) {
    const payload = Buffer.from(JSON.stringify({ id: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS })).toString('base64url');
    const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}
function readSession(req) {
    const cookieHeader = req.headers.cookie || '';
    const token = cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    if (!token || !sessionSecret()) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest();
    let supplied;
    try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return Number.isInteger(session.id) && session.exp > Math.floor(Date.now() / 1000) ? session : null;
    } catch { return null; }
}
function setSessionCookie(req, res, value, maxAge = SESSION_MAX_AGE_SECONDS) {
    const secure = req.secure || req.get('x-forwarded-proto') === 'https';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

// ==========================================
// RUTAS DE AUTENTICACIÓN (Registro y Login)
// ==========================================

app.post('/api/register', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || username.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 72) {
        return res.status(400).json({ success: false, error: 'Ingresa un usuario, correo válido y una contraseña de 8 a 72 caracteres.' });
    }
    if (!db) return res.status(503).json({ success: false, error: 'La base de datos no está configurada.' });
    if (!sessionSecret()) return res.status(503).json({ success: false, error: 'El servidor no tiene SESSION_SECRET configurado.' });
    try {
        await workspaceSchemaReady;
        const password_hash = await bcrypt.hash(password, 12);

        const result = await db.execute({
            sql: 'INSERT INTO Usuarios (username, email, password_hash) VALUES (?, ?, ?)',
            args: [username, email, password_hash]
        });
        const user = { id: Number(result.lastInsertRowid), username, email };
        setSessionCookie(req, res, signSession(user));
        res.status(201).json({ success: true, message: '¡Usuario registrado con éxito!', user });
    } catch (error) {
        console.error("Error al registrar:", error);
        if (String(error.message || '').includes('UNIQUE constraint failed')) {
            return res.status(409).json({ success: false, error: 'Ese usuario o correo ya está registrado.' });
        }
        res.status(500).json({ success: false, error: 'No se pudo completar el registro.' });
    }
});

app.post('/api/login', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ success: false, error: 'Ingresa tu usuario y contraseña.' });
    if (!db) return res.status(503).json({ success: false, error: 'La base de datos no está configurada.' });
    if (!sessionSecret()) return res.status(503).json({ success: false, error: 'El servidor no tiene SESSION_SECRET configurado.' });
    try {
        await workspaceSchemaReady;
        const result = await db.execute({
            sql: 'SELECT id, username, email, password_hash FROM Usuarios WHERE lower(username) = lower(?) LIMIT 1',
            args: [username]
        });

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
        }

        setSessionCookie(req, res, signSession(user));
        res.status(200).json({
            success: true,
            message: 'Inicio de sesión exitoso',
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        res.status(500).json({ success: false, error: "Error en el servidor." });
    }
});

app.get('/api/session', async (req, res) => {
    if (!db || !sessionSecret()) return res.status(503).json({ success: false, error: 'La autenticación no está configurada.' });
    const session = readSession(req);
    if (!session) return res.status(401).json({ success: false, error: 'La sesión no es válida.' });
    try {
        const result = await db.execute({ sql: 'SELECT id, username, email FROM Usuarios WHERE id = ? LIMIT 1', args: [session.id] });
        if (!result.rows[0]) return res.status(401).json({ success: false, error: 'La sesión no es válida.' });
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Error al consultar la sesión:', error);
        res.status(500).json({ success: false, error: 'No se pudo consultar la sesión.' });
    }
});

app.post('/api/logout', (req, res) => {
    setSessionCookie(req, res, '', 0);
    res.json({ success: true });
});

// ──────────────────────────────────────────────
// Middleware 1: verificar que la DB está configurada
// ──────────────────────────────────────────────
app.use('/api', (req, res, next) => {
    if (!db) {
        return res.status(503).json({ error: 'Las variables TURSO_DATABASE_URL y TURSO_AUTH_TOKEN no están configuradas en el servidor.' });
    }
    next();
});

// ──────────────────────────────────────────────
// Middleware 2: esperar esquema y validar workspace
// ──────────────────────────────────────────────
app.use('/api', async (req, res, next) => {
    try {
        await workspaceSchemaReady;
    } catch (error) {
        console.error('No se pudo preparar la base de datos:', error);
        return res.status(500).json({ error: 'No se pudo preparar la base de datos.' });
    }
    const workspaceId = String(req.get('X-Workspace-Id') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
        return res.status(400).json({ error: 'No se encontró el espacio de trabajo del navegador.' });
    }
    req.workspaceId = workspaceId;
    next();
});

// GET: Obtener todas las notas activas (no en papelera)
app.get('/api/notes', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, assigned_at, due_at, created_at FROM Notas WHERE owner_id = ? AND in_trash = 0 ORDER BY id DESC',
            args: [req.workspaceId]
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
            sql: `INSERT INTO Notas (title, content, color, category, is_favorite, in_trash, assigned_at, due_at, owner_id, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
            args: [
                title || 'Sin título',
                content || '',
                color || 'card-peach',
                category || '',
                assigned_at || null,
                due_at || null,
                req.workspaceId,
                new Date().toISOString()
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
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, assigned_at, due_at FROM Notas WHERE owner_id = ? AND in_trash = 0 AND is_favorite = 1 ORDER BY id DESC',
            args: [req.workspaceId]
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
            sql: 'UPDATE Notas SET is_favorite = ? WHERE id = ? AND owner_id = ?',
            args: [val, id, req.workspaceId]
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
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, assigned_at, due_at FROM Notas WHERE owner_id = ? AND in_trash = 1 ORDER BY id DESC',
            args: [req.workspaceId]
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
            sql: 'UPDATE Notas SET in_trash = ? WHERE id = ? AND owner_id = ?',
            args: [val, id, req.workspaceId]
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
            sql: 'DELETE FROM Notas WHERE id = ? AND owner_id = ?',
            args: [id, req.workspaceId]
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
            sql: 'UPDATE Notas SET category = ? WHERE id = ? AND owner_id = ?',
            args: [category || 'General', id, req.workspaceId]
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
        const result = await db.execute({
            sql: 'SELECT * FROM Categorias WHERE owner_id = ? ORDER BY id ASC',
            args: [req.workspaceId]
        });
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
        const duplicate = await db.execute({
            sql: 'SELECT id FROM Categorias WHERE owner_id = ? AND lower(name) = lower(?) LIMIT 1',
            args: [req.workspaceId, name.trim()]
        });
        if (duplicate.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        const result = await db.execute({
            sql: 'INSERT INTO Categorias (name, color, icon, owner_id) VALUES (?, ?, ?, ?)',
            args: [
                name.trim(),
                color || '#FCF5BF',
                icon || '📁',
                req.workspaceId
            ]
        });
        const newId = result.lastInsertRowid ? Number(result.lastInsertRowid) : null;
        res.status(201).json({ id: newId, name: name.trim(), color, icon, message: 'Carpeta creada exitosamente' });
    } catch (error) {
        console.error('Error al crear categoría:', error);
        if (String(error.message || '').includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Ya existe una clase o carpeta con ese nombre. Prueba con otro nombre.' });
        }
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
            sql: 'SELECT id, name FROM Categorias WHERE id = ? AND owner_id = ?',
            args: [id, req.workspaceId]
        });
        const current = currentResult.rows[0];
        if (!current) return res.status(404).json({ error: 'No se encontró la carpeta' });
        const duplicate = await db.execute({
            sql: 'SELECT id FROM Categorias WHERE owner_id = ? AND lower(name) = lower(?) AND id <> ? LIMIT 1',
            args: [req.workspaceId, name, id]
        });
        if (duplicate.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        await db.execute({
            sql: 'UPDATE Categorias SET name = ? WHERE id = ? AND owner_id = ?',
            args: [name, id, req.workspaceId]
        });
        await db.execute({
            sql: 'UPDATE Notas SET category = ? WHERE owner_id = ? AND lower(category) = lower(?)',
            args: [name, req.workspaceId, current.name]
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
            sql: 'SELECT name FROM Categorias WHERE id = ? AND owner_id = ?',
            args: [id, req.workspaceId]
        });
        const folder = result.rows[0];
        if (!folder) return res.status(404).json({ error: 'No se encontró la carpeta' });
        await db.execute({
            sql: 'UPDATE Notas SET category = ? WHERE owner_id = ? AND lower(category) = lower(?)',
            args: ['', req.workspaceId, folder.name]
        });
        await db.execute({
            sql: 'DELETE FROM Categorias WHERE id = ? AND owner_id = ?',
            args: [id, req.workspaceId]
        });
        res.json({ success: true, message: 'Carpeta eliminada' });
    } catch (error) {
        console.error('Error al eliminar categoría:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 5080;

if (require.main === module) {
    workspaceSchemaReady
        .then(() => app.listen(PORT, () => {
            console.log('SERVIDOR EN http://localhost:' + PORT);
        }))
        .catch(error => {
            console.error('No se pudo preparar el aislamiento de espacios de trabajo:', error);
            process.exitCode = 1;
        });
}

module.exports = app;
