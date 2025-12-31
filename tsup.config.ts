import { defineConfig } from 'tsup';

const entry = process.env.TSUP_ENTRY || 'src/index.ts';

export default defineConfig({
  entry: [entry],
  format: ['cjs'],
  target: 'node18',
  sourcemap: true,
  clean: true,
  minify: false,
  dts: false,
  external: ['@mxmai/mxmdata'], // 将内部包标记为外部依赖
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});
