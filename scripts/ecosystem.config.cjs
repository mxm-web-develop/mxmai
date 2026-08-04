/** pm2 生产进程（工作目录 = monorepo 根目录 /opt/supermxmai） */
module.exports = {
  apps: [
    {
      name: 'gateway',
      cwd: __dirname + '/..',
      script: 'gateway/dist/index.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mxmauth',
      cwd: __dirname + '/..',
      script: 'mxmauth/dist/index.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mxmpay',
      cwd: __dirname + '/..',
      script: 'mxmpay/dist/index.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mxmcgi-api',
      cwd: __dirname + '/..',
      script: 'mxmcgi/dist/index.js',
      env: { NODE_ENV: 'production', MXMCGI_ROLE: 'api', GSAP_REVIEW_MAX_CONCURRENT: '1' },
    },
    {
      name: 'mxmcgi-worker',
      cwd: __dirname + '/..',
      script: 'mxmcgi/dist/worker.js',
      env: {
        NODE_ENV: 'production',
        MXMCGI_ROLE: 'worker',
        // Ubuntu 26.04：Playwright 1.59 尚无官方 build，用 24.04 二进制 + 本机 deps
        PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: 'ubuntu24.04-x64',
        GSAP_RENDER_MAX_CONCURRENT: '1',
        GSAP_REVIEW_MAX_CONCURRENT: '1',
        VIDEO_EDIT_CLIP_CONCURRENCY: '2',
      },
    },
    {
      name: 'mxmcgi-scheduler',
      cwd: __dirname + '/..',
      script: 'mxmcgi/dist/scheduler.js',
      env: { NODE_ENV: 'production', MXMCGI_ROLE: 'scheduler' },
    },
    {
      name: 'mxmnotify',
      cwd: __dirname + '/..',
      script: 'mxmnotify/dist/index.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'pptx-compiler',
      cwd: __dirname + '/../mxmcgi/tools/pptx-compiler',
      script: 'server.py',
      // PEP 668: production venv at /.venv-pptx-compiler
      interpreter: __dirname + '/../.venv-pptx-compiler/bin/python',
      env: {
        NODE_ENV: 'production',
        PPTX_COMPILER_HOST: '127.0.0.1',
        PPTX_COMPILER_PORT: '4010',
        PPTX_COMPILER_WORKERS: '4',
      },
    },
  ],
};
