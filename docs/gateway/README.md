# Gateway - API 网关服务

## 概述

Gateway 是统一入口，负责路由转发、认证、限流等功能。

## 功能特性

- ✅ **统一入口**: 所有客户端请求通过 Gateway 访问后端服务
- ✅ **路由转发**: 根据路径前缀转发到对应的微服务
- ✅ **JWT 认证**: 验证和转发 JWT token
- ✅ **CORS 支持**: 统一处理跨域请求
- ✅ **错误处理**: 统一的错误响应格式
- ✅ **请求日志**: 记录所有请求日志

## 路由配置

| 路径前缀 | 上游服务 | 状态 | 说明 |
|----------|----------|------|------|
| `/api/v1/account` | `mxmauth` | ✅ 已实现 | 注册、登录、用户资料、设置、Token 刷新 |
| `/api/v1/payment` | `mxmpay` | ✅ 已实现 | 支付订单创建/查询/确认/取消、统计、Webhook |
| `/api/v1/wallets` | `mxmpay` | ✅ 已实现 | 多资产钱包：查询资产、余额、流水，充值/扣减 |
| `/api/v1/generation` | `mxmcgi` | ⏳ 待实现 | AI 生成（文本/图像等） |
| `/api/v1/agents` | `mxmcgi` | ✅ 已实现 | 助手列表、Agent Chat |
| `/api/v1/smartflows` | `mxmcgi` | ✅ 已实现 | Smartflow 工作流 |
| `/api/v1/notifications` | `mxmnotify` | ⏳ 待实现 | 通知中心、推送、站内信 |
| `/health`、`/` | Gateway | ✅ 已实现 | 网关自身健康检查、版本信息 |

## API 路由清单

### mxmauth / 用户认证模块

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `GET /api/v1/account/captcha` | 获取验证码图片 | 否 | 所有人 | `curl http://localhost:3000/api/v1/account/captcha` | ✅ 已实现 ✅ 已测试 |
| `POST /api/v1/account/register` | 用户注册 | 否 | 所有人 | `curl -X POST http://localhost:3000/api/v1/account/register -H "Content-Type: application/json" -d '{"username":"test","email":"test@example.com","password":"123456"}'`（当 `CAPTCHA_ENABLE=false` 时不需要验证码） | ✅ 已实现 ✅ 已测试 |
| `POST /api/v1/account/login` | 用户登录 | 否 | 所有人 | `curl -X POST http://localhost:3000/api/v1/account/login -H "Content-Type: application/json" -d '{"username":"test","password":"123456"}'`（当 `CAPTCHA_ENABLE=false` 时不需要验证码） | ✅ 已实现 ✅ 已测试 |
| `POST /api/v1/account/logout` | 用户登出 | 是 | 用户 | `curl -X POST http://localhost:3000/api/v1/account/logout -H "Authorization: Bearer <token>"` | ✅ 已实现 ✅ 已测试 |
| `POST /api/v1/account/refresh-token` | 刷新 Token | 否 | 所有人 | `curl -X POST http://localhost:3000/api/v1/account/refresh-token -H "Content-Type: application/json" -d '{"refresh_token":"<refresh_token>"}'` | ✅ 已实现 ✅ 已测试 |
| `GET /api/v1/account/profile` | 获取个人资料 | 是 | 用户 | `curl http://localhost:3000/api/v1/account/profile -H "Authorization: Bearer <token>"` | ✅ 已实现 ✅ 已测试 |
| `PUT /api/v1/account/profile` | 更新个人基础资料（仅限 avatar_url） | 是 | 用户 | `curl -X PUT http://localhost:3000/api/v1/account/profile -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"avatar_url":"https://example.com/avatar.jpg"}'` | ✅ 已实现 ✅ 已测试 |
| `PUT /api/v1/account/updateAgents` | 更新用户助手关联信息 | 是 | 用户 | `curl -X PUT http://localhost:3000/api/v1/account/updateAgents -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"agentIds":["agent_001"],"agentCount":1}'` | ✅ 已实现 |
| `PUT /api/v1/account/updateMedia` | 更新用户媒体资源关联信息（支持一次性提交多个多媒体项） | 是 | 用户 | `curl -X PUT http://localhost:3000/api/v1/account/updateMedia -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '[{\"type\":\"photo\",\"assets_type\":\"image/jpeg\",\"label\":\"封面图\",\"url\":\"media/photo/xxx.jpg\",\"id\":\"task_123\",\"description\":\"海边黄昏\",\"prompts_meta\":\"{\\\"prompt\\\":\\\"海边黄昏\\\",\\\"seed\\\":42}\"}]'` | ✅ 已实现 |
| `GET /api/v1/account/media` | 获取当前用户的媒体资源列表（支持按 type 分组、分页，占位实现） | 是 | 用户 | `curl \"http://localhost:3000/api/v1/account/media?type=photo&page=1&limit=20\" -H \"Authorization: Bearer <token>\"` | ✅ 已实现 |
| `GET /api/v1/account/agents` | 获取当前用户的助手列表（分页，占位实现） | 是 | 用户 | `curl \"http://localhost:3000/api/v1/account/agents?page=1&limit=20\" -H \"Authorization: Bearer <token>\"` | ✅ 已实现 |
| `GET /api/v1/account/settings` | 获取用户设置 | 是 | 用户 | `curl http://localhost:3000/api/v1/account/settings -H "Authorization: Bearer <token>"` | ✅ 已实现 ✅ 已测试 |
| `PUT /api/v1/account/settings` | 更新用户设置 | 是 | 用户 | `curl -X PUT http://localhost:3000/api/v1/account/settings -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"theme":"dark","language":"zh"}'` | ✅ 已实现 ✅ 已测试 |
| `GET /api/v1/account/membership` | 获取会员信息 | 是 | 用户 | `curl http://localhost:3000/api/v1/account/membership -H "Authorization: Bearer <token>"` | ✅ 已实现 ✅ 已测试 |
| `PUT /api/v1/account/admin/user_profile` | 管理员：更新用户信息（可修改所有参数） | 是 | admin | `curl -X PUT http://localhost:3000/api/v1/account/admin/user_profile -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"userId":"user-id","username":"newname","email":"new@example.com","status":"active"}'` | ✅ 已实现 |
| `GET /api/v1/account/admin/users` | 管理员：查看用户列表（含登录状态） | 是 | admin | `curl http://localhost:3000/api/v1/account/admin/users?page=1&limit=20 -H "Authorization: Bearer <admin_token或ADMIN_TOKEN>"` | ✅ 已实现 |
| `GET /api/v1/account/health` | mxmauth 健康检查 | 否 | 所有人 | `curl http://localhost:3000/api/v1/account/health` | ✅ 已实现 |

### mxmpay / 支付模块

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `POST /api/v1/payment/create` | 创建支付订单 | 是 | 用户 | 见下方详细示例 | ✅ 已实现 |
| `GET /api/v1/payment` | 查询订单列表 | 是 | 用户 | `curl http://localhost:3000/api/v1/payment?page=1&limit=20 -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `GET /api/v1/payment/:orderId` | 获取订单详情 | 是 | 用户 | `curl http://localhost:3000/api/v1/payment/507f1f77bcf86cd799439011 -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `POST /api/v1/payment/confirm` | 确认支付 | 是 | 用户 | `curl -X POST http://localhost:3000/api/v1/payment/confirm -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"orderId":"507f1f77bcf86cd799439011","txHash":"0x..."}'` | ✅ 已实现 |
| `POST /api/v1/payment/:orderId/cancel` | 取消订单 | 是 | 用户 | `curl -X POST http://localhost:3000/api/v1/payment/507f1f77bcf86cd799439011/cancel -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `GET /api/v1/payment/stats/overview` | 支付统计 | 是 | 用户 | `curl http://localhost:3000/api/v1/payment/stats/overview -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `GET /api/v1/payment/admin/orders` | 管理员：查询所有订单（支持筛选和分页） | 是 | admin | `curl "http://localhost:3000/api/v1/payment/admin/orders?page=1&limit=20&status=pending" -H "Authorization: Bearer <admin_token>"` | ✅ 已实现 |
| `POST /api/v1/payment/admin/voucher/issue` | 管理员：发放代金券（直接入账到用户钱包） | 是 | admin | `curl -X POST http://localhost:3000/api/v1/payment/admin/voucher/issue -H "Authorization: Bearer <admin_token>" -H "Content-Type: application/json" -d '{"userId":"user123","amount":100.00,"assetCode":"VOUCHER-CNY","description":"活动奖励代金券"}'` | ✅ 已实现 |
| `POST /api/v1/payment/webhook/:channel` | 支付渠道回调（区块链支付自动触发钱包入账，无需认证） | 否 | 所有人 | `curl -X POST http://localhost:3000/api/v1/payment/webhook/crypto -H "Content-Type: application/json" -d '{"orderId":"PAY123","txHash":"0x...","toAddress":"0x...","amount":"1000000","contractAddress":"0xdAC17F958D2ee523a2206206994597C13D831ec7","assetCode":"USDT-ERC20"}'` | ✅ 已实现 |

### mxmpay / 钱包模块

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `GET /api/v1/wallets/assets` | 查询系统支持的资产列表 | 是 | 用户 | `curl http://localhost:3000/api/v1/wallets/assets -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `GET /api/v1/wallets` | 查询用户全部资产余额 | 是 | 用户 | `curl http://localhost:3000/api/v1/wallets -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `GET /api/v1/wallets/:assetCode` | 查询单个资产余额 | 是 | 用户 | `curl http://localhost:3000/api/v1/wallets/CNY -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `GET /api/v1/wallets/:assetCode/transactions` | 查询交易流水 | 是 | 用户 | `curl http://localhost:3000/api/v1/wallets/CNY/transactions?limit=20 -H "Authorization: Bearer <token>"` | ✅ 已实现 |
| `POST /api/v1/wallets/:assetCode/deposit` | 充值 / 增加余额 | 是 | 用户 | `curl -X POST http://localhost:3000/api/v1/wallets/CNY/deposit -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"amount":"100.00"}'` | ✅ 已实现 |
| `POST /api/v1/wallets/:assetCode/withdraw` | 扣减余额 | 是 | 用户 | `curl -X POST http://localhost:3000/api/v1/wallets/CNY/withdraw -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"amount":"50.00"}'` | ✅ 已实现 |
| `POST /api/v1/wallets/payment` | 钱包支付（消费，自动创建任务并扣款） | 是 | 用户 | `curl -X POST http://localhost:3000/api/v1/wallets/payment -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"asset_code":"CNY","price":"50.00","biz_type":"subscription","biz_id":"sub_123","description":"月度订阅"}'` | ✅ 已实现 |
| `GET /api/v1/wallets/tasks` | 查询钱包任务列表（充值/支付任务） | 是 | 用户 | `curl "http://localhost:3000/api/v1/wallets/tasks?type=deposit&status=success&page=1&limit=20" -H "Authorization: Bearer <token>"` | ✅ 已实现 |

### mxmcgi / AI 生成模块

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `POST /api/v1/generation/text` | 文本生成任务 | 是 | 用户 | - | ⏳ 待实现 |
| `POST /api/v1/generation/image` | 图像生成任务 | 是 | 用户 | - | ⏳ 待实现 |
| `GET /api/v1/generation/tasks` | 查询生成任务列表 | 是 | 用户 | - | ⏳ 待实现 |
| `GET /api/v1/generation/tasks/:taskId` | 获取生成任务详情 | 是 | 用户 | - | ⏳ 待实现 |
| `GET /api/v1/generation/media` | 查询媒体资源列表 | 是 | 用户 | - | ⏳ 待实现 |

### mxmcgi / 助手与 Smartflow（原 mxmagent 已并入 mxmcgi）

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `GET /api/v1/agents` | 助手列表 / 详情 | 否 | 所有人 | - | ⏳ 待实现 |
| `GET /api/v1/agents/:agentId` | 获取助手详情 | 否 | 所有人 | - | ⏳ 待实现 |
| `POST /api/v1/agents` | 创建助手 | 是 | 用户 | - | ⏳ 待实现 |
| `PUT /api/v1/agents/:agentId` | 更新助手 | 是 | 用户 | - | ⏳ 待实现 |
| `DELETE /api/v1/agents/:agentId` | 删除助手 | 是 | 用户 | - | ⏳ 待实现 |
| `POST /api/v1/agents/:agentId/start` | 启动助手 | 是 | 用户 | - | ⏳ 待实现 |
| `POST /api/v1/agents/:agentId/stop` | 停止助手 | 是 | 用户 | - | ⏳ 待实现 |
| `GET /api/v1/agents/:agentId/history` | 助手历史记录 | 是 | 用户 | - | ⏳ 待实现 |

### mxmnotify / 通知模块

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `GET /api/v1/notifications` | 查询通知列表 | 是 | 用户 | - | ⏳ 待实现 |
| `GET /api/v1/notifications/:notificationId` | 获取通知详情 | 是 | 用户 | - | ⏳ 待实现 |
| `PUT /api/v1/notifications/:notificationId/read` | 标记通知为已读 | 是 | 用户 | - | ⏳ 待实现 |
| `POST /api/v1/notifications/push` | 推送通知 | 是 | 用户 | - | ⏳ 待实现 |

### Gateway / 网关自身

| 路由 | 说明 | 认证 | 权限 | 调用演示 | 状态 |
|------|------|------|------|----------|------|
| `GET /health` | 健康检查 | 否 | 所有人 | `curl http://localhost:3000/health` | ✅ 已实现 ✅ 已测试 |
| `GET /` | 版本信息 | 否 | 所有人 | `curl http://localhost:3000/` | ✅ 已实现 ✅ 已测试 |

## 快速开始

### 1. 配置环境变量

```bash
cd gateway
cp .env.example .env
# 编辑 .env 文件，配置服务 URL 和 JWT_SECRET
```

### 2. 启动服务

```bash
# 开发模式
pnpm dev

# 或使用根目录命令
pnpm dev:gateway
```

### 3. 测试

```bash
# 健康检查
curl http://localhost:3000/health

# 获取验证码
curl http://localhost:3000/api/v1/account/captcha

# 用户注册
curl -X POST http://localhost:3000/api/v1/account/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"123456"}'
  
# 注意：当 CAPTCHA_ENABLE=false 时，不需要 captchaId 和 captchaAnswer 字段
# 当 CAPTCHA_ENABLE=true 时，需要先获取验证码，然后传入 captchaId 和 captchaAnswer

# 用户登录
curl -X POST http://localhost:3000/api/v1/account/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'
  
# 注意：当 CAPTCHA_ENABLE=false 时，不需要 captchaId 和 captchaAnswer 字段
# 当 CAPTCHA_ENABLE=true 时，需要先获取验证码，然后传入 captchaId 和 captchaAnswer

# 创建支付订单（区块链 USDT 支付）
curl -X POST http://localhost:3000/api/v1/payment/create \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1.5,
    "currency": "usdt",
    "channel": "crypto",
    "asset_code": "USDT-ERC20",
    "biz_type": "subscription",
    "biz_id": "sub_123",
    "description": "月度订阅"
  }'

# 注意：
# 1. 对于 crypto 渠道，toAddress 字段会被忽略，系统会自动使用环境变量中配置的收款地址
# 2. asset_code 必须为 "USDT-ERC20", "USDT-TRC20", "USDT-ARBITRUM", 或 "USDT-POLYGON"
# 3. userId 会自动从 JWT token 中提取，也可以手动在 body 中传入
# 4. 响应会包含 qrCodeDataUrl（Base64 二维码图片）和 paymentUrl（区块链浏览器链接）
```

## 支付订单创建详细说明

### 请求参数

**必需字段：**
- `amount`: 支付金额（数字，最小 0.01）
- `currency`: 支付货币
  - 对于 `voucher` 渠道：`cny`（对应 VOUCHER-CNY）或 `usd`（对应 VOUCHER-USD）
  - 对于其他渠道：`eth`, `usdt`, `usdc`, `btc`
- `channel`: 支付渠道（`alipay`, `wechat`, `paypal`, `card`, `crypto`, `voucher`）
- `toAddress`: 收款地址（**对于 crypto 和 voucher 渠道不需要**，会自动使用环境变量配置的地址或直接从钱包扣除；其他渠道必需）

**可选字段：**
- `description`: 订单描述
- `orderId`: 自定义订单ID（不提供则自动生成）
- `userId`: 用户ID（不提供则从 JWT token 中提取）
- `asset_code`: 资产代码
  - crypto 渠道必需：`USDT-ERC20`, `USDT-TRC20`, `USDT-ARBITRUM`, `USDT-POLYGON`
  - voucher 渠道必需：`VOUCHER-CNY` 或 `VOUCHER-USD`
- `biz_type`: 业务类型（如 `subscription`, `token_purchase`）
- `biz_id`: 业务ID（关联的业务订单ID）

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "orderId": "PAY1764213133568",
    "amount": 1.5,
    "currency": "usdt",
    "channel": "crypto",
    "toAddress": "0x你的收款地址",
    "status": "pending",
    "assetCode": "USDT-ERC20",
    "userId": "user_123",
    "qrCodeDataUrl": "data:image/png;base64,iVBORw0KG...",
    "paymentUrl": "https://etherscan.io",
    "description": "月度订阅",
    "bizType": "subscription",
    "bizId": "sub_123",
    "createdAt": "2025-11-27T03:11:38.607Z",
    "expiresAt": "2025-11-27T03:31:38.607Z"
  },
  "message": "支付订单创建成功"
}
```

### 重要提示

1. **收款地址配置**：对于 `crypto` 渠道，必须在 `mxmpay/.env` 中配置收款地址：
   ```bash
   CRYPTO_ERC20_USDT_ADDRESS=0x你的以太坊收款地址
   CRYPTO_TRC20_USDT_ADDRESS=T你的波场收款地址
   ```
   或使用 JSON 配置：
   ```bash
   CRYPTO_WALLETS={"eth":{"erc20":{"usdt":"0x..."}},"tron":{"trc20":{"usdt":"T..."}}}
   ```

2. **toAddress 字段**：对于 `crypto` 渠道，**不需要**在请求中传入 `toAddress`，系统会自动使用环境变量中配置的收款地址。如果传入了也会被忽略。对于其他渠道（如 alipay、wechat），`toAddress` 是必需的。

3. **二维码使用**：响应中的 `qrCodeDataUrl` 是 Base64 编码的二维码图片，可以直接在 `<img>` 标签中使用。

### 管理员：发放代金券

**接口**: `POST /api/v1/payment/admin/voucher/issue`

**权限**: 需要管理员权限（admin role 或 ADMIN_TOKEN）

**请求参数**:
- `userId` (必需): 用户ID
- `amount` (必需): 代金券金额（数字，最小 0.01）
- `assetCode` (必需): 代金券资产代码（`VOUCHER-CNY` 或 `VOUCHER-USD`）
- `description` (可选): 代金券描述
- `bizType` (可选): 业务类型（如 `promotion`, `voucher_issue`）
- `bizId` (可选): 业务ID

**请求示例**:
```bash
curl -X POST http://localhost:3000/api/v1/payment/admin/voucher/issue \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "amount": 100.00,
    "assetCode": "VOUCHER-CNY",
    "description": "活动奖励代金券",
    "bizType": "promotion",
    "bizId": "promo_001"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "orderId": "VOUCHER1764213133568",
    "amount": 100.00,
    "currency": "usdt",
    "channel": "voucher",
    "toAddress": "",
    "status": "paid",
    "assetCode": "VOUCHER-CNY",
    "userId": "user_123",
    "bizType": "voucher_issue",
    "bizId": "promo_001",
    "description": "活动奖励代金券",
    "createdAt": "2025-11-27T03:11:38.607Z",
    "paidAt": "2025-11-27T03:11:38.650Z"
  },
  "message": "代金券发放成功"
}
```

**说明**:
- 代金券发放后，会立即入账到用户钱包，订单状态为 `paid`。
- 用户可以在钱包中查看代金券余额（`VOUCHER-CNY` 或 `VOUCHER-USD`）。
- 用户支付时可以选择使用代金券，直接从钱包扣除。

### 管理员：发放代金券

**接口**: `POST /api/v1/payment/admin/voucher/issue`

**权限**: 需要管理员权限（admin role 或 ADMIN_TOKEN）

**请求参数**:
- `userId` (必需): 用户ID
- `amount` (必需): 代金券金额（数字，最小 0.01）
- `assetCode` (必需): 代金券资产代码（`VOUCHER-CNY` 或 `VOUCHER-USD`）
- `description` (可选): 代金券描述
- `bizType` (可选): 业务类型（如 `promotion`, `voucher_issue`）
- `bizId` (可选): 业务ID

**请求示例**:
```bash
curl -X POST http://localhost:3000/api/v1/payment/admin/voucher/issue \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "amount": 100.00,
    "assetCode": "VOUCHER-CNY",
    "description": "活动奖励代金券",
    "bizType": "promotion",
    "bizId": "promo_001"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "orderId": "VOUCHER1764213133568",
    "amount": 100.00,
    "currency": "usdt",
    "channel": "voucher",
    "toAddress": "",
    "status": "paid",
    "assetCode": "VOUCHER-CNY",
    "userId": "user_123",
    "bizType": "voucher_issue",
    "bizId": "promo_001",
    "description": "活动奖励代金券",
    "createdAt": "2025-11-27T03:11:38.607Z",
    "paidAt": "2025-11-27T03:11:38.650Z"
  },
  "message": "代金券发放成功"
}
```

**说明**:
- 代金券发放后，会立即入账到用户钱包，订单状态为 `paid`。
- 用户可以在钱包中查看代金券余额（`VOUCHER-CNY` 或 `VOUCHER-USD`）。
- 用户支付时可以选择使用代金券，直接从钱包扣除。

### 管理员：查询所有订单

**接口**: `GET /api/v1/payment/admin/orders`

**权限**: 需要管理员权限（admin role 或 ADMIN_TOKEN）

**请求参数**:
- `page` (可选): 页码，默认 1
- `limit` (可选): 每页数量，默认 10，最大 100
- `status` (可选): 订单状态筛选 (`pending`, `processing`, `success`, `failed`, `cancelled`, `expired`)
- `currency` (可选): 货币筛选 (`eth`, `usdt`, `usdc`, `btc`, `cny`, `usd`)
- `channel` (可选): 支付渠道筛选 (`alipay`, `wechat`, `paypal`, `card`, `crypto`, `voucher`)
- `orderId` (可选): 订单号模糊搜索
- `userId` (可选): 筛选特定用户的订单

**请求示例**:
```bash
# 查询所有待支付订单
curl "http://localhost:3000/api/v1/payment/admin/orders?status=pending&page=1&limit=20" \
  -H "Authorization: Bearer <admin_token>"

# 查询特定用户的所有订单
curl "http://localhost:3000/api/v1/payment/admin/orders?userId=user_123&page=1&limit=20" \
  -H "Authorization: Bearer <admin_token>"

# 查询所有成功支付的订单
curl "http://localhost:3000/api/v1/payment/admin/orders?status=success&page=1&limit=50" \
  -H "Authorization: Bearer <admin_token>"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "payment-uuid-1",
        "orderId": "PAY1764213133568",
        "amount": 1.5,
        "currency": "usdt",
        "channel": "crypto",
        "toAddress": "0x...",
        "status": "pending",
        "assetCode": "USDT-ERC20",
        "userId": "user_123",
        "bizType": "subscription",
        "bizId": "sub_123",
        "createdAt": "2025-11-27T03:11:38.607Z",
        "expiresAt": "2025-11-27T03:31:38.607Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  },
  "message": "查询所有订单成功"
}
```

## 环境变量

```bash
# 服务端口
PORT=3000

# CORS 配置（多个用逗号分隔）
CORS_ORIGIN=http://localhost:3000,http://localhost:19006

# JWT 密钥（必须与 mxmauth 保持一致）
JWT_SECRET=your-secret-key-change-in-production

# 后端服务 URL
MXMAUTH_URL=http://localhost:4001
MXMPAY_URL=http://localhost:4002
MXMCGI_URL=http://localhost:4003
MXMNOTIFY_URL=http://localhost:4005
# WORKER_PORT=4004 — mxmcgi-worker 健康检查（内网，非 MXMAGENT_URL）

# 环境
NODE_ENV=development

# Redis 配置（用于验证码存储，mxmauth 使用）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 验证码开关（mxmauth 使用）
# 设置为 false 可暂时禁用验证码，方便开发测试
# 生产环境建议设置为 true 或省略（默认启用）
CAPTCHA_ENABLE=true

# 管理员测试 Token（Gateway 和 mxmauth 都需要配置）
# 用于测试 admin 接口，直接使用此 token 即可访问管理员接口
# 注意：Gateway 和 mxmauth 的 ADMIN_TOKEN 必须保持一致
# 生产环境应移除此配置，使用真实的 admin 用户账户
ADMIN_TOKEN=your-admin-test-token-here
```

## 开发

```bash
# 开发模式（自动重启）
pnpm dev

# 构建
pnpm build

# 生产模式
pnpm start
```

## 注意事项

1. **JWT_SECRET**: 必须与 `mxmauth` 服务保持一致，否则认证会失败
2. **服务 URL**: 确保所有后端服务 URL 配置正确且服务已启动
3. **CORS**: 根据前端应用的实际域名配置 CORS_ORIGIN
