# 国内 H5 副机部署 — 参考

## 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/deploy-h5-china.sh` | 构建 + rsync + pm2 + nginx |
| `scripts/install-h5-china-server.sh` | 服务器一次性装 Node/pnpm/pm2/nginx |
| `scripts/ecosystem-h5-china.config.cjs` | pm2 配置（复制到部署目录） |
| `scripts/nginx/eshop-h5-china.conf` | Nginx 反代 80→3100 |
| `eshop-agentic-h5/.env.production.example` | 生产 env 模板 |

## SSH

```bash
ssh root@8.136.186.242
```

密码与主力服务器相同（勿写入仓库）。

## 手动发布（不用脚本）

```bash
# 本地
export OPEN_API_PROXY_TARGET=http://121.43.32.168
source eshop-agentic-h5/.env
pnpm --filter eshop-agentic-h5 build

rsync -az --delete --exclude node_modules eshop-agentic-h5/ root@8.136.186.242:/opt/eshop-agentic-h5/

# 服务器
ssh root@8.136.186.242
cd /opt/eshop-agentic-h5
npm install --omit=dev
pm2 start ecosystem.config.cjs
```

## 回滚

```bash
# 保留上一份 .next 备份后
ssh root@8.136.186.242 'cd /opt/eshop-agentic-h5 && pm2 restart eshop-h5'
```

## 恢复 zencheck（如需）

```bash
ssh root@8.136.186.242 'pm2 stop eshop-h5; systemctl stop nginx'
ssh root@8.136.186.242 'cd /opt/zencheck && docker compose up -d'
```

## 日志

```bash
ssh root@8.136.186.242 'pm2 logs eshop-h5 --lines 50'
ssh root@8.136.186.242 'tail -50 /var/log/nginx/error.log'
```
