import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    root: 'src/frontend',
    plugins: [
        tailwindcss(),
    ],
    server: {
        port: 3000,
        proxy: {
            '/api': 'http://localhost:5080',
            '/docs': 'http://localhost:5080'
        }
    },
    build: {
        outDir: '../../dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'src/frontend/app.html'),
                landing: resolve(__dirname, 'src/frontend/index.html'),
                login: resolve(__dirname, 'src/frontend/login/index.html'),
                favoritos: resolve(__dirname, 'src/frontend/favoritos.html'),
                categorias: resolve(__dirname, 'src/frontend/categorias.html'),
                papelera: resolve(__dirname, 'src/frontend/papelera.html'),
            }
        }
    }
});
