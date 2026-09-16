const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.use(express.json());

// Configuración de Swagger
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Notebook API',
            version: '1.0.0',
            description: 'Documentación interactiva de la API de Notas'
        },
        servers: [
            {
                url: 'http://localhost:8000/api'
            }
        ],
        paths: {
            '/notes': {
                get: {
                    summary: 'Obtener todas las notas',
                    responses: {
                        '200': {
                            description: 'Lista de notas obtenida con éxito'
                        }
                    }
                },
                post: {
                    summary: 'Crear una nueva nota',
                    responses: {
                        '201': {
                            description: 'Nota creada con éxito'
                        }
                    }
                }
            }
        }
    },
    apis: [path.join(__dirname, '*.js')]
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Rutas de la API
app.get('/api/notes', (req, res) => {
    res.json([
        { id: 1, title: 'Nota de prueba', content: 'Funciona Swagger', color: 'card-peach' }
    ]);
});

app.post('/api/notes', (req, res) => {
    res.status(201).json({ message: 'Nota guardada' });
});

// Iniciar servidor
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Swagger disponible en http://localhost:${PORT}/docs`);
});

const swaggerSpec = {
    openapi: '3.0.0',
    info: {
        title: 'Notebook API',
        version: '1.0.0',
        description: 'Documentación interactiva de la API de Notas'
    },
    servers: [
        {
            url: 'http://localhost:8000/api'
        }
    ],
    paths: {
        '/notes': {
            get: {
                summary: 'Obtener todas las notas activas',
                responses: { '200': { description: 'Lista de notas' } }
            },
            post: {
                summary: 'Crear una nueva nota',
                responses: { '201': { description: 'Nota creada' } }
            }
        },
        '/favorites': {
            get: {
                summary: 'Obtener notas favoritas',
                responses: { '200': { description: 'Lista de favoritas' } }
            }
        },
        '/trash': {
            get: {
                summary: 'Obtener notas en la papelera',
                responses: { '200': { description: 'Lista de papelera' } }
            }
        },
        '/notes/{id}/favorite': {
            put: {
                summary: 'Marcar o desmarcar como favorita',
                responses: { '200': { description: 'Estado actualizado' } }
            }
        },
        '/notes/{id}/trash': {
            put: {
                summary: 'Mover a la papelera o restaurar',
                responses: { '200': { description: 'Estado actualizado' } }
            }
        },
        '/notes/{id}': {
            delete: {
                summary: 'Eliminar nota permanentemente',
                responses: { '200': { description: 'Nota eliminada' } }
            }
        }
    }
};