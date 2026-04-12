import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts']
    }
  },
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