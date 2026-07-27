import { defineConfig } from 'tsup';
import { cwd } from 'process';
import { resolve } from 'path';

const entry = process.env.TSUP_ENTRY || 'src/index.ts';
// 检查当前工作目录是否包含 mxmdata（用于判断是否为 mxmdata 包）
const isMxmdata = cwd().includes('mxmdata');

export default defineConfig({
  entry: [entry],
  format: ['cjs'],
  target: 'node18',
  sourcemap: true,
  clean: process.env.TSUP_CLEAN !== 'false',
  minify: false,
  // 为 mxmdata 包生成类型声明文件，其他包不需要
  // 使用更宽松的配置以允许一些类型错误
  dts: isMxmdata ? {
    resolve: true,
  } : false,
  external: ['@mxmai/mxmdata', 'bcrypt', '@aws-sdk/client-s3', '@aws-sdk/node-http-handler', '@aws-sdk/smithy-client'], // 将内部包和原生模块标记为外部依赖
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development'
  },
  // 排除 .md 文件，避免动态导入时出错
  loader: {
    '.md': 'text',
  },
  // 排除 .md 文件不被打包
  noExternal: [],
  // 忽略 .md 文件
  ignoreWatch: ['**/*.md'],
});
