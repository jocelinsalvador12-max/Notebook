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
let subtasksNoteIdColumns = ['nota_id'];
let remindersNoteIdColumns = ['nota_id'];
let reminderAtColumns = ['reminder_at'];
let reminderSentColumns = ['is_sent'];
let categoryIdColumn = 'id';
let categoryNameColumn = 'name';
let categoryColorColumn = 'color';
let categoryIconColumn = 'icon';

// Inicializar esquema (agregar columnas si no existen)
async function initializeWorkspaceSchema() {
    if (!db) return; // nada que hacer si no hay DB
    // La app puede desplegarse contra una base Turso recién creada. Crear las
    // tablas base antes de ejecutar PRAGMA/ALTER TABLE evita que el arranque
    // falle con "no such table".
    await db.execute(`CREATE TABLE IF NOT EXISTS Notas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'card-peach',
        category TEXT NOT NULL DEFAULT 'General',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        in_trash INTEGER NOT NULL DEFAULT 0,
        assigned_at TEXT,
        due_at TEXT,
        created_at TEXT,
        owner_id TEXT
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS Categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        owner_id TEXT
    )`);
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
    const categoryColumns = await db.execute('PRAGMA table_info(Categorias)');
    const categoryColumnNames = categoryColumns.rows.map(column => column.name);
    categoryIdColumn = ['id', 'categoria_id', 'category_id'].find(column => categoryColumnNames.includes(column)) || 'id';
    categoryNameColumn = ['name', 'nombre', 'nombre_categoria', 'folder_name'].find(column => categoryColumnNames.includes(column)) || 'name';
    categoryColorColumn = ['color', 'colour', 'color_code'].find(column => categoryColumnNames.includes(column)) || 'color';
    categoryIconColumn = ['icon', 'icono'].find(column => categoryColumnNames.includes(column)) || 'icon';
    if (!categoryColumnNames.some(column => ['name', 'nombre', 'nombre_categoria', 'folder_name'].includes(column))) await db.execute('ALTER TABLE Categorias ADD COLUMN name TEXT');
    if (!categoryColumnNames.includes(categoryColorColumn)) await db.execute('ALTER TABLE Categorias ADD COLUMN color TEXT');
    if (!categoryColumnNames.includes(categoryIconColumn)) await db.execute('ALTER TABLE Categorias ADD COLUMN icon TEXT');
    await db.execute(`CREATE TABLE IF NOT EXISTS Subtareas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nota_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        is_completed INTEGER NOT NULL DEFAULT 0,
        owner_id TEXT NOT NULL
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS Recordatorios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nota_id INTEGER NOT NULL,
        reminder_at TEXT NOT NULL,
        is_sent INTEGER NOT NULL DEFAULT 0,
        owner_id TEXT NOT NULL
    )`);
    for (const table of ['Subtareas', 'Recordatorios']) {
        const columns = await db.execute(`PRAGMA table_info(${table})`);
        if (!columns.rows.some(column => column.name === 'owner_id')) {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT`);
        }
    }
    const subtaskColumns = await db.execute('PRAGMA table_info(Subtareas)');
    const subtaskColumnNames = subtaskColumns.rows.map(column => column.name);
    subtasksNoteIdColumns = ['nota_id', 'note_id'].filter(column => subtaskColumnNames.includes(column));
    if (subtasksNoteIdColumns.length === 0) {
        // Bases antiguas pueden tener la tabla vacía de vínculo por diferencias
        // entre versiones del esquema. Agregar la columna sin tocar sus datos.
        await db.execute('ALTER TABLE Subtareas ADD COLUMN nota_id INTEGER');
        subtasksNoteIdColumns = ['nota_id'];
    }
    const reminderColumns = await db.execute('PRAGMA table_info(Recordatorios)');
    const reminderColumnNames = reminderColumns.rows.map(column => column.name);
    remindersNoteIdColumns = ['nota_id', 'note_id'].filter(column => reminderColumnNames.includes(column));
    if (remindersNoteIdColumns.length === 0) {
        await db.execute('ALTER TABLE Recordatorios ADD COLUMN nota_id INTEGER');
        remindersNoteIdColumns = ['nota_id'];
    }
    const reminderDateAliases = ['reminder_at', 'remind_at', 'reminderAt', 'fecha_recordatorio', 'fecha_hora', 'fecha', 'recordatorio'];
    reminderAtColumns = reminderDateAliases.filter(column => reminderColumnNames.includes(column));
    if (reminderAtColumns.length === 0) {
        await db.execute('ALTER TABLE Recordatorios ADD COLUMN reminder_at TEXT');
        reminderAtColumns = ['reminder_at'];
    }
    reminderSentColumns = ['is_sent', 'isSent', 'enviado'].filter(column => reminderColumnNames.includes(column));
    if (reminderSentColumns.length === 0) {
        await db.execute('ALTER TABLE Recordatorios ADD COLUMN is_sent INTEGER NOT NULL DEFAULT 0');
        reminderSentColumns = ['is_sent'];
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
    const subtasks = Array.isArray(req.body.subtasks)
        ? req.body.subtasks.map(value => String(value).trim()).filter(Boolean).slice(0, 100)
        : [];
    const reminderAt = typeof req.body.reminder_at === 'string' && req.body.reminder_at.trim()
        ? req.body.reminder_at.trim()
        : null;
    let tx;
    try {
        tx = await db.transaction('write');
        const result = await tx.execute({
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
        if (newId === null) throw new Error('Turso no devolvió el ID de la nota creada.');
        for (const title of subtasks) {
            const subtaskInsertColumns = [...subtasksNoteIdColumns, 'title', 'is_completed', 'owner_id'];
            const subtaskInsertValues = [...subtasksNoteIdColumns.map(() => newId), title, 0, req.workspaceId];
            await tx.execute({
                sql: `INSERT INTO Subtareas (${subtaskInsertColumns.join(', ')}) VALUES (${subtaskInsertColumns.map(() => '?').join(', ')})`,
                args: subtaskInsertValues
            });
        }
        if (reminderAt) {
            const reminderInsertColumns = [...remindersNoteIdColumns, ...reminderAtColumns, ...reminderSentColumns, 'owner_id'];
            const reminderInsertValues = [
                ...remindersNoteIdColumns.map(() => newId),
                ...reminderAtColumns.map(() => reminderAt),
                ...reminderSentColumns.map(() => 0),
                req.workspaceId
            ];
            await tx.execute({
                sql: `INSERT INTO Recordatorios (${reminderInsertColumns.join(', ')}) VALUES (${reminderInsertColumns.map(() => '?').join(', ')})`,
                args: reminderInsertValues
            });
        }
        await tx.commit();
        res.status(201).json({ id: newId, message: 'Nota guardada en Turso DB' });
    } catch (error) {
        if (tx && !tx.closed) await tx.rollback().catch(() => {});
        console.error('Error al insertar nota:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (tx) tx.close();
    }
});

// Consultar recordatorios y subtareas guardados junto a una nota.
app.get('/api/notes/:id/details', async (req, res) => {
    try {
        const note = await db.execute({
            sql: 'SELECT id FROM Notas WHERE id = ? AND owner_id = ? LIMIT 1',
            args: [req.params.id, req.workspaceId]
        });
        if (!note.rows[0]) return res.status(404).json({ error: 'No se encontró la nota.' });
        const [subtasks, reminders] = await Promise.all([
            db.execute({
                sql: `SELECT id, title, is_completed FROM Subtareas WHERE ${subtasksNoteIdColumns[0]} = ? AND owner_id = ? ORDER BY id`,
                args: [req.params.id, req.workspaceId]
            }),
            db.execute({
                sql: `SELECT id, ${reminderAtColumns[0]} AS reminder_at, ${reminderSentColumns[0]} AS is_sent FROM Recordatorios WHERE ${remindersNoteIdColumns[0]} = ? AND owner_id = ? ORDER BY ${reminderAtColumns[0]}`,
                args: [req.params.id, req.workspaceId]
            })
        ]);
        res.json({ subtasks: subtasks.rows, reminders: reminders.rows });
    } catch (error) {
        console.error('Error al consultar detalles de la nota:', error);
        res.status(500).json({ error: 'No se pudieron consultar recordatorios y subtareas.' });
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
        const result = await db.execute({
            sql: 'UPDATE Notas SET is_favorite = ? WHERE id = ? AND owner_id = ?',
            args: [val, id, req.workspaceId]
        });
        if (result.rowsAffected === 0) return res.status(404).json({ success: false, error: 'No se encontró la nota en este espacio de trabajo.' });
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
        const result = await db.execute({
            sql: 'UPDATE Notas SET in_trash = ? WHERE id = ? AND owner_id = ?',
            args: [val, id, req.workspaceId]
        });
        if (result.rowsAffected === 0) return res.status(404).json({ success: false, error: 'No se encontró la nota en este espacio de trabajo.' });
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
            sql: `SELECT ${categoryIdColumn} AS id, ${categoryNameColumn} AS name, ${categoryColorColumn} AS color, ${categoryIconColumn} AS icon, owner_id FROM Categorias WHERE owner_id = ? ORDER BY ${categoryIdColumn} ASC`,
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
            sql: `SELECT ${categoryIdColumn} AS id FROM Categorias WHERE owner_id = ? AND lower(${categoryNameColumn}) = lower(?) LIMIT 1`,
            args: [req.workspaceId, name.trim()]
        });
        if (duplicate.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        const result = await db.execute({
            sql: `INSERT INTO Categorias (${categoryNameColumn}, ${categoryColorColumn}, ${categoryIconColumn}, owner_id) VALUES (?, ?, ?, ?)`,
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
            sql: `SELECT ${categoryIdColumn} AS id, ${categoryNameColumn} AS name FROM Categorias WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
            args: [id, req.workspaceId]
        });
        const current = currentResult.rows[0];
        if (!current) return res.status(404).json({ error: 'No se encontró la carpeta' });
        const duplicate = await db.execute({
            sql: `SELECT ${categoryIdColumn} AS id FROM Categorias WHERE owner_id = ? AND lower(${categoryNameColumn}) = lower(?) AND ${categoryIdColumn} <> ? LIMIT 1`,
            args: [req.workspaceId, name, id]
        });
        if (duplicate.rows.length > 0) {
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        await db.execute({
            sql: `UPDATE Categorias SET ${categoryNameColumn} = ? WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
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
            sql: `SELECT ${categoryNameColumn} AS name FROM Categorias WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
            args: [id, req.workspaceId]
        });
        const folder = result.rows[0];
        if (!folder) return res.status(404).json({ error: 'No se encontró la carpeta' });
        await db.execute({
            sql: 'UPDATE Notas SET category = ? WHERE owner_id = ? AND lower(category) = lower(?)',
            args: ['', req.workspaceId, folder.name]
        });
        await db.execute({
            sql: `DELETE FROM Categorias WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
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
