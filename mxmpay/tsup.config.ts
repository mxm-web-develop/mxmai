/// <reference types="tsup" />
/// <reference types="node" />
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: ['fs', 'path', 'os', 'url', 'stream', 'util', 'events', 'buffer', 'process'],
});
