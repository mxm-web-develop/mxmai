## 代码架构

### 技术栈

本项目是一个基于 Node.js 的支付服务后端，采用 TypeScript 开发，核心框架为 Express。

| 技术/库 | 版本/说明 | 用途 |
| :--- | :--- | :--- |
| **Runtime** | Node.js | 服务器运行时环境 |
| **语言** | TypeScript | 提供静态类型检查，提升代码可维护性 |
| **Web 框架** | Express ^4.18.2 | 处理 HTTP 请求和路由的核心框架 |
| **数据交互** | @mxmai/mxmdata@workspace:* | 内部数据访问模块 |
| **HTTP 客户端** | axios ^1.13.2 | 用于发起外部 HTTP 请求（如调用第三方 API） |
| **安全与校验** | cors ^2.8.5, express-validator ^7.0.1 | 处理跨域请求和请求参数验证 |
| **区块链交互** | ethers ^6.15.0 | 与以太坊兼容的区块链进行交互 |
| **工具库** | decimal.js ^10.4.3, qrcode ^1.5.3, node-cron ^3.0.3 | 高精度计算、生成二维码、定时任务 |
| **环境管理** | dotenv ^16.3.1 | 管理环境变量 |

### 目录结构

项目源码主要位于 `src/` 目录下，采用按功能分层的组织结构。

```
src/
├── api/                    # API 路由层
│   ├── payment.routes.ts      # 支付相关路由
│   ├── wallet.routes.ts       # 钱包相关路由
│   └── webhook.routes.ts      # 第三方回调（Webhook）路由
├── common/                 # 公共模块
│   ├── middleware/           # 中间件
│   │   └── validation.middleware.ts # 请求验证中间件
│   └── qr.service.ts         # 二维码生成服务
├── config/                 # 配置模块
│   ├── env.ts               # 环境变量配置与验证
│   └── swagger.ts           # API 文档配置
├── payment/                # 支付核心业务模块
│   ├── listeners/           # 区块链事件监听器
│   │   ├── listener.interface.ts    # 监听器接口
│   │   ├── listener.factory.ts      # 监听器工厂
│   │   ├── alchemy-listener.service.ts
│   │   ├── blockchain-listener.service.ts
│   │   └── infura-listener.service.ts
│   ├── providers/           # 支付渠道提供商（策略模式）
│   │   ├── payment-gateway.interface.ts # 支付网关接口
│   │   ├── gateway.factory.ts          # 支付网关工厂
│   │   ├── alipay.gateway.ts           # 支付宝
│   │   ├── apple-iap.gateway.ts        # 苹果应用内支付
│   │   ├── card.gateway.ts             # 银行卡
│   │   ├── crypto.gateway.ts           # 加密货币
│   │   ├── paypal.gateway.ts           # PayPal
│   │   ├── voucher.gateway.ts          # 代金券
│   │   └── wechat.gateway.ts           # 微信支付
│   ├── payment.expiration.scheduler.ts # 支付过期定时任务
│   └── payment.service.ts   # 支付核心业务逻辑服务
├── wallet/                  # 钱包管理模块
│   ├── default-assets.ts    # 默认资产配置
│   ├── wallet.service.ts    # 钱包业务逻辑服务
│   └── wallet-task.service.ts # 钱包相关定时任务
├── app.ts                   # Express 应用初始化与中间件配置
├── index.ts                 # 应用入口点（服务器启动）
├── run-test.ts              # 测试运行入口
└── server.ts                # HTTP/HTTPS 服务器创建与启动
```

### 模块关系

核心业务流遵循分层架构：**请求** -> **路由** -> **服务** -> **数据/外部服务**。

```mermaid
graph TD
    A[客户端请求] --> B[api/ 路由层];
    B --> C[common/middleware 验证];
    C --> D[payment.service / wallet.service];
    
    subgraph “支付流程”
        D --> E[gateway.factory];
        E --> F[providers/ 具体支付网关];
        F --> G[第三方支付平台];
        G --> H[api/webhook.routes 回调];
    end

    subgraph “钱包与监听”
        D --> I[wallet.service];
        I --> J[listener.factory];
        J --> K[listeners/ 区块链监听器];
        K --> L[区块链节点];
    end

    D --> M[@mxmai/mxmdata];
    N[node-cron 定时任务] --> O[payment.expiration.scheduler];
    N --> P[wallet-task.service];
```

### 设计模式

1.  **策略模式 (Strategy Pattern)**
    *   **应用场景**：`payment/providers/` 目录下的各种支付网关（如支付宝、微信、加密货币等）。
    *   **实现**：所有具体网关类（如 `AlipayGateway`）都实现统一的 `PaymentGatewayInterface` 接口。`GatewayFactory` 根据支付类型动态创建对应的网关实例。这使得新增一种支付方式只需添加一个新的策略类，无需修改核心业务逻辑。

2.  **工厂模式 (Factory Pattern)**
    *   **应用场景**：
        *   `GatewayFactory`：用于创建具体的支付网关实例，是策略模式的典型伴侣。
        *   `ListenerFactory`：用于创建不同的区块链事件监听器实例（如 Alchemy, Infura），封装了具体监听器的实例化逻辑。

3.  **依赖注入 (Dependency Injection)**
    *   **应用场景**：在整个项目中，服务类（如 `PaymentService`, `WalletService`）所需的依赖（如数据访问层、其他服务、工厂）通常通过构造函数注入。这提高了代码的可测试性和可维护性，降低了模块间的耦合度。

4.  **接口隔离**
    *   **应用场景**：`PaymentGatewayInterface` 和 `ListenerInterface` 明确了模块间的契约。所有支付网关和区块链监听器都围绕接口进行编程，确保了系统各部分的替换性和扩展性。