import { defineConfig } from 'vite';
// Both independent entries are published; the game keeps its original entry.
export default defineConfig({build:{rollupOptions:{input:{game:'index.html',vfx:'vfx-demo.html'}}}});
