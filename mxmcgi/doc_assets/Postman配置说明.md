# Postman 配置说明

## 问题排查

如果遇到 `404 Not Found` 错误，且错误信息中显示双斜杠（如 `//api/v1/cgi/graph/design`），通常是环境变量配置问题。

## 正确配置步骤

### 1. 导入 Collection

1. 打开 Postman
2. 点击 "Import" 按钮
3. 选择 `九宫格测试请求.postman_collection.json` 文件

### 2. 创建/选择环境

1. 点击右上角的 "Environments" 图标（或使用快捷键 `Cmd/Ctrl + E`）
2. 点击 "+" 创建新环境，或选择现有环境
3. 设置以下环境变量：

| 变量名 | 初始值 | 当前值 | 说明 |
|--------|--------|--------|------|
| `baseUrl` | `http://localhost:3000` | `http://localhost:3000` | Gateway 地址（**不要**以 `/` 结尾） |
| `token` | `your-jwt-token-here` | `<从登录获取>` | JWT Token |

**重要**：
- `baseUrl` **不能**以 `/` 结尾（如 `http://localhost:3000/` ❌）
- `baseUrl` **不能**为空
- `baseUrl` 应该是完整的 URL，包括协议（`http://` 或 `https://`）

### 3. 选择环境

1. 在右上角的环境选择器中，选择你刚创建/配置的环境
2. 确保环境已激活（显示为蓝色）

### 4. 获取 Token

1. 先通过登录接口获取 JWT Token：
   ```bash
   curl -X POST http://localhost:3000/api/v1/account/login \
     -H "Content-Type: application/json" \
     -d '{"username":"your-username","password":"your-password"}'
   ```
2. 从响应中复制 `access_token`
3. 在 Postman 环境变量中，将 `token` 的当前值更新为获取到的 `access_token`

### 5. 验证配置

1. 打开任意一个请求（如 "1. 摄影-人像-九宫格（组合模式）"）
2. 查看 URL 栏，应该显示：`{{baseUrl}}/api/v1/cgi/graph/photograph`
3. 点击 "Send" 按钮
4. 如果配置正确，应该能看到请求发送成功（或返回业务错误，而不是 404）

## 常见错误

### 错误1：`//api/v1/cgi/graph/design not found`

**原因**：`baseUrl` 为空或未设置

**解决**：
1. 检查环境变量 `baseUrl` 是否已设置
2. 确保已选择正确的环境
3. 确保 `baseUrl` 的值是 `http://localhost:3000`（根据实际 Gateway 地址调整）

### 错误2：`Route POST /api/v1/cgi/graph/design not found`

**原因**：Gateway 路由配置问题或 mxmcgi 服务未启动

**解决**：
1. 检查 Gateway 服务是否运行（`http://localhost:3000/health`）
2. 检查 mxmcgi 服务是否运行（`http://localhost:4003/health`）
3. 检查 Gateway 的 `.env` 配置，确保 `MXMCGI_URL` 正确

### 错误3：`401 Unauthorized`

**原因**：Token 无效或过期

**解决**：
1. 重新登录获取新的 Token
2. 更新环境变量中的 `token` 值
3. 确保 Token 格式正确：`Bearer <token>`（Postman 会自动添加 `Bearer ` 前缀）

## 验证 Gateway 和 mxmcgi 服务

### 检查 Gateway 服务

```bash
curl http://localhost:3000/health
```

应该返回：
```json
{
  "status": "ok",
  "service": "gateway",
  "version": "1.0.0"
}
```

### 检查 mxmcgi 服务

```bash
curl http://localhost:4003/health
```

应该返回：
```json
{
  "status": "ok",
  "service": "mxmcgi"
}
```

### 检查路由配置

Gateway 日志应该显示：
```
📡 Routes configured:
   - /api/v1/cgi/graph -> mxmcgi/graph (http://localhost:4003)
```

## 调试技巧

1. **查看请求 URL**：在 Postman 中，点击请求后，查看实际发送的 URL（在 URL 栏下方）
2. **查看 Gateway 日志**：检查 Gateway 控制台输出，查看请求是否到达 Gateway
3. **查看 mxmcgi 日志**：检查 mxmcgi 控制台输出，查看请求是否到达 mxmcgi
4. **使用 cURL 测试**：使用 cURL 直接测试，排除 Postman 配置问题

```bash
curl -X POST http://localhost:3000/api/v1/cgi/graph/design \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "type": "3d",
    "prompt": "test",
    "quality": "high",
    "grid9": true,
    "storeToMinio": true
  }'
```
