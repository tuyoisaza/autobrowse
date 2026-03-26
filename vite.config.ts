import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        'electron', 
        'sql.js', 
        'playwright', 
        'pino', 
        'fs', 
        'path', 
        'os', 
        'crypto',
        'fastify',
        '@fastify/cors',
        'uuid'
      ]
    },
    minify: false
  }
});