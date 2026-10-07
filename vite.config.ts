import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 8080 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          matter: ['matter-js'],
        },
      },
    },
  },
});
