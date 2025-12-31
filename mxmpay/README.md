# mxmpay - 支付服务

基于 Express + TypeScript 构建的支付服务系统，与 gateway / mxmauth 保持一致的项目结构。

## 功能特性

- ✅ 支付订单管理（创建、查询、确认、取消、统计）
- ✅ 多支付网关支持（Alipay, WeChat, PayPal, Card, Crypto）
- ✅ Webhook 回调处理
- ✅ 定时任务（支付过期检查，使用 node-cron）
- ✅ TypeORM + SQLite 数据库
- ✅ Swagger API 文档
- ✅ 幂等性中间件
- ✅ QR 码生成服务
- ✅ 请求参数验证（express-validator）

## 技术栈

- Node.js + TypeScript
- Express.js
- TypeORM
- SQLite
- Swagger (swagger-jsdoc + swagger-ui-express)
- express-validator
- node-cron
- qrcode

## 安装

```bash
npm install
```

## 配置

复制 `env.example` 为 `.env` 并根据实际情况配置环境变量：

```bash
cp env.example .env
```

主要配置项：
- `PORT`: 服务端口（默认 3001）
- `SQLITE_DB_PATH`: SQLite 数据库路径（默认 mxmpay.sqlite）
- `PAYMENT_EXPIRE_MINUTES`: 支付过期时间（分钟，默认 20）

各支付网关的配置请参考 `env.example` 文件中的注释。

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## 启动生产服务

```bash
npm start
```

## API 文档

启动服务后，通过 Gateway 访问：`http://localhost:3000/api/v1/payment/create`（不要直接访问 mxmpay 端口）

## 主要 API 端点

### 支付订单
- `POST /payment/create` - 创建支付订单（支持 userId、asset_code、biz_type、biz_id）
- `GET /payment/:orderId` - 获取订单详情
- `GET /payment` - 查询订单列表（支持分页和筛选）
- `POST /payment/confirm` - 确认支付
- `POST /payment/:orderId/cancel` - 取消订单
- `GET /payment/stats/overview` - 获取支付统计
- `POST /payment/webhook/:channel` - Webhook 回调（区块链支付自动触发钱包入账）

### 钱包管理
- `GET /wallets` - 查询指定用户的全部资产钱包（需 `userId` 或 `x-user-id`）
- `GET /wallets/:assetCode` - 查询单个资产钱包
- `GET /wallets/:assetCode/transactions` - 查询资产交易流水
- `POST /wallets/:assetCode/deposit` - 充值 / 增加余额
- `POST /wallets/:assetCode/withdraw` - 扣减余额
- `GET /wallets/assets` - 查看系统支持的资产列表
- `POST /wallets/payment` - 钱包支付（消费，自动创建任务并扣款）
- `GET /wallets/tasks` - 查询钱包任务列表（充值/支付任务）

## 项目结构

```

```
src/
├── api/                    # API 路由
│   ├── payment.routes.ts   # 支付相关路由
│   └── webhook.routes.ts  # Webhook 路由
├── common/                 # 通用代码
│   ├── dto/               # 数据传输对象
│   ├── middleware/        # 中间件
│   └── qr.service.ts      # QR 码服务
├── config/                # 配置文件
│   ├── env.ts             # 环境变量配置
│   └── swagger.ts         # Swagger 配置
├── database/              # 数据库配置
│   └── data-source.ts     # TypeORM 数据源
├── payment/               # 支付模块
│   ├── payment.entity.ts  # 支付实体
│   ├── payment.service.ts # 支付服务
│   ├── payment.expiration.scheduler.ts  # 定时任务
│   └── providers/         # 支付网关
│       ├── gateway.factory.ts
│       ├── payment-gateway.interface.ts
│       ├── alipay.gateway.ts
│       ├── wechat.gateway.ts
│       ├── paypal.gateway.ts
│       ├── card.gateway.ts
│       └── crypto.gateway.ts
├── app.ts                 # Express 应用配置
└── index.ts               # 应用入口
```

## 区块链支付接入指南

### 支持的币种

目前仅支持以下稳定币：
- **ERC20-USDT** (Ethereum 链)
- **TRC20-USDT** (Tron 链)

### 配置收款地址

在 `.env` 文件中配置收款地址：

```bash
# 方式 1：使用单变量（推荐）
CRYPTO_ERC20_USDT_ADDRESS=0x你的以太坊收款地址
CRYPTO_TRC20_USDT_ADDRESS=T你的波场收款地址

# 方式 2：使用 JSON 格式（支持多链扩展）
CRYPTO_WALLETS={"eth":{"erc20":{"usdt":"0x..."}},"tron":{"trc20":{"usdt":"T..."}}}
```

### USDT 标准合约地址

- **ERC20-USDT**: `0xdAC17F958D2ee523a2206206994597C13D831ec7` (Ethereum 主网)
- **TRC20-USDT**: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (Tron 主网)

### 创建支付订单

创建区块链支付订单时，需要提供以下字段：

```json
{
  "amount": 100.5,
  "currency": "usdt",
  "channel": "crypto",
  "toAddress": "0x...",  // 系统会自动使用配置的收款地址，此字段可忽略
  "asset_code": "USDT-ERC20",  // 或 "USDT-TRC20"
  "userId": "user_123",
  "biz_type": "subscription",  // 可选
  "biz_id": "sub_123",  // 可选
  "description": "月度订阅"  // 可选
}
```

系统会返回：
- `paymentUrl`: 区块链浏览器链接
- `qrCodeDataUrl`: 支付二维码（Base64 图片）

### 区块链监听与 Webhook

#### 方案 A：使用第三方服务（推荐）

**Ethereum (ERC20-USDT)**:
1. 注册 [Alchemy](https://www.alchemy.com/) 或 [Infura](https://www.infura.io/) 账号
2. 创建应用并获取 API Key
3. 在服务后台配置监听 ERC20 Transfer 事件
4. 设置 Webhook URL: `https://your-domain.com/api/v1/payment/webhook/crypto`
5. 过滤条件：
   - `to` = 你的收款地址
   - `contractAddress` = `0xdAC17F958D2ee523a2206206994597C13D831ec7`

**Tron (TRC20-USDT)**:
1. 使用 [TronGrid API](https://www.trongrid.io/) 或自建节点
2. 监听 TRC20 Transfer 事件
3. 设置 Webhook URL: `https://your-domain.com/api/v1/payment/webhook/crypto`
4. 过滤条件：
   - `to` = 你的收款地址
   - `contractAddress` = `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

#### 方案 B：自建监听服务（推荐，完全自主控制）

**实现步骤**：
1. 安装依赖：`pnpm add ethers tronweb axios`
2. 配置环境变量：`LISTENER_TYPE=local`、`ETH_RPC_URL`、`TRON_RPC_URL`、`WEBHOOK_URL`
3. 启用监听：`ENABLE_BLOCKCHAIN_LISTENER=true`

**详细文档**：请参考 `src/payment/listeners/README.md`

**优势**：
- ✅ 完全自主控制，无第三方依赖
- ✅ 数据隐私保护
- ✅ 可定制化

**需要**：
- RPC 节点连接（可使用公共节点或自建节点）
- 常驻进程运行监听服务

#### 方案 C：使用 Alchemy Webhook 服务

**实现步骤**：
1. 注册 [Alchemy](https://www.alchemy.com/) 账号并创建应用
2. 配置环境变量：`LISTENER_TYPE=alchemy`、`ALCHEMY_API_KEY`、`WEBHOOK_URL`
3. 启用监听：`ENABLE_BLOCKCHAIN_LISTENER=true`

**优势**：
- ✅ 稳定可靠，自动处理各种边界情况
- ✅ 无需维护 RPC 节点连接
- ✅ 支持实时通知

**注意**：
- 只支持 Ethereum，Tron 需要配合本地监听或 TronGrid

#### 方案 D：使用 Infura Webhook 服务

**实现步骤**：
1. 注册 [Infura](https://www.infura.io/) 账号并创建项目
2. 配置环境变量：`LISTENER_TYPE=infura`、`INFURA_PROJECT_ID`、`INFURA_PROJECT_SECRET`、`WEBHOOK_URL`
3. 启用监听：`ENABLE_BLOCKCHAIN_LISTENER=true`

**优势**：
- ✅ 稳定可靠，自动处理各种边界情况
- ✅ 无需维护 RPC 节点连接
- ✅ 支持实时通知

**注意**：
- 只支持 Ethereum，Tron 需要配合本地监听或 TronGrid

#### Webhook 数据格式

监听服务需要向 `/api/v1/payment/webhook/crypto` 发送以下格式的数据：

```json
{
  "orderId": "PAY1234567890",
  "txHash": "0x...",
  "blockNumber": 12345678,
  "fromAddress": "0x...",
  "toAddress": "0x...",
  "amount": "1000000",
  "contractAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "assetCode": "USDT-ERC20"
}
```

**字段说明**：
- `orderId`: 支付订单ID（必需）
- `txHash`: 交易哈希（必需）
- `toAddress`: 收款地址（必需，需匹配订单）
- `amount`: 金额（最小单位，6位小数，必需）
- `contractAddress`: 代币合约地址（必需，需匹配标准合约）
- `assetCode`: 资产代码（必需，USDT-ERC20 或 USDT-TRC20）
- `blockNumber`: 区块号（可选）
- `fromAddress`: 发送地址（可选）

系统会自动：
1. 验证交易信息（地址、金额、合约）
2. 更新支付订单状态为 `success`
3. 触发钱包入账（调用 `WalletTaskService.createDepositTaskAndApply`）

### 手动测试 Webhook

在接入真实监听服务前，可以使用 curl 手动触发 webhook 进行测试：

```bash
curl -X POST http://localhost:3000/api/v1/payment/webhook/crypto \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "PAY1234567890",
    "txHash": "0x1234567890abcdef...",
    "toAddress": "0x你的收款地址",
    "amount": "1000000",
    "contractAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "assetCode": "USDT-ERC20",
    "blockNumber": 12345678,
    "fromAddress": "0x发送地址"
  }'
```

### 本地开发测试

使用 `ngrok` 暴露本地服务，供监听服务回调：

```bash
ngrok http 3001
```

将生成的 HTTPS URL 配置到监听服务的 Webhook URL 中。

### 交易验证规则

系统会验证以下内容：
1. **收款地址匹配**: `toAddress` 必须匹配订单的收款地址
2. **合约地址匹配**: `contractAddress` 必须匹配标准 USDT 合约地址
3. **金额验证**: `amount` 必须在允许误差范围内（±1%）
4. **防重复**: `txHash` 不能重复处理

### 其他渠道占位

以下渠道当前为占位实现，等待工商信息完整后对接：
- 支付宝 (alipay)
- 微信支付 (wechat)
- PayPal (paypal)
- 银行卡/Visa (card)
- Apple IAP (apple_iap)

## 许可证

ISC
