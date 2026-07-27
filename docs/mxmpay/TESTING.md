# 区块链支付测试指南

## 完整流程测试（通过网关）

所有测试请求都通过网关路由 `http://localhost:3000/api/v1` 进行。

### 1. 创建支付订单并生成二维码

**请求示例**：
```bash
curl -X POST http://localhost:3000/api/v1/payment/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "amount": 100.5,
    "currency": "usdt",
    "channel": "crypto",
    "toAddress": "0x0000000000000000000000000000000000000000",
    "asset_code": "USDT-ERC20",
    "biz_type": "subscription",
    "biz_id": "sub_123",
    "description": "月度订阅"
  }'
```

**注意**：
- 网关会自动从 JWT token 中提取 `userId` 并转发到 `x-user-id` header
- 如果 token 中没有 userId，也可以手动在 body 中传入 `userId`

**预期响应**：
```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "orderId": "PAY1234567890",
    "amount": 100.5,
    "currency": "usdt",
    "channel": "crypto",
    "toAddress": "0x你的收款地址",
    "status": "pending",
    "assetCode": "USDT-ERC20",
    "userId": "user_123",
    "qrCodeDataUrl": "data:image/png;base64,...",
    "paymentUrl": "https://etherscan.io"
  }
}
```

**验证点**：
- ✅ 订单已创建，状态为 `pending`
- ✅ `toAddress` 已更新为配置的收款地址（不是传入的地址）
- ✅ `qrCodeDataUrl` 包含二维码图片（Base64）
- ✅ `assetCode` 和 `userId` 已保存

### 2. 配置监听服务

在 `mxmpay/.env` 中配置：

```bash
# 选择监听类型
LISTENER_TYPE=local  # 或 alchemy 或 infura

# 启用监听服务
ENABLE_BLOCKCHAIN_LISTENER=true

# 收款地址（必需）
CRYPTO_ERC20_USDT_ADDRESS=0x你的以太坊收款地址
CRYPTO_TRC20_USDT_ADDRESS=T你的波场收款地址

# 根据监听类型配置
# local:
ETH_RPC_URL=https://eth.llamarpc.com
TRON_RPC_URL=https://api.trongrid.io
POLL_INTERVAL=10000

# alchemy:
ALCHEMY_API_KEY=your_alchemy_api_key

# infura:
INFURA_PROJECT_ID=your_infura_project_id
INFURA_PROJECT_SECRET=your_infura_project_secret

# Webhook 回调地址（使用网关路由）
WEBHOOK_URL=http://localhost:3000/api/v1/payment/webhook/crypto
```

### 3. 模拟支付完成（手动触发 Webhook）

**方式 A：使用 curl 手动触发**（用于测试）

```bash
curl -X POST http://localhost:3000/api/v1/payment/webhook/crypto \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "PAY1234567890",
    "txHash": "0x1234567890abcdef...",
    "toAddress": "0x你的收款地址",
    "amount": "100500000",
    "contractAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "assetCode": "USDT-ERC20",
    "blockNumber": 12345678,
    "fromAddress": "0x发送地址"
  }'
```

**注意**：Webhook 路由不需要认证，可以直接访问。

**方式 B：真实支付**（需要真实转账）

1. 使用钱包扫描二维码
2. 确认支付（转账到收款地址）
3. 监听服务检测到转账后自动触发 webhook

### 4. 验证订单状态和钱包余额

**查询订单状态**：
```bash
curl http://localhost:3000/api/v1/payment/PAY1234567890 \
  -H "Authorization: Bearer <your_token>"
```

**预期响应**：
```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "orderId": "PAY1234567890",
    "status": "success",
    "extra": "{\"txHash\":\"0x...\",\"blockNumber\":12345678,...}"
  }
}
```

**查询钱包余额**：
```bash
curl http://localhost:3000/api/v1/wallets/USDT-ERC20 \
  -H "Authorization: Bearer <your_token>"
```

**预期响应**：
```json
{
  "success": true,
  "data": {
    "id": "wallet-uuid",
    "userId": "user_123",
    "assetCode": "USDT-ERC20",
    "availableBalance": "100.5",
    "frozenBalance": "0"
  }
}
```

**查询钱包任务**：
```bash
curl "http://localhost:3000/api/v1/wallets/tasks?type=deposit&status=success" \
  -H "Authorization: Bearer <your_token>"
```

**预期响应**：
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "task-uuid",
        "userId": "user_123",
        "paymentId": "payment-uuid",
        "type": "deposit",
        "assetCode": "USDT-ERC20",
        "amount": "100.5",
        "channel": "crypto",
        "status": "success",
        "metadata": "{\"txHash\":\"0x...\",...}"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

## 完整流程验证清单

### ✅ 创建订单阶段
- [ ] 订单创建成功，状态为 `pending`
- [ ] `toAddress` 正确设置为配置的收款地址
- [ ] `qrCodeDataUrl` 包含有效的二维码
- [ ] `userId` 和 `assetCode` 已保存

### ✅ 支付完成阶段
- [ ] Webhook 接收成功
- [ ] 订单状态更新为 `success`
- [ ] `extra` 字段包含交易信息（txHash、blockNumber 等）

### ✅ 钱包入账阶段
- [ ] 钱包任务创建成功（`wallet_tasks` 表）
- [ ] 钱包余额增加（`wallets` 表）
- [ ] 交易记录创建（`wallet_transactions` 表）
- [ ] 任务状态为 `success`

## 常见问题排查

### 1. 订单创建失败
- 检查 `asset_code` 是否为 `USDT-ERC20` 或 `USDT-TRC20`
- 检查是否配置了对应的收款地址
- 检查 `userId` 是否提供

### 2. Webhook 处理失败
- 检查 `orderId` 是否正确
- 检查 `toAddress` 是否匹配订单的收款地址
- 检查 `contractAddress` 是否匹配标准 USDT 合约地址
- 检查 `amount` 是否在允许误差范围内（±1%）

### 3. 钱包入账失败
- 检查订单是否有 `userId` 和 `assetCode`
- 检查 `WalletTaskService` 是否正常初始化
- 查看日志中的错误信息

### 4. 监听服务未启动
- 检查 `ENABLE_BLOCKCHAIN_LISTENER=true`
- 检查 `LISTENER_TYPE` 配置是否正确
- 检查对应的 API Key/Project ID 是否配置
- 查看服务启动日志

## 测试数据准备

### 1. 准备测试钱包地址
- Ethereum 地址（用于 ERC20-USDT）
- Tron 地址（用于 TRC20-USDT）

### 2. 配置环境变量
参考上面的配置示例

### 3. 启动服务
```bash
cd mxmpay
pnpm install
pnpm dev
```

### 4. 测试流程
1. 创建订单 → 获取二维码
2. 手动触发 webhook（或真实支付）
3. 验证订单状态和钱包余额

## 注意事项

1. **金额单位**：Webhook 中的 `amount` 需要是最小单位（6位小数），例如 100.5 USDT = 100500000
2. **订单匹配**：通过 `toAddress` 和 `amount`（允许 ±1% 误差）匹配订单
3. **防重复处理**：系统会检查订单状态，已处理的订单不会重复处理
4. **监听服务**：本地监听需要 RPC 节点连接，Alchemy/Infura 需要配置 API Key

