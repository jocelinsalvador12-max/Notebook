import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: 'src/frontend',
    server: {
        port: 3000,
        proxy: {
            '/api': 'http://localhost:8000',
            '/docs': 'http://localhost:8000'
        }
    },
    build: {
        outDir: '../../dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'src/frontend/index.html'),
                favoritos: resolve(__dirname, 'src/frontend/favoritos.html'),
                categorias: resolve(__dirname, 'src/frontend/categorias.html'),
                papelera: resolve(__dirname, 'src/frontend/papelera.html'),
            }
        }
    }
});