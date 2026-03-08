# 知识库接口故障排查

## 问题：504 Gateway Timeout

### 错误信息
```
Error occurred while trying to proxy: localhost:3000/knowledge
```

### 可能原因

1. **mxmcgi 服务未运行**
   - Gateway 无法连接到 `http://localhost:4003`
   - 检查：`lsof -ti:4003` 或 `curl http://localhost:4003/health`

2. **环境变量配置错误**
   - `MXMCGI_URL` 未设置或设置错误
   - Gateway 默认使用 `http://localhost:4003`

3. **端口冲突**
   - mxmcgi 运行在其他端口
   - 检查 `mxmcgi/.env` 中的 `PORT` 配置

### 排查步骤

#### 1. 检查 mxmcgi 服务是否运行

```bash
# 检查端口
lsof -ti:4003

# 或测试健康检查接口
curl http://localhost:4003/health
```

**如果服务未运行**：
```bash
cd mxmcgi
npm run dev
# 或
npm start
```

#### 2. 检查 Gateway 配置

```bash
# 检查 Gateway 环境变量
cd gateway
cat .env | grep MXMCGI_URL

# 应该显示：
# MXMCGI_URL=http://localhost:4003
```

#### 3. 检查 Gateway 日志

查看 Gateway 启动日志，确认代理配置：
```
- /api/v1/knowledge -> mxmcgi/knowledge (http://localhost:4003)
```

#### 4. 直接测试 mxmcgi 接口

```bash
# 直接访问 mxmcgi（绕过 Gateway）
curl -X GET http://localhost:4003/knowledge/bases \
  -H "x-user-id: <your-user-id>"
```

如果直接访问成功，说明问题在 Gateway 代理配置。

#### 5. 检查认证

确保请求包含有效的 `Authorization` 头：
```bash
curl -X GET http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <your-token>"
```

### 解决方案

#### 方案 1：启动 mxmcgi 服务

```bash
cd mxmcgi
npm run dev
```

#### 方案 2：检查环境变量

确保 Gateway 的 `.env` 文件包含：
```env
MXMCGI_URL=http://localhost:4003
```

#### 方案 3：检查端口配置

确保 mxmcgi 的 `.env` 文件包含：
```env
PORT=4003
```

#### 方案 4：重启 Gateway

如果配置已更新，重启 Gateway：
```bash
cd gateway
npm run dev
```

### 常见错误

1. **代理到错误的端口**
   - 错误：`localhost:3000/knowledge`（Gateway 自己的端口）
   - 正确：`localhost:4003/knowledge`（mxmcgi 的端口）

2. **路径重写错误**
   - Gateway 应该将 `/api/v1/knowledge` 重写为 `/knowledge`
   - 检查 `gateway/src/routes/proxy.ts` 中的 `pathRewrite` 配置

3. **超时设置**
   - 知识库操作可能需要较长时间（特别是大文件上传）
   - Gateway 已设置 60 秒超时，如果还不够，可以增加

### 验证修复

修复后，测试接口：

```bash
# 通过 Gateway 访问
curl -X GET http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <your-token>"

# 应该返回知识库列表，而不是 504 错误
```

