import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';
import path from 'path';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const gatewayProxy =
  process.env.OPEN_API_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_OPEN_API_BASE?.trim() ||
  'http://localhost:3000';

/** monorepo 兄弟包：dev 时勿纳入 watch，避免 EMFILE 导致路由无法发现 */
const MONOREPO_SIBLINGS = [
  'gateway',
  'mxmauth',
  'mxmcgi',
  'mxmdata',
  'mxmnotify',
  'mxmpay',
  'web',
];
const monorepoRoot = path.join(__dirname, '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** 国内副机内存有限：standalone 自带最小 node_modules，避免服务器 npm install */
  output: 'standalone',
  /** Turbopack 根目录 = pnpm monorepo 根，避免误选 ~/package-lock.json */
  turbopack: {
    root: monorepoRoot,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  /** 仅 production build 需要向上 trace；dev 设此项会扩大 watch 范围 */
  ...(process.env.NODE_ENV === 'production'
    ? { outputFileTracingRoot: monorepoRoot }
    : {}),
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      const ignored = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        ...MONOREPO_SIBLINGS.map((pkg) => path.join(monorepoRoot, pkg)),
      ];
      config.watchOptions = {
        ...config.watchOptions,
        ignored,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  /** 浏览器走同源 /api → Gateway，避免 localhost:3100 跨域被 CORS 拦截 */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${gatewayProxy.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
  env: {
    NEXT_PUBLIC_MXM_API_KEY:
      process.env.NEXT_PUBLIC_MXM_API_KEY ?? process.env.MXMTOKEN ?? '',
    NEXT_PUBLIC_API_MODE:
      process.env.NEXT_PUBLIC_API_MODE ?? (process.env.MXMTOKEN ? 'http' : 'mock'),
    /** 留空则 H5 用 window.location.origin + 上方 rewrites 代理 */
    NEXT_PUBLIC_OPEN_API_BASE: process.env.NEXT_PUBLIC_OPEN_API_BASE ?? '',
    NEXT_PUBLIC_OPEN_API_USE_PROXY: process.env.NEXT_PUBLIC_OPEN_API_USE_PROXY ?? 'true',
  },
};

export default withSerwist(nextConfig);
