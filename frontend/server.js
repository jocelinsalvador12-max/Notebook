import { createClient } from '@libsql/client';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Conexión a tu base de datos en Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Endpoint para guardar una nueva nota
app.post('/api/notes', async (req, res) => {
    const { title, content, color } = req.body;

    try {
        const result = await db.execute({
            sql: 'INSERT INTO notes (title, content, color, date) VALUES (?, ?, ?, ?)',
            args: [title, content, color, new Date().toISOString()],
        });

        res.status(201).json({ success: true, id: Number(result.lastInsertRowid) });
    } catch (error) {
        console.error('Error al insertar en Turso:', error);
        res.status(500).json({ error: 'Error al guardar la nota' });
    }
});

app.listen(3000, () => console.log('Servidor corriendo en puerto 3000'));