import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.js'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  outDir: 'dist',
  platform: 'neutral', // Important for both browser and node
  external: ['node:fs/promises'], // Treat node built-ins as external
});
