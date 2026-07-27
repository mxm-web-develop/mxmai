# 杭州 → 香港 主力机迁移

## 架构说明

| 组件 | 迁移方式 |
|------|----------|
| 应用代码 + node_modules + dist | `tar` 管道全量同步 `/opt/supermxmai` |
| MinIO 对象（aigc / user-assets / system-assets） | 同步 `/opt/minio/data` |
| **FunASR ModelScope 缓存** | 同步 `/root/.cache/modelscope`（约 1.3GB，**必迁**，否则视频 ASR 在线下载易 600s 超时） |
| 生产 `.env` | 随应用目录一并复制，脚本自动改 `PUBLIC_GATEWAY_ORIGIN` |
| Supabase Cloud | **不迁移**（连接串不变） |
| Redis | 香港本机新实例（无持久化状态需迁） |

## 前置条件

1. 香港 ECS 已创建（当前：`8.218.14.129`，SSH Port **2222**）
2. **安全组放行**：TCP 22（你的办公 IP）、80、443
3. 本机已安装 `sshpass`：`brew install sshpass`（macOS）
4. 杭州机可 SSH（当前 `121.43.32.168`）

## 一键迁移

```bash
# 项目根目录 — 密码通过环境变量传入，勿写入 git
SOURCE_SSH_PASS='杭州root密码' \
TARGET_SSH_PASS='香港root密码' \
bash scripts/migrate-hangzhou-to-hongkong.sh
```

可选参数：

```bash
# 仅重新验收香港机
TARGET_SSH_PASS='...' bash scripts/migrate-hangzhou-to-hongkong.sh --verify-only

# 只迁代码/env，不拷 MinIO（对象已在香港）
SOURCE_SSH_PASS='...' TARGET_SSH_PASS='...' \
  bash scripts/migrate-hangzhou-to-hongkong.sh --skip-data

# 仅同步 FunASR 模型缓存（杭州仍在、香港缺 ASR 时用）
bash scripts/sync-funasr-modelscope-cache.sh
# 或：pnpm sync:funasr-cache
```

或使用 pnpm：

```bash
SOURCE_SSH_PASS='...' TARGET_SSH_PASS='...' pnpm migrate:hz-to-hk
```

## 迁移后验收清单

- [ ] `curl https://mxm-ai.com/health` 或 `curl -H 'Host: mxm-ai.com' http://8.218.14.129/health` 返回 OK
- [ ] 浏览器打开 Admin Web 可登录
- [ ] 创建一条图文任务，完成后媒体可预览（MinIO）
- [ ] 历史任务媒体仍可访问（MinIO 数据已同步）
- [ ] `pm2 list` 七进程均为 online
- [ ] `ffprobe -version` 可用（口播分镜 / 视频拼接依赖 ffmpeg）
- [ ] `du -sh /root/.cache/modelscope` ≥ 1GB，且 `find ... -name model.pt | wc -l` ≥ 3（FunASR ASR）
- [ ] H5 副机反代更新：`OPEN_API_PROXY_TARGET=https://mxm-ai.com pnpm deploy:h5-china`

## 切流量与回滚

**切流量**：DNS / 域名指向香港 IP → 更新 H5 反代 → 观察 24～48h → 退订杭州 ECS。

**回滚**：域名指回 `121.43.32.168`（杭州未下线前仍可用）。

## 故障排查

| 现象 | 处理 |
|------|------|
| SSH 香港超时 | 阿里云控制台 → 安全组 → 入方向添加 TCP 22 |
| `/health` 502 | `ssh mxm-hk 'pm2 logs gateway --lines 80'` |
| 媒体 404 | 检查 MinIO：`curl http://127.0.0.1:9000/minio/health/live`；`du -sh /opt/minio/data` |
| Supabase 连不上 | `.env` 中 `SUPABASE_URL` 应为 `https://*.supabase.co`，非 localhost |
| 视频任务 `spawn ffprobe ENOENT` | 香港机缺 ffmpeg：`apt-get install -y ffmpeg`，无需重启 pm2（PATH 即时生效） |
| 视频任务 `FunASR 超时（600000ms）` | 缺 ModelScope 缓存：`bash scripts/sync-funasr-modelscope-cache.sh`（杭州→香港 rsync，勿经本机管道） |
