# 主力服务器部署 — 参考

## 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/deploy-to-server.sh` | 构建 + rsync + pm2（支持 `--with-setup`） |
| `scripts/bootstrap-server.sh` | 服务器一次性装 Node/pnpm/pm2/nginx/redis |
| `scripts/nginx/supermxmai.conf` | Nginx：Web SPA + `/api` → Gateway |
| `scripts/ecosystem.config.cjs` | pm2 六进程配置 |
| `scripts/build-prod.sh` | 本地生产构建 |

## SSH

```bash
ssh root@121.43.32.168
```

密码与副机 H5 服务器相同（勿写入仓库）。首次可用 `DEPLOY_SSH_PASS` + `sshpass` 部署并自动写入公钥。

## 手动首次初始化

```bash
# 本地
DEPLOY_SSH_PASS='...' pnpm deploy:server -- --setup-only

# 或登录服务器后
sudo bash /tmp/bootstrap-server.sh
```

## 手动发布（不用脚本）

```bash
pnpm build:prod
DEPLOY_HOST=root@121.43.32.168 pnpm deploy:server -- --skip-build
```

## 回滚

```bash
ssh root@121.43.32.168 'cd /opt/supermxmai && pm2 reload scripts/ecosystem.config.cjs'
```

## 日志

```bash
ssh root@121.43.32.168 'pm2 logs gateway --lines 50'
ssh root@121.43.32.168 'pm2 logs mxmcgi-api --lines 50'
ssh root@121.43.32.168 'tail -50 /var/log/nginx/error.log'
```

## 本地 MinIO（Docker，替代 R2 上传）

```bash
# 主力机 root 执行（使用 DaoCloud 镜像加速，不下载二进制）
bash /opt/supermxmai/scripts/install-minio-docker.sh
bash /opt/supermxmai/scripts/patch-env-minio-local.sh /opt/supermxmai/.env
cd /opt/supermxmai && pm2 reload all --update-env
```

- 数据目录：`/opt/minio/data`
- 仅监听 `127.0.0.1:9000`（经 Gateway 代理对外）
- 凭证：`/etc/default/minio`
- 桶：`aigc` / `user-assets` / `system-assets`

## 从日本机（8.216.100.106）迁移检查清单

- [ ] 主力机 `pnpm deploy:server -- --with-setup` 成功
- [ ] `curl http://121.43.32.168/health` 返回 OK
- [ ] 根 `.env` 中 `PUBLIC_GATEWAY_ORIGIN` 更新为新 IP（若使用公网媒体 URL）
- [ ] `pnpm deploy:h5-china` 重发 H5（反代新 Gateway）
- [ ] 日本 ECS 退订释放（避免双机计费）
