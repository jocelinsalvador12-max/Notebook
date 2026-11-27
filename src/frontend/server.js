const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@libsql/client');
const { Client, Account, ID } = require('node-appwrite');

// Cargar variables de entorno desde la raíz del proyecto y el directorio actual
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const app = express();

// Configuración CORS dinámica y segura para cookies httpOnly
app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Appwrite-Session', 'X-Workspace-Id']
}));
app.use(express.json());

// Servir archivos estáticos del frontend si se ejecuta el servidor directamente
app.use(express.static(path.join(__dirname, '..', '..', 'dist')));
app.use(express.static(__dirname));

// ──────────────────────────────────────────────
// Configuración de Appwrite
// Soporta nombres estándar y con prefijo NEXT_PUBLIC_ / VITE_
// ──────────────────────────────────────────────
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

const SESSION_COOKIE = 'notebook_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días

// Obtener origen dinámicamente para soportar local y Vercel sin rutas rotas ni CORS
function getAppOrigin(req) {
    const host = req.headers['x-forwarded-host'] || req.headers.host || req.get('host') || '';
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    // En local, respetar el host y puerto de la petición actual
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        return `${proto}://${host}`.replace(/\/+$/, '');
    }
    const envUrl = process.env.PUBLIC_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.SITE_URL;
    if (envUrl) return envUrl.replace(/\/+$/, '');
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');
    if (host) return `${proto}://${host}`.replace(/\/+$/, '');
    return 'http://localhost:5080';
}

function setSessionCookie(req, res, sessionSecret, maxAge = SESSION_MAX_AGE_SECONDS) {
    const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';
    const expires = maxAge > 0 ? new Date(Date.now() + maxAge * 1000).toUTCString() : new Date(0).toUTCString();
    const secureFlag = isHttps ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionSecret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires}${secureFlag}`);
}

function clearSessionCookie(req, res) {
    setSessionCookie(req, res, '', 0);
}

function getSessionToken(req) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = cookieHeader.split(';').map(v => v.trim());
    const match = cookies.find(v => v.startsWith(`${SESSION_COOKIE}=`));
    if (match) {
        const val = match.slice(SESSION_COOKIE.length + 1).trim();
        if (val) return decodeURIComponent(val);
    }
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    const headerToken = req.headers['x-appwrite-session'];
    if (headerToken) return String(headerToken).trim();
    return null;
}

function createAppwriteClient(sessionToken = null) {
    if (!APPWRITE_PROJECT_ID) {
        throw new Error('APPWRITE_PROJECT_ID no está configurado en las variables de entorno.');
    }
    const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID);
    if (sessionToken) {
        client.setSession(sessionToken);
    }
    return client;
}

// Crear sesión en Appwrite extrayendo de forma segura el token devuelto en los headers
async function createAppwriteEmailSession(email, password) {
    const response = await fetch(`${APPWRITE_ENDPOINT}/account/sessions/email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': APPWRITE_PROJECT_ID
        },
        body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Error al autenticar en Appwrite.');
    }
    let sessionToken = '';
    const fallbackHeader = response.headers.get('x-fallback-cookies');
    if (fallbackHeader) {
        try {
            const fallback = JSON.parse(fallbackHeader);
            const key = Object.keys(fallback).find(k => k.startsWith('a_session_'));
            if (key) sessionToken = fallback[key];
        } catch {}
    }
    if (!sessionToken && typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        for (const c of cookies) {
            const match = c.match(/a_session_[^=]+=([^;]+)/);
            if (match) {
                sessionToken = match[1];
                break;
            }
        }
    }
    return { session: data, token: sessionToken || data.secret || '' };
}

const sessionCache = new Map();
const SESSION_CACHE_TTL_MS = 60 * 1000;

async function verifyAppwriteSession(sessionToken) {
    if (!sessionToken) return null;
    const cached = sessionCache.get(sessionToken);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.user;
    }
    const client = createAppwriteClient(sessionToken);
    const account = new Account(client);
    const user = await account.get();
    if (user && user.$id) {
        sessionCache.set(sessionToken, {
            user,
            expiresAt: Date.now() + SESSION_CACHE_TTL_MS
        });
        return user;
    }
    return null;
}

// ──────────────────────────────────────────────
// Conexión a Turso (libSQL)
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

// Inicializar esquema en Turso
async function initializeWorkspaceSchema() {
    if (!db) return;
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
        is_completed INTEGER NOT NULL DEFAULT 0,
        owner_id TEXT
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS Categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        owner_id TEXT
    )`);
    for (const table of ['Favoritos', 'Papelera']) {
        await db.execute(`CREATE TABLE IF NOT EXISTS ${table} (
            id INTEGER PRIMARY KEY,
            title TEXT,
            content TEXT,
            color TEXT,
            owner_id TEXT
        )`);
        const columns = await db.execute(`PRAGMA table_info(${table})`);
        if (!columns.rows.some(column => column.name === 'owner_id')) {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT`);
        }
    }
    await db.execute(`INSERT OR REPLACE INTO Favoritos (id, title, content, color, owner_id)
        SELECT id, title, content, color, owner_id FROM Notas WHERE is_favorite = 1`);
    await db.execute(`INSERT OR REPLACE INTO Papelera (id, title, content, color, owner_id)
        SELECT id, title, content, color, owner_id FROM Notas WHERE in_trash = 1`);

    // Tabla Usuarios en Turso vinculada a Appwrite por appwrite_id
    await db.execute(`CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appwrite_id TEXT,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
    )`);
    const userColumns = await db.execute('PRAGMA table_info(Usuarios)');
    const userColNames = userColumns.rows.map(column => column.name);
    if (!userColNames.includes('appwrite_id')) {
        await db.execute('ALTER TABLE Usuarios ADD COLUMN appwrite_id TEXT');
    }
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Usuarios_appwrite_id_unique ON Usuarios (appwrite_id)');
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Usuarios_username_unique ON Usuarios (lower(username))');
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS Usuarios_email_unique ON Usuarios (lower(email))');

    for (const table of ['Notas', 'Categorias']) {
        const columns = await db.execute(`PRAGMA table_info(${table})`);
        if (!columns.rows.some(column => column.name === 'owner_id')) {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT`);
        }
    }
    const noteColumns = await db.execute('PRAGMA table_info(Notas)');
    if (!noteColumns.rows.some(column => column.name === 'is_completed')) {
        await db.execute('ALTER TABLE Notas ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0');
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
    const finalNoteColumns = await db.execute('PRAGMA table_info(Notas)');
    if (!finalNoteColumns.rows.some(column => column.name === 'created_at')) {
        await db.execute('ALTER TABLE Notas ADD COLUMN created_at TEXT');
    }
}

const workspaceSchemaReady = initializeWorkspaceSchema();

// ==========================================
// RUTAS DE AUTENTICACIÓN (Appwrite Auth)
// ==========================================

// POST: Registro de usuario en Appwrite Auth + envío de correo de verificación
app.post('/api/register', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || username.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 72) {
        return res.status(400).json({ success: false, error: 'Ingresa un usuario válido, correo electrónico y una contraseña de al menos 8 caracteres.' });
    }

    if (!APPWRITE_PROJECT_ID) {
        return res.status(503).json({ success: false, error: 'La autenticación no está configurada (falta APPWRITE_PROJECT_ID).' });
    }

    try {
        const client = createAppwriteClient();
        const account = new Account(client);

        // 1. Crear usuario en Appwrite Auth (Account)
        const user = await account.create(ID.unique(), email, password, username);

        // 2. Iniciar sesión automáticamente en Appwrite
        const { session, token } = await createAppwriteEmailSession(email, password);

        // 3. Crear cliente con sesión para disparar verificación de correo
        const sessionClient = createAppwriteClient(token);
        const sessionAccount = new Account(sessionClient);

        // URL de confirmación dinámica para evitar CORS y rutas rotas (local y Vercel)
        const confirmationUrl = `${getAppOrigin(req)}/verify.html`;
        let verificationSent = false;
        try {
            await sessionAccount.createVerification(confirmationUrl);
            verificationSent = true;
        } catch (verifErr) {
            console.error('Aviso: no se pudo enviar correo de verificación:', verifErr.message);
        }

        // 4. Registrar o vincular user.$id en Turso de forma segura (INSERT OR IGNORE)
        if (db) {
            await workspaceSchemaReady;
            await db.execute({
                sql: `INSERT OR IGNORE INTO Usuarios (appwrite_id, username, email, password_hash, created_at)
                      VALUES (?, ?, ?, '', datetime('now'))`,
                args: [user.$id, username, email]
            });
        }

        // 5. Guardar sesión en cookie httpOnly segura
        setSessionCookie(req, res, token);

        res.status(201).json({
            success: true,
            message: verificationSent
                ? '¡Cuenta creada! Te hemos enviado un correo de verificación. Revisa tu bandeja de entrada.'
                : '¡Cuenta creada con éxito!',
            verificationSent,
            user: { id: user.$id, username: user.name || username, email: user.email }
        });
    } catch (error) {
        console.error('Error al registrar en Appwrite:', error);
        const msg = String(error.message || '');
        if (msg.includes('already exists') || error.code === 409) {
            return res.status(409).json({ success: false, error: 'Ese correo ya está registrado.' });
        }
        res.status(error.code && error.code >= 400 && error.code < 500 ? error.code : 500).json({
            success: false,
            error: error.message || 'No se pudo completar el registro.'
        });
    }
});

// POST: Inicio de sesión con Appwrite + guardado en cookie httpOnly
app.post('/api/login', async (req, res) => {
    const identifier = typeof req.body?.username === 'string' ? req.body.username.trim() : (typeof req.body?.email === 'string' ? req.body.email.trim() : '');
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
        return res.status(400).json({ success: false, error: 'Ingresa tu usuario o correo electrónico y contraseña.' });
    }

    if (!APPWRITE_PROJECT_ID) {
        return res.status(503).json({ success: false, error: 'La autenticación no está configurada (falta APPWRITE_PROJECT_ID).' });
    }

    try {
        let email = identifier.toLowerCase();

        // Si el usuario ingresó un nombre de usuario en lugar de correo, buscar su correo en Turso
        if (!email.includes('@') && db) {
            await workspaceSchemaReady;
            const userRow = await db.execute({
                sql: 'SELECT email FROM Usuarios WHERE lower(username) = lower(?) LIMIT 1',
                args: [identifier]
            });
            if (userRow.rows.length > 0 && userRow.rows[0].email) {
                email = String(userRow.rows[0].email).toLowerCase();
            }
        }

        const client = createAppwriteClient();
        const account = new Account(client);

        // 1. Autenticar con Appwrite
        const { session, token } = await createAppwriteEmailSession(email, password);

        // 2. Obtener datos del usuario con la sesión creada
        const sessionClient = createAppwriteClient(token);
        const sessionAccount = new Account(sessionClient);
        const user = await sessionAccount.get();

        // 3. Registrar o vincular user.$id en Turso (INSERT OR IGNORE)
        if (db) {
            await workspaceSchemaReady;
            await db.execute({
                sql: `INSERT OR IGNORE INTO Usuarios (appwrite_id, username, email, password_hash, created_at)
                      VALUES (?, ?, ?, '', datetime('now'))`,
                args: [user.$id, user.name || identifier, user.email]
            });
            await db.execute({
                sql: `UPDATE Usuarios SET appwrite_id = ? WHERE lower(email) = lower(?) AND (appwrite_id IS NULL OR appwrite_id = '')`,
                args: [user.$id, user.email]
            });
        }

        // 4. Guardar la sesión en una cookie httpOnly segura
        setSessionCookie(req, res, token);

        res.status(200).json({
            success: true,
            message: 'Inicio de sesión exitoso',
            user: { id: user.$id, username: user.name || identifier, email: user.email }
        });
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(401).json({
            success: false,
            error: 'Usuario o contraseña incorrectos, o sesión rechazada.'
        });
    }
});

// GET: Consultar sesión activa verificada por Appwrite
app.get('/api/session', async (req, res) => {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'No hay sesión activa.' });

    try {
        const user = await verifyAppwriteSession(token);
        if (!user || !user.$id) {
            clearSessionCookie(req, res);
            return res.status(401).json({ success: false, error: 'La sesión no es válida o expiró.' });
        }
        res.json({
            success: true,
            user: {
                id: user.$id,
                username: user.name || user.email.split('@')[0],
                email: user.email,
                emailVerification: user.emailVerification
            }
        });
    } catch (error) {
        console.error('Error al consultar sesión:', error);
        clearSessionCookie(req, res);
        res.status(401).json({ success: false, error: 'La sesión no es válida.' });
    }
});

// POST: Cerrar sesión
app.post('/api/logout', async (req, res) => {
    const token = getSessionToken(req);
    if (token) {
        sessionCache.delete(token);
        try {
            if (APPWRITE_PROJECT_ID) {
                const client = createAppwriteClient(token);
                const account = new Account(client);
                await account.deleteSession('current').catch(() => {});
            }
        } catch {}
    }
    clearSessionCookie(req, res);
    res.json({ success: true, message: 'Sesión cerrada correctamente.' });
});

// POST: Confirmar verificación de correo en Appwrite Auth
app.post('/api/verify', async (req, res) => {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';

    if (!userId || !secret) {
        return res.status(400).json({ success: false, error: 'Parámetros incompletos (se requiere userId y secret).' });
    }

    try {
        const client = createAppwriteClient();
        const account = new Account(client);
        await account.updateVerification(userId, secret);
        res.json({ success: true, message: '¡Correo verificado con éxito!' });
    } catch (error) {
        console.error('Error al verificar correo:', error);
        res.status(400).json({ success: false, error: error.message || 'El enlace de verificación expiró o no es válido.' });
    }
});

// POST: Reenviar correo de verificación
app.post('/api/resend-verification', async (req, res) => {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Inicia sesión para reenviar la verificación.' });

    try {
        const client = createAppwriteClient(token);
        const account = new Account(client);
        const confirmationUrl = `${getAppOrigin(req)}/verify.html`;
        await account.createVerification(confirmationUrl);
        res.json({ success: true, message: 'Correo de verificación reenviado.' });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message || 'No se pudo reenviar el correo.' });
    }
});

// ──────────────────────────────────────────────
// Middleware: verificar configuración de DB en Turso
// ──────────────────────────────────────────────
app.use('/api', (req, res, next) => {
    if (!db) {
        return res.status(503).json({ error: 'Las variables TURSO_DATABASE_URL y TURSO_AUTH_TOKEN no están configuradas en el servidor.' });
    }
    next();
});

// ──────────────────────────────────────────────
// Middleware: autenticación en el servidor (node-appwrite)
// y vinculación de datos por user.$id (TEXT) en Turso
// ──────────────────────────────────────────────
app.use('/api', async (req, res, next) => {
    try {
        await workspaceSchemaReady;
    } catch (error) {
        console.error('No se pudo preparar la base de datos:', error);
        return res.status(500).json({ error: 'No se pudo preparar la base de datos.' });
    }

    const token = getSessionToken(req);
    if (!token) {
        return res.status(401).json({ success: false, error: 'Sesión requerida. Por favor, inicia sesión.' });
    }

    try {
        const user = await verifyAppwriteSession(token);
        if (!user || !user.$id) {
            clearSessionCookie(req, res);
            return res.status(401).json({ success: false, error: 'Sesión no válida o expirada. Inicia sesión nuevamente.' });
        }

        req.user = user;
        req.userId = user.$id;
        // Vinculación estricta de registros de negocio por user.$id (TEXT) en Turso
        req.workspaceId = user.$id;

        // Migración transparente de notas creadas en sesión previa de navegador si aplica
        const browserWorkspaceId = req.get('X-Workspace-Id');
        if (browserWorkspaceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(browserWorkspaceId)) {
            db.execute({
                sql: 'UPDATE Notas SET owner_id = ? WHERE owner_id = ?',
                args: [user.$id, browserWorkspaceId]
            }).catch(() => {});
            db.execute({
                sql: 'UPDATE Categorias SET owner_id = ? WHERE owner_id = ?',
                args: [user.$id, browserWorkspaceId]
            }).catch(() => {});
        }

        next();
    } catch (error) {
        console.error('Error al verificar sesión con Appwrite:', error.message);
        clearSessionCookie(req, res);
        return res.status(401).json({ success: false, error: error.message || 'No se pudo validar la sesión con Appwrite.' });
    }
});

// GET: Obtener todas las notas activas (no en papelera)
app.get('/api/notes', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, is_completed, assigned_at, due_at, created_at FROM Notas WHERE owner_id = ? AND in_trash = 0 ORDER BY id DESC',
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

// Marcar una nota como completada o volver a dejarla pendiente.
app.patch('/api/notes/:id/completed', async (req, res) => {
    const value = req.body.is_completed === true || req.body.is_completed === 1 || req.body.is_completed === '1' ? 1 : 0;
    try {
        const result = await db.execute({
            sql: 'UPDATE Notas SET is_completed = ? WHERE id = ? AND owner_id = ?',
            args: [value, req.params.id, req.workspaceId]
        });
        if (!result.rowsAffected) return res.status(404).json({ error: 'No se encontró la nota.' });
        res.json({ success: true, is_completed: value });
    } catch (error) {
        console.error('Error al actualizar estado de nota:', error);
        res.status(500).json({ error: 'No se pudo actualizar el estado de la nota.' });
    }
});

// Alternar el estado de una tarea dentro de una nota.
app.patch('/api/subtasks/:id/completed', async (req, res) => {
    const value = req.body.is_completed === true || req.body.is_completed === 1 || req.body.is_completed === '1' ? 1 : 0;
    try {
        const result = await db.execute({
            sql: 'UPDATE Subtareas SET is_completed = ? WHERE id = ? AND owner_id = ?',
            args: [value, req.params.id, req.workspaceId]
        });
        if (!result.rowsAffected) return res.status(404).json({ error: 'No se encontró la tarea.' });
        res.json({ success: true, is_completed: value });
    } catch (error) {
        console.error('Error al actualizar estado de tarea:', error);
        res.status(500).json({ error: 'No se pudo actualizar la tarea.' });
    }
});

// GET: Obtener notas marcadas como favoritas
app.get('/api/favorites', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT id, title, content, color, category, is_favorite, in_trash, is_completed, assigned_at, due_at FROM Notas WHERE owner_id = ? AND in_trash = 0 AND is_favorite = 1 ORDER BY id DESC',
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

    let tx;
    try {
        tx = await db.transaction('write');
        const result = await tx.execute({
            sql: 'UPDATE Notas SET is_favorite = ? WHERE id = ? AND owner_id = ?',
            args: [val, id, req.workspaceId]
        });
        if (result.rowsAffected === 0) return res.status(404).json({ success: false, error: 'No se encontró la nota en este espacio de trabajo.' });
        if (val) {
            await tx.execute({
                sql: `INSERT OR REPLACE INTO Favoritos (id, title, content, color, owner_id)
                      SELECT id, title, content, color, owner_id FROM Notas WHERE id = ? AND owner_id = ?`,
                args: [id, req.workspaceId]
            });
        } else {
            await tx.execute({ sql: 'DELETE FROM Favoritos WHERE id = ? AND owner_id = ?', args: [id, req.workspaceId] });
        }
        await tx.commit();
        res.json({ success: true, id, is_favorite: val });
    } catch (error) {
        if (tx && !tx.closed) await tx.rollback().catch(() => {});
        console.error('Error al actualizar favorito:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (tx) tx.close();
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

    let tx;
    try {
        tx = await db.transaction('write');
        const result = await tx.execute({
            sql: 'UPDATE Notas SET in_trash = ? WHERE id = ? AND owner_id = ?',
            args: [val, id, req.workspaceId]
        });
        if (result.rowsAffected === 0) return res.status(404).json({ success: false, error: 'No se encontró la nota en este espacio de trabajo.' });
        if (val) {
            await tx.execute({
                sql: `INSERT OR REPLACE INTO Papelera (id, title, content, color, owner_id)
                      SELECT id, title, content, color, owner_id FROM Notas WHERE id = ? AND owner_id = ?`,
                args: [id, req.workspaceId]
            });
        } else {
            await tx.execute({ sql: 'DELETE FROM Papelera WHERE id = ? AND owner_id = ?', args: [id, req.workspaceId] });
        }
        await tx.commit();
        res.json({ success: true, id, in_trash: val });
    } catch (error) {
        if (tx && !tx.closed) await tx.rollback().catch(() => {});
        console.error('Error al mover/restaurar papelera:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (tx) tx.close();
    }
};
app.put('/api/notes/:id/trash', handleTrash);
app.patch('/api/notes/:id/trash', handleTrash);

// DELETE: Eliminar permanentemente una nota de la BD
app.delete('/api/notes/:id', async (req, res) => {
    const { id } = req.params;
    let tx;
    try {
        tx = await db.transaction('write');
        const existing = await tx.execute({
            sql: 'SELECT id FROM Notas WHERE id = ? AND owner_id = ?',
            args: [id, req.workspaceId]
        });
        if (!existing.rows[0]) return res.status(404).json({ error: 'No se encontró la nota en este espacio de trabajo.' });
        await tx.execute({ sql: 'DELETE FROM Favoritos WHERE id = ? AND owner_id = ?', args: [id, req.workspaceId] });
        await tx.execute({ sql: 'DELETE FROM Papelera WHERE id = ? AND owner_id = ?', args: [id, req.workspaceId] });
        const subtaskWhere = subtasksNoteIdColumns.map(column => `${column} = ?`).join(' OR ');
        await tx.execute({ sql: `DELETE FROM Subtareas WHERE (${subtaskWhere}) AND owner_id = ?`, args: [...subtasksNoteIdColumns.map(() => id), req.workspaceId] });
        const reminderWhere = remindersNoteIdColumns.map(column => `${column} = ?`).join(' OR ');
        await tx.execute({ sql: `DELETE FROM Recordatorios WHERE (${reminderWhere}) AND owner_id = ?`, args: [...remindersNoteIdColumns.map(() => id), req.workspaceId] });
        await tx.execute({ sql: 'DELETE FROM Notas WHERE id = ? AND owner_id = ?', args: [id, req.workspaceId] });
        await tx.commit();
        res.json({ success: true, message: 'Nota eliminada permanentemente' });
    } catch (error) {
        if (tx && !tx.closed) await tx.rollback().catch(() => {});
        console.error('Error al eliminar nota:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (tx) tx.close();
    }
});

// PUT / PATCH: Mover o asignar nota a una carpeta (Jalar nota)
const handleNoteCategory = async (req, res) => {
    const { id } = req.params;
    const { category } = req.body;
    try {
        const result = await db.execute({
            sql: 'UPDATE Notas SET category = ? WHERE id = ? AND owner_id = ?',
            args: [category || 'General', id, req.workspaceId]
        });
        if (result.rowsAffected === 0) {
            return res.status(404).json({ success: false, error: 'No se encontró la nota en este espacio de trabajo.' });
        }
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
    let tx;
    try {
        tx = await db.transaction('write');
        const currentResult = await tx.execute({
            sql: `SELECT ${categoryIdColumn} AS id, ${categoryNameColumn} AS name FROM Categorias WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
            args: [id, req.workspaceId]
        });
        const current = currentResult.rows[0];
        if (!current) {
            await tx.rollback();
            return res.status(404).json({ error: 'No se encontró la carpeta' });
        }
        const duplicate = await tx.execute({
            sql: `SELECT ${categoryIdColumn} AS id FROM Categorias WHERE owner_id = ? AND lower(${categoryNameColumn}) = lower(?) AND ${categoryIdColumn} <> ? LIMIT 1`,
            args: [req.workspaceId, name, id]
        });
        if (duplicate.rows.length > 0) {
            await tx.rollback();
            return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
        }
        await tx.execute({
            sql: `UPDATE Categorias SET ${categoryNameColumn} = ? WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
            args: [name, id, req.workspaceId]
        });
        await tx.execute({
            sql: 'UPDATE Notas SET category = ? WHERE owner_id = ? AND lower(category) = lower(?)',
            args: [name, req.workspaceId, current.name]
        });
        await tx.commit();
        res.json({ success: true, id, name, message: 'Carpeta actualizada' });
    } catch (error) {
        if (tx && !tx.closed) await tx.rollback().catch(() => {});
        console.error('Error al actualizar carpeta:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (tx) tx.close();
    }
});

// DELETE: Eliminar categoría / carpeta
app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    let tx;
    try {
        tx = await db.transaction('write');
        const result = await tx.execute({
            sql: `SELECT ${categoryNameColumn} AS name FROM Categorias WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
            args: [id, req.workspaceId]
        });
        const folder = result.rows[0];
        if (!folder) {
            await tx.rollback();
            return res.status(404).json({ error: 'No se encontró la carpeta' });
        }
        await tx.execute({
            sql: 'UPDATE Notas SET category = ? WHERE owner_id = ? AND lower(category) = lower(?)',
            args: ['', req.workspaceId, folder.name]
        });
        await tx.execute({
            sql: `DELETE FROM Categorias WHERE ${categoryIdColumn} = ? AND owner_id = ?`,
            args: [id, req.workspaceId]
        });
        await tx.commit();
        res.json({ success: true, message: 'Carpeta eliminada' });
    } catch (error) {
        if (tx && !tx.closed) await tx.rollback().catch(() => {});
        console.error('Error al eliminar categoría:', error);
        res.status(500).json({ error: error.message });
    } finally {
        if (tx) tx.close();
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
