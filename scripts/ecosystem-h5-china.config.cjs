/** pm2：国内 H5 节点（Next.js standalone，cwd = standalone/eshop-agentic-h5） */
module.exports = {
  apps: [
    {
      name: 'eshop-h5',
      cwd: `${__dirname}/eshop-agentic-h5`,
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
        HOSTNAME: '127.0.0.1',
      },
      max_memory_restart: '512M',
    },
  ],
};
