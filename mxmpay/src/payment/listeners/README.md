# 区块链监听服务

支持三种监听方式，通过 `LISTENER_TYPE` 环境变量选择：
- `local` - 自建监听服务（使用公共 RPC 节点轮询）
- `alchemy` - 使用 Alchemy Webhook 服务
- `infura` - 使用 Infura Webhook 服务

## 安装依赖

```bash
cd mxmpay
pnpm add ethers tronweb axios
```

## 配置环境变量

在 `mxmpay/.env` 中添加：

```bash
# 监听类型: local | alchemy | infura
LISTENER_TYPE=local

# 启用区块链监听服务
ENABLE_BLOCKCHAIN_LISTENER=true

# ========== 本地监听服务配置 (LISTENER_TYPE=local) ==========
# Ethereum RPC 节点（可以使用公共节点或自建节点）
ETH_RPC_URL=https://eth.llamarpc.com
# 或使用 Infura: https://mainnet.infura.io/v3/YOUR_API_KEY
# 或使用 Alchemy: https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Tron RPC 节点（可以使用公共节点或自建节点）
TRON_RPC_URL=https://api.trongrid.io

# 轮询间隔（毫秒，默认 10 秒）
POLL_INTERVAL=10000

# ========== Alchemy 配置 (LISTENER_TYPE=alchemy) ==========
ALCHEMY_API_KEY=your_alchemy_api_key

# ========== Infura 配置 (LISTENER_TYPE=infura) ==========
INFURA_PROJECT_ID=your_infura_project_id
INFURA_PROJECT_SECRET=your_infura_project_secret

# ========== 通用配置 ==========
# Webhook 回调地址（所有监听类型都需要）
WEBHOOK_URL=http://localhost:3001/payment/webhook/crypto
# 生产环境: https://your-domain.com/api/v1/payment/webhook/crypto
```

## 使用方法

### 方式 1：集成到 mxmpay 服务中（推荐）

监听服务已集成到 `mxmpay` 服务中，只需配置环境变量即可：

```bash
# 选择监听类型
LISTENER_TYPE=local  # 或 alchemy 或 infura

# 启用监听服务
ENABLE_BLOCKCHAIN_LISTENER=true
```

启动服务后，监听服务会自动启动。

### 方式 2：作为独立服务运行

创建 `src/payment/listeners/listener.ts`:

```typescript
import { ListenerFactory } from './listener.factory';

const listener = ListenerFactory.create();

// 启动监听
listener.start().catch(console.error);

// 优雅退出
process.on('SIGINT', () => {
  listener.stop();
  process.exit(0);
});
```

运行：

```bash
tsx src/payment/listeners/listener.ts
```

## 工作原理

### 本地监听服务 (LISTENER_TYPE=local)

1. **Ethereum (ERC20-USDT)**:
   - 使用 `ethers.js` 连接 Ethereum RPC 节点
   - 轮询新区块，监听 ERC20 Transfer 事件
   - 过滤条件：`to` = 收款地址，`contractAddress` = USDT 合约地址
   - 检测到转账后，查找对应的支付订单并发送 webhook

2. **Tron (TRC20-USDT)**:
   - 使用 `tronweb` 连接 Tron RPC 节点
   - 轮询新区块，解析 TRC20 Transfer 交易
   - 过滤条件：`to` = 收款地址，`contractAddress` = USDT 合约地址
   - 检测到转账后，查找对应的支付订单并发送 webhook

### Alchemy 监听服务 (LISTENER_TYPE=alchemy)

1. **Ethereum (ERC20-USDT)**:
   - 使用 Alchemy Dashboard API 创建 Webhook
   - Alchemy 自动监听地址活动并发送回调
   - 系统接收回调后，查找对应的支付订单并更新状态

2. **Tron (TRC20-USDT)**:
   - Alchemy 不支持 Tron，需要配合本地监听或 TronGrid

### Infura 监听服务 (LISTENER_TYPE=infura)

1. **Ethereum (ERC20-USDT)**:
   - 使用 Infura API 创建 Webhook
   - Infura 自动监听地址活动并发送回调
   - 系统接收回调后，查找对应的支付订单并更新状态

2. **Tron (TRC20-USDT)**:
   - Infura 不支持 Tron，需要配合本地监听或 TronGrid

## 注意事项

1. **订单匹配**：
   - 当前实现中 `findPaymentOrder` 方法需要完善
   - 需要连接数据库查询支付订单
   - 建议通过 `toAddress` 和 `amount`（允许误差）匹配订单

2. **RPC 节点**：
   - 公共节点可能有速率限制
   - 生产环境建议使用付费服务（Infura、Alchemy）或自建节点
   - 自建节点需要同步完整区块链数据

3. **性能优化**：
   - 轮询间隔建议 10-30 秒
   - 可以只监听最近的几个区块（如最近 100 个区块）
   - 使用事件过滤器减少查询量

4. **错误处理**：
   - RPC 节点可能不稳定，需要重试机制
   - 建议记录所有检测到的交易，便于后续对账

5. **防重复处理**：
   - 建议在数据库中记录已处理的 `txHash`
   - 避免重复发送 webhook

## 与第三方服务对比

### 自建监听服务的优势：
- ✅ 完全自主控制
- ✅ 无第三方依赖
- ✅ 数据隐私保护
- ✅ 可定制化

### 自建监听服务的劣势：
- ❌ 需要维护 RPC 节点连接
- ❌ 需要处理节点故障
- ❌ 需要自己实现订单匹配逻辑
- ❌ 需要处理区块重组等情况

### 第三方服务的优势：
- ✅ 稳定可靠
- ✅ 自动处理各种边界情况
- ✅ 提供完善的 API

### 第三方服务的劣势：
- ❌ 可能有费用
- ❌ 依赖外部服务
- ❌ 数据可能经过第三方

## 生产环境建议

1. **使用进程管理器**（如 PM2）运行监听服务
2. **添加监控和告警**，确保服务正常运行
3. **记录日志**，便于排查问题
4. **实现订单匹配逻辑**，确保准确匹配支付订单
5. **添加防重复处理机制**，避免重复入账

