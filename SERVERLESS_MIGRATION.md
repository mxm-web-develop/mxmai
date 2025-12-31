# Serverless 迁移方案

## 📋 概述

本文档详细说明如何将当前基于 Express.js 的微服务架构迁移到 Serverless 架构，包括技术方案、实施步骤和时间估算。

## ⚠️ 重要决策建议

**根据当前项目特性，建议采用混合架构，而非全量 Serverless！**

### 核心结论

1. **复杂系统 + 高流量 = Serverless 成本可能更高**
   - 月请求量 > 500 万次时，Serverless 成本可能比传统服务器高 5-10 倍
   - 复杂业务逻辑（执行时间长）会显著增加计算成本

2. **推荐方案：选择性使用 Serverless**
   - ✅ **适合 Serverless**：mxmauth（认证）、mxmnotify（通知）- 低频率、简单逻辑
   - ❌ **不适合 Serverless**：Gateway（高流量）、mxmpay（复杂逻辑）、区块链监听（长期运行）
   - ⚠️ **视情况而定**：mxmcgi（AI 生成可能超时）、mxmagent（根据实际流量）

3. **成本对比（高流量场景）**
   - 5000 万次/月请求：Serverless 约 $1,200/月 vs 传统服务器 $200-400/月
   - **Serverless 反而贵 3-6 倍！**

### 快速决策树

```
你的系统月请求量是多少？
│
├─ < 100万次 → ✅ 推荐 Serverless（成本低，部署简单）
│
├─ 100-500万次 → ⚠️ 需要详细评估（混合方案可能更好）
│
└─ > 500万次 → ❌ 不推荐全量 Serverless（成本高，建议传统服务器）
```

## 🎯 目标

- 支持主流 Serverless 平台（Vercel、AWS Lambda、Cloudflare Workers、阿里云函数计算等）
- 保持现有 API 接口兼容性
- **优化成本（根据实际流量选择）**
- 最小化代码改动

## 🔍 当前架构分析

### 服务列表
1. **gateway** - API 网关（Express）
2. **mxmauth** - 认证服务（Express）
3. **mxmpay** - 支付服务（Express）
4. **mxmcgi** - 内容生成服务（Express）
5. **mxmagent** - Agent 服务（Express）
6. **mxmnotify** - 通知服务（Express）
7. **mxmdata** - 数据访问层（共享库）

### 关键挑战

#### 1. **长期运行的后台任务**
- ❌ **区块链监听服务** (`blockchain-listener.service.ts`)
  - 使用轮询机制，需要长期运行
  - 不适合 Serverless 函数（有执行时间限制）

#### 2. **定时任务**
- ❌ **支付过期检查** (`payment.expiration.scheduler.ts`)
  - 使用 `node-cron` 每分钟执行
  - 需要迁移到 Serverless 定时触发器

#### 3. **Express 应用启动方式**
- ❌ 所有服务使用 `app.listen()` 启动
- ✅ 需要改为导出 handler 函数

#### 4. **数据库连接池**
- ⚠️ 需要优化连接管理（Serverless 函数生命周期短）

## 🚀 迁移方案

### 方案一：混合架构（强烈推荐）⭐⭐⭐

**核心思路**：**只迁移适合的服务到 Serverless，高流量和复杂服务保留传统部署。**

**这是最实际和经济的方案！**

#### 架构设计

```
┌─────────────────────────────────────────┐
│         Serverless Functions            │
│  ┌──────────┐  ┌──────────┐            │
│  │ Gateway  │  │ mxmauth  │            │
│  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐            │
│  │ mxmpay   │  │ mxmcgi   │            │
│  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐            │
│  │mxmagent  │  │mxmnotify │            │
│  └──────────┘  └──────────┘            │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│      Scheduled Functions (Cron)         │
│  ┌──────────────────────────────────┐   │
│  │ Payment Expiration Checker       │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│    Background Services (Container)       │
│  ┌──────────────────────────────────┐   │
│  │ Blockchain Listener Service      │   │
│  │ (长期运行，轮询区块链)              │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### 优势
- ✅ **成本优化**：只对低流量服务使用 Serverless，高流量服务用传统服务器
- ✅ **灵活性**：根据服务特性选择最佳部署方式
- ✅ **渐进式迁移**：可以逐个服务迁移，风险可控
- ✅ **实际可行**：避免高流量场景下的成本陷阱

#### 劣势
- ⚠️ 需要维护两套部署流程（Serverless + 传统服务器）
- ⚠️ 冷启动延迟（Serverless 服务）
- ⚠️ 执行时间限制（Serverless 服务，通常 10-15 分钟）

#### 服务分配建议

**Serverless 部署：**
- mxmauth（认证服务）- 请求频率低
- mxmnotify（通知服务）- 请求频率低

**传统服务器部署：**
- Gateway（API 网关）- 所有请求都经过，流量大
- mxmpay（支付服务）- 业务逻辑复杂，需要稳定
- mxmcgi（内容生成）- 可能执行时间长，需要长连接
- mxmagent（Agent 服务）- 根据实际流量决定
- 区块链监听服务 - 必须长期运行

---

### 方案二：全 Serverless + 事件驱动

**核心思路**：所有服务都迁移到 Serverless，后台任务改为事件驱动。

#### 架构设计

```
API Functions (Serverless)
    │
    ├─► 支付创建 → 写入数据库 → 触发定时检查
    │
    └─► 区块链事件 → Webhook → 处理支付
         │
         └─► 使用第三方服务（如 Alchemy Notify、Infura Webhooks）
```

#### 区块链监听替代方案

1. **使用第三方 Webhook 服务**
   - Alchemy Notify（Ethereum/Arbitrum/Polygon）
   - Infura Webhooks
   - TronGrid Webhooks（Tron）

2. **使用数据库触发器 + 定时函数**
   - 订单创建时设置过期时间
   - 定时函数检查过期订单（每分钟）

3. **使用消息队列**
   - 订单创建时发送延迟消息
   - 消息队列在过期时触发处理

#### 优势
- ✅ 完全 Serverless，无需管理服务器
- ✅ 事件驱动，更符合现代架构

#### 劣势
- ⚠️ 依赖第三方服务（可能有成本）
- ⚠️ 需要重构区块链监听逻辑
- ⚠️ 复杂度较高

---

### 方案三：Serverless Framework 统一管理

**核心思路**：使用 Serverless Framework 或类似工具统一管理所有函数。

#### 工具选择
- **Serverless Framework** - 跨平台，支持 AWS、Azure、GCP、阿里云等
- **Vercel** - 对 Next.js/Express 友好，部署简单
- **AWS SAM** - AWS 专用
- **Terraform** - 基础设施即代码

---

## 📝 实施步骤

### 阶段一：基础设施准备（1-2 周）

#### 1.1 创建 Serverless 适配层

创建通用的 Serverless handler 包装器：

```typescript
// src/serverless/handler.ts
import type { Express } from 'express';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import serverless from 'serverless-http';

export function createServerlessHandler(app: Express) {
  const handler = serverless(app, {
    binary: ['image/*', 'video/*', 'audio/*'],
  });

  return async (
    event: APIGatewayProxyEvent,
    context: Context
  ): Promise<APIGatewayProxyResult> => {
    // 设置超时警告
    context.callbackWaitsForEmptyEventLoop = false;
    
    return handler(event, context);
  };
}
```

#### 1.2 修改服务入口

**Before:**
```typescript
// mxmauth/src/index.ts
app.listen(port, () => {
  console.log(`mxmauth service listening on port ${port}`);
});
```

**After:**
```typescript
// mxmauth/src/index.ts
import { createServerlessHandler } from '../serverless/handler';

const app = express();
// ... 配置 app ...

// 传统模式（开发环境）
if (process.env.NODE_ENV !== 'serverless') {
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`mxmauth service listening on port ${port}`);
  });
}

// Serverless 模式
export const handler = createServerlessHandler(app);
```

#### 1.3 优化数据库连接

```typescript
// mxmdata/src/adapters/supabase/connection-pool.ts
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(url, key);
  }
  return client;
}

// Serverless 环境：每次请求后清理连接
export function cleanupConnections() {
  // 在 Serverless 环境中，函数结束后会自动清理
  // 但可以显式关闭连接以释放资源
  if (client) {
    // Supabase 客户端通常不需要显式关闭
    // 但可以重置状态
    client = null;
  }
}
```

### 阶段二：迁移 API 服务（2-3 周）

#### 2.1 迁移顺序（按优先级）

1. **mxmauth** - 认证服务（最简单，无后台任务）
2. **mxmnotify** - 通知服务（简单）
3. **mxmagent** - Agent 服务（中等）
4. **mxmcgi** - 内容生成（可能有长时间任务）
5. **gateway** - 网关（需要适配代理逻辑）
6. **mxmpay** - 支付服务（最复杂，有定时任务）

#### 2.2 每个服务的迁移步骤

1. 创建 `serverless/handler.ts` 适配器
2. 修改 `src/index.ts` 支持双模式
3. 创建 `serverless.yml` 配置文件
4. 测试本地运行
5. 部署到 Serverless 平台
6. 验证功能

### 阶段三：处理定时任务（1 周）

#### 3.1 支付过期检查迁移

**Before:**
```typescript
// 使用 node-cron
const scheduler = new PaymentExpirationScheduler(paymentRepo);
scheduler.start();
```

**After:**
```typescript
// serverless/functions/expire-payments.ts
import { PaymentExpirationScheduler } from '../../src/payment/payment.expiration.scheduler';
import { RepositoryFactory } from '@mxmai/mxmdata';

export const handler = async () => {
  const paymentRepo = RepositoryFactory.createPaymentRepository();
  const scheduler = new PaymentExpirationScheduler(paymentRepo);
  
  const count = await scheduler.sweepExpired();
  
  return {
    statusCode: 200,
    body: JSON.stringify({ expired: count }),
  };
};
```

**serverless.yml 配置:**
```yaml
functions:
  expirePayments:
    handler: serverless/functions/expire-payments.handler
    events:
      - schedule: rate(1 minute)  # AWS EventBridge
      # 或
      - schedule: cron(* * * * *)  # Vercel Cron
```

### 阶段四：处理区块链监听（2-3 周）

#### 4.1 方案 A：使用第三方 Webhook 服务（推荐）

**Alchemy Notify 示例:**
```typescript
// serverless/functions/blockchain-webhook.ts
export const handler = async (event: any) => {
  // Alchemy 发送的 webhook
  const { event: { activity } } = JSON.parse(event.body);
  
  // 处理转账事件
  if (activity[0].category === 'token') {
    await processPayment(activity[0]);
  }
  
  return { statusCode: 200 };
};
```

**配置步骤:**
1. 注册 Alchemy/Infura 账号
2. 创建 Webhook 端点（指向 Serverless 函数）
3. 配置监听地址和事件类型
4. 处理 webhook 事件

#### 4.2 方案 B：保留独立服务（简单但成本高）

- 使用 Docker 容器部署区块链监听服务
- 部署到 ECS、Kubernetes 或专用服务器
- 通过环境变量配置 Serverless 函数 URL

### 阶段五：Gateway 适配（1 周）

#### 5.1 Serverless Gateway 挑战

- Serverless 函数之间不能直接代理
- 需要改为 API Gateway 路由或函数内调用

**方案 A：使用平台 API Gateway**
```yaml
# serverless.yml
functions:
  gateway:
    handler: gateway/src/index.handler
    events:
      - http:
          path: /api/v1/{proxy+}
          method: ANY
          integration: lambda-proxy
```

**方案 B：函数内路由（推荐）**
```typescript
// gateway/src/routes/proxy.ts
export async function proxyRequest(path: string, req: any) {
  const serviceMap = {
    '/api/v1/account': process.env.MXMAUTH_FUNCTION_URL,
    '/api/v1/payment': process.env.MXMPAY_FUNCTION_URL,
    // ...
  };
  
  const targetUrl = serviceMap[path];
  if (!targetUrl) {
    throw new Error('Service not found');
  }
  
  // 调用其他 Serverless 函数
  return await fetch(`${targetUrl}${req.path}`, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
}
```

---

## 🛠️ 技术选型

### 平台对比

| 平台 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| **Vercel** | 部署简单，对 Express 友好，全球 CDN | 执行时间限制 10s（Pro 60s） | 前端 API、简单后端 |
| **AWS Lambda** | 功能强大，执行时间 15 分钟，生态完善 | 配置复杂，冷启动较慢 | 企业级应用 |
| **Cloudflare Workers** | 全球边缘计算，冷启动极快 | 执行时间限制 30s（Pro 15 分钟） | 高并发、低延迟 |
| **阿里云函数计算** | 国内访问快，价格便宜 | 生态相对较小 | 国内业务 |
| **Netlify Functions** | 与前端集成好 | 功能相对简单 | 全栈应用 |

### 推荐方案

- **开发/测试环境**: Vercel（部署简单）
- **生产环境**: AWS Lambda + API Gateway（功能完整）
- **高并发场景**: Cloudflare Workers（边缘计算）

---

## 📦 依赖管理

### 需要添加的依赖

```json
{
  "dependencies": {
    "serverless-http": "^3.2.0"  // Express 转 Serverless
  },
  "devDependencies": {
    "serverless": "^3.38.0",           // Serverless Framework
    "serverless-offline": "^13.3.3",    // 本地测试
    "@types/aws-lambda": "^8.10.130"    // TypeScript 类型
  }
}
```

---

## ⏱️ 时间估算

### 总时间：**6-8 周**

| 阶段 | 任务 | 时间 | 人员 |
|------|------|------|------|
| **阶段一** | 基础设施准备 | 1-2 周 | 1-2 人 |
| **阶段二** | 迁移 API 服务 | 2-3 周 | 2-3 人 |
| **阶段三** | 处理定时任务 | 1 周 | 1 人 |
| **阶段四** | 处理区块链监听 | 2-3 周 | 1-2 人 |
| **阶段五** | Gateway 适配 | 1 周 | 1 人 |
| **测试与优化** | 全链路测试、性能优化 | 1-2 周 | 全员 |

### 快速方案（MVP）：**2-3 周**

如果只需要快速验证，可以：
1. 先迁移 1-2 个简单服务（mxmauth、mxmnotify）
2. 定时任务暂时保留在传统服务器
3. 区块链监听暂时保留在传统服务器
4. Gateway 使用平台 API Gateway 路由

---

## 🧪 测试策略

### 1. 本地测试

```bash
# 使用 serverless-offline
npm install -g serverless
npm install --save-dev serverless-offline

# 本地运行
serverless offline
```

### 2. 集成测试

- 使用 Serverless 平台的测试环境
- 验证 API 功能完整性
- 测试冷启动性能

### 3. 性能测试

- 冷启动时间
- 并发处理能力
- 数据库连接池性能

---

## 💰 成本分析与决策指南

### ⚠️ 重要提醒：Serverless 成本陷阱

**对于复杂系统和高流量场景，Serverless 可能比传统服务器更昂贵！**

#### 成本构成分析

**Serverless 成本 = 请求次数成本 + 计算时间成本 + 数据传输成本 + 其他服务成本**

##### AWS Lambda 详细成本（2024）

1. **请求成本**
   - 免费：每月 100 万次
   - 超出：$0.20/百万次

2. **计算成本**
   - 免费：每月 40 万 GB-秒
   - 超出：$0.0000166667/GB-秒
   - 假设：128MB 内存，平均执行 200ms
   - 单次请求成本：128MB × 0.2s = 0.0256 GB-秒 = $0.000000427

3. **实际案例计算**

**场景 A：中等流量系统**
- 请求量：500 万次/月
- 平均执行时间：200ms
- 内存：512MB
- 计算：
  - 请求成本：(500-100) × $0.20 = $80
  - 计算成本：(500万 × 512MB × 0.2s) / 1024 = 500,000 GB-秒
  - 超出免费额度：500,000 - 400,000 = 100,000 GB-秒
  - 计算费用：100,000 × $0.0000166667 = **$1.67**
  - **总成本：约 $82/月**

**场景 B：高流量系统**
- 请求量：5000 万次/月（约 19 次/秒）
- 平均执行时间：300ms（复杂业务逻辑）
- 内存：1024MB
- 计算：
  - 请求成本：(5000-100) × $0.20 = $980
  - 计算成本：(5000万 × 1024MB × 0.3s) / 1024 = 15,000,000 GB-秒
  - 超出免费额度：15,000,000 - 400,000 = 14,600,000 GB-秒
  - 计算费用：14,600,000 × $0.0000166667 = **$243**
  - **总成本：约 $1,223/月** 💸

**对比传统服务器（同等流量）**
- 2 台 4核8G 服务器（负载均衡）
- 云服务器成本：约 $100-200/月
- **节省：Serverless 反而贵 6-12 倍！**

### 📊 成本对比表（更详细）

| 场景 | 月请求量 | 传统服务器 | Serverless | 成本比 | 推荐方案 |
|------|---------|-----------|------------|--------|----------|
| **极低流量** | < 10万 | $50-100 | $0-5 | 10-20倍便宜 | ✅ Serverless |
| **低流量** | 10-100万 | $100-200 | $5-20 | 5-10倍便宜 | ✅ Serverless |
| **中等流量** | 100-500万 | $200-500 | $20-100 | 2-5倍便宜 | ⚠️ 需评估 |
| **高流量** | 500-2000万 | $500-1000 | $100-500 | 相当或更贵 | ❌ 传统服务器 |
| **极高流量** | > 2000万 | $1000+ | $500-2000+ | 更贵 | ❌ 传统服务器 |

### 🎯 决策框架

#### 什么时候选择 Serverless？

✅ **适合 Serverless 的场景：**
1. **流量波动大**：有流量高峰和低谷，传统服务器大部分时间闲置
2. **低到中等流量**：月请求量 < 500 万次
3. **简单业务逻辑**：执行时间 < 500ms
4. **快速迭代**：需要快速部署和测试
5. **成本敏感（低流量）**：初期用户少，希望零成本或低成本运行
6. **无状态服务**：不需要长期连接或会话

#### 什么时候选择传统服务器？

✅ **适合传统服务器的场景：**
1. **高流量稳定**：月请求量 > 500 万次，且流量相对稳定
2. **复杂业务逻辑**：执行时间 > 1 秒，需要大量计算
3. **长期连接**：WebSocket、SSE、长轮询等
4. **后台任务**：定时任务、消息队列消费者、区块链监听
5. **成本优化（高流量）**：高流量下传统服务器更便宜
6. **可预测负载**：流量模式可预测，可以合理规划服务器资源

### 💡 混合方案（最佳实践）

**推荐架构：根据服务特性选择部署方式**

```
┌─────────────────────────────────────────┐
│   Serverless Functions (低流量/波动大)    │
│  ┌──────────┐  ┌──────────┐            │
│  │ mxmauth  │  │mxmnotify │            │
│  └──────────┘  └──────────┘            │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  传统服务器 (高流量/复杂逻辑/后台任务)     │
│  ┌──────────┐  ┌──────────┐            │
│  │ Gateway  │  │ mxmpay   │            │
│  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐            │
│  │ mxmcgi   │  │mxmagent  │            │
│  └──────────┘  └──────────┘            │
│  ┌──────────────────────────────────┐   │
│  │ Blockchain Listener (长期运行)    │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### 服务分类建议

| 服务 | 特性 | 推荐方案 | 理由 |
|------|------|----------|------|
| **mxmauth** | 低频率、简单逻辑 | ✅ Serverless | 认证请求频率低，逻辑简单 |
| **mxmnotify** | 低频率、推送通知 | ✅ Serverless | 通知请求不多，适合按需计费 |
| **Gateway** | 高频率、路由转发 | ❌ 传统服务器 | 所有请求都经过，流量大 |
| **mxmpay** | 高频率、复杂逻辑 | ❌ 传统服务器 | 支付逻辑复杂，需要稳定 |
| **mxmcgi** | 中等频率、长时间任务 | ❌ 传统服务器 | AI 生成可能超时，需要长连接 |
| **mxmagent** | 中等频率、复杂逻辑 | ⚠️ 视情况 | 根据实际流量决定 |
| **区块链监听** | 长期运行、轮询 | ❌ 传统服务器 | 必须长期运行，不适合 Serverless |

### 📈 成本优化建议

#### 如果选择 Serverless：

1. **减少执行时间**
   - 优化代码逻辑
   - 使用缓存（Redis）
   - 异步处理非关键路径

2. **减少内存使用**
   - 合理设置内存大小（不要过度分配）
   - 清理不必要的依赖

3. **使用 Provisioned Concurrency（谨慎）**
   - 可以消除冷启动，但会增加成本
   - 只对关键路径使用

4. **批量处理**
   - 合并多个操作到一个请求
   - 减少函数调用次数

#### 如果选择传统服务器：

1. **合理规划资源**
   - 根据实际流量选择配置
   - 使用负载均衡和自动扩缩容

2. **容器化部署**
   - Docker + Kubernetes
   - 更容易管理和扩展

3. **混合云策略**
   - 核心服务自建
   - 边缘服务用 Serverless

---

## ⚠️ 注意事项

### 1. 冷启动优化
- 使用 Provisioned Concurrency（AWS）
- 定期预热函数
- 减少依赖包大小

### 2. 执行时间限制
- Vercel: 10s (Hobby) / 60s (Pro)
- AWS Lambda: 15 分钟
- Cloudflare Workers: 30s (Free) / 15 分钟 (Pro)

### 3. 环境变量管理
- 使用平台的环境变量配置
- 敏感信息使用 Secrets Manager

### 4. 日志和监控
- 使用平台提供的日志服务
- 集成 APM 工具（如 Datadog、New Relic）

---

## 📚 参考资料

- [Serverless Framework 文档](https://www.serverless.com/framework/docs)
- [AWS Lambda 最佳实践](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)

---

## ✅ 检查清单

### 迁移前
- [ ] 评估当前架构和依赖
- [ ] 选择 Serverless 平台
- [ ] 制定详细迁移计划
- [ ] 准备测试环境

### 迁移中
- [ ] 创建 Serverless 适配层
- [ ] 逐个迁移服务
- [ ] 迁移定时任务
- [ ] 处理后台服务
- [ ] 更新 Gateway

### 迁移后
- [ ] 全链路功能测试
- [ ] 性能测试和优化
- [ ] 监控和告警配置
- [ ] 文档更新
- [ ] 团队培训

---

## 🎯 下一步行动

### 第一步：评估当前流量（重要！）

**在决定是否使用 Serverless 之前，必须先了解实际流量！**

```bash
# 评估指标
1. 当前月请求量是多少？
2. 峰值 QPS（每秒请求数）是多少？
3. 平均响应时间是多少？
4. 流量波动大吗？（有高峰和低谷）
```

**如果月请求量 > 500 万次，强烈建议使用传统服务器！**

### 第二步：决策阶段（本周）

1. **评估流量和成本**
   - 使用成本计算器（见下方）估算 Serverless 成本
   - 对比传统服务器成本
   - 做出决策

2. **选择部署方案**
   - 如果选择混合方案：确定哪些服务用 Serverless
   - 如果选择传统服务器：规划服务器配置和部署方式

3. **分配人员和资源**

### 第三步：POC 阶段（1-2 周，如果选择 Serverless）

- 选择 1 个简单服务（如 mxmauth）做 POC
- 验证技术方案可行性
- **实际测试成本**（运行 1 周，记录真实成本）
- 评估性能和稳定性

### 第四步：正式迁移（按计划执行）

- 按照阶段逐步迁移
- 持续监控成本和性能
- 根据实际情况调整方案

---

## 📊 成本计算器

### 快速成本估算公式

**Serverless 成本（AWS Lambda）：**

```
月成本 = 请求成本 + 计算成本

请求成本 = (月请求量 - 100万) × $0.20 / 100万
计算成本 = (月请求量 × 内存MB × 执行时间秒 / 1024 - 40万) × $0.0000166667
```

**示例计算：**

假设你的系统：
- 月请求量：1000 万次
- 平均执行时间：200ms
- 内存：512MB

```
请求成本 = (1000 - 100) × $0.20 = $180
计算成本 = (1000万 × 512 × 0.2 / 1024 - 40) × $0.0000166667
         = (1,000,000 - 400,000) × $0.0000166667
         = $10

总成本 ≈ $190/月
```

**对比传统服务器：**
- 2 台 4核8G 服务器 ≈ $150-200/月
- **结论：Serverless 和传统服务器成本相当，但传统服务器更稳定可控**

---

**最后更新**: 2024-12-19
**文档维护**: 架构团队

