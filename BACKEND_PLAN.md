# 后端项目规划文档

## 一、项目架构

### 1.1 微服务模块划分

```
mxmai-backend/
├── mxmdata/          # 数据访问层
│   ├── adapters/     # 适配器（Supabase、PostgreSQL、MinIO等）
│   ├── repositories/ # 数据仓库抽象
│   ├── models/       # 数据模型
│   └── interfaces/   # 接口定义
├── mxmpay/          # 支付业务模块
├── mxmauth/         # 用户管理业务模块
├── mxmcgi/          # AI多媒体生成业务模块
├── mxmagent/        # 助手业务模块
├── mxmnotify/       # 通知业务模块
└── gateway/         # API网关
```

### 1.2 技术栈建议

- **运行时**: Node.js 22.14.0+
- **框架**: Express.js / TypeScript / tsup / tsx
- **数据库**: 
  - **Supabase** (推荐) - 基于PostgreSQL的数据分发中心，提供REST API和实时功
  - **MinIO** - S3兼容的对象存储，用于媒体文件
  - **Redis** - 缓存、会话
  - **MongoDB** - 用于日志、非结构化数据
- **认证**: JWT + Refresh Token
- **文件存储**: AWS S3 / MinIO
- **消息队列**: RabbitMQ / Redis Streams
- **API文档**: Swagger/OpenAPI
- **监控**: Prometheus + Grafana
- **日志**: Winston / Pino

---

## 二、模块概览

### 2.1 mxmdata - 数据访问层

统一的数据访问层，所有业务模块通过此层访问数据。

**核心职责：**
- 提供统一的Repository接口
- 支持多种数据存储适配器（Supabase、PostgreSQL、MinIO）
- 业务模块与数据存储解耦

**详细设计：** 参见 [MXMDATA.md](./MXMDATA.md)

---

### 2.2 mxmauth - 用户管理模块

**核心功能：**
- 用户注册/登录
- 用户信息管理
- 用户设置（主题、语言）
- 用户等级/会员管理
- 账户安全

**详细设计：** 参见 [MXMAUTH.md](./MXMAUTH.md)

---

### 2.3 mxmpay - 支付业务模块

**核心功能：**
- 订单管理（统一的订单创建、查询、状态管理）
- 多支付网关（微信、支付宝、PayPal、Visa等）
- 支付回调处理
- 订单状态流转
- 支付统计

**详细设计：** 参见 [MXMPAY.md](./MXMPAY.md)

---

### 2.4 mxmagent - 助手业务模块

**核心功能：**
- 助手列表查询
- 助手详情查询
- 助手收藏管理
- 助手搜索
- 助手分类管理

**详细设计：** 参见 [MXMAGENT.md](./MXMAGENT.md)

---

### 2.5 mxmcgi - AI多媒体生成业务模块

**核心功能：**
- 任务管理（创建、查询、取消生成任务）
- 多模型提供商支持（DeerAPI、Flux、ComfyUI、本地部署等）
- 多媒体类型生成（photo、video、music、illustration、text、voice）
- 任务调度和进度跟踪
- 结果管理和成本计算

**详细设计：** 参见 [MXMCGI.md](./MXMCGI.md)

---

### 2.6 mxmnotify - 通知业务模块

**核心功能：**
- 接收来自各服务的通知事件（通过消息队列）
- 存储和管理通知数据
- 提供通知查询API
- 实时推送通知（WebSocket）
- 推送通知（APNs、FCM）

**详细设计：** 参见 [MXMNOTIFY.md](./MXMNOTIFY.md)

---

### 2.7 gateway - API网关

**核心职责：**
- 统一入口点
- 认证和授权
- 限流和负载均衡
- 路由转发
- CORS处理
- 日志记录

**详细设计：** 参见 [GATEWAY.md](./GATEWAY.md)

---

## 三、数据库架构设计

### 3.1 架构方案选择

**推荐方案：Supabase + MinIO 数据分发中心**

使用 Supabase 作为统一的数据访问层，MinIO 作为文件存储中心。

**架构优势：**
- ✅ 统一的数据访问层（REST API自动生成）
- ✅ 内置实时功能（WebSocket订阅）
- ✅ 内置认证系统
- ✅ 减少后端代码量
- ✅ 统一的文件存储（MinIO S3兼容）
- ✅ 可以自托管（开源）

**备选方案：传统共享数据库**

如果团队对 Supabase 不熟悉，可以使用传统的共享数据库方案（PostgreSQL Schema隔离）。

### 3.2 数据访问原则

**重要原则：**
1. **服务只访问自己的数据**：每个服务只能访问自己Schema/前缀的表
2. **跨服务数据通过API**：需要其他服务的数据时，通过HTTP API调用
3. **避免直接跨服务查询**：不要直接JOIN其他服务的表
4. **数据一致性**：通过消息队列保证最终一致性

### 3.3 数据库拆分策略

**何时拆分：**
1. 服务数据量达到一定规模（如单表超过千万级）
2. 服务需要独立扩展（读写分离、分库分表）
3. 服务需要不同的数据库技术（如时序数据库、图数据库）
4. 服务需要独立部署和运维

**拆分优先级：**
1. **高优先级**：`mxmcgi`（生成任务数据量大）、`mxmnotify`（通知数据量大）
2. **中优先级**：`mxmagent`（助手数据相对独立）
3. **低优先级**：`mxmauth`、`mxmpay`（核心服务，保持共享）

---

## 四、统一响应格式

### 4.1 成功响应

```typescript
{
  code: 200;
  message?: string;
  data: any;
}
```

### 4.2 错误响应

```typescript
{
  code: number; // HTTP状态码
  message: string;
  error?: string; // 错误类型
  details?: any; // 错误详情
}
```

### 4.3 分页响应

```typescript
{
  code: 200;
  data: {
    list: any[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
}
```

---

## 五、认证机制

### 5.1 JWT Token

- **Access Token**: 短期有效（15分钟-1小时）
- **Refresh Token**: 长期有效（7-30天）
- Token存储在HTTP-only Cookie或响应头中

### 5.2 请求头

```
Authorization: Bearer <access_token>
```

### 5.3 刷新Token流程

1. 客户端使用Refresh Token请求新Access Token
2. 服务端验证Refresh Token
3. 返回新的Access Token和Refresh Token

---

## 六、部署建议

### 6.1 容器化

- 使用Docker容器化每个微服务
- 使用Docker Compose进行本地开发
- 使用Kubernetes进行生产部署

### 6.2 服务发现

- 使用Consul / etcd / Kubernetes Service Discovery

### 6.3 API网关

- 使用Kong / Nginx / Traefik作为API网关
- 统一处理认证、限流、日志

### 6.4 监控和日志

- 使用Prometheus收集指标
- 使用Grafana可视化
- 使用ELK Stack收集日志

---

## 七、开发规范

### 7.1 代码规范

- 使用TypeScript
- 遵循ESLint规则
- 使用Prettier格式化

### 7.2 Git工作流

- 主分支: `main`
- 开发分支: `develop`
- 功能分支: `feature/*`
- 修复分支: `fix/*`

### 7.3 测试

- 单元测试覆盖率 > 80%
- 集成测试覆盖核心流程
- API测试使用Postman/Newman

---

## 八、安全考虑

1. **输入验证**: 所有用户输入必须验证和清理
2. **SQL注入防护**: 使用参数化查询
3. **XSS防护**: 输出转义
4. **CSRF防护**: 使用CSRF Token
5. **限流**: 防止API滥用
6. **敏感数据加密**: 密码、支付信息等
7. **HTTPS**: 所有API使用HTTPS

---

## 九、后续优化方向

1. **缓存策略**: Redis缓存热点数据
2. **CDN**: 静态资源和媒体文件使用CDN
3. **消息队列**: 异步处理生成任务
4. **分布式锁**: 防止并发问题
5. **数据库优化**: 索引优化、读写分离
6. **微服务拆分**: 根据业务增长进一步拆分
7. **数据库拆分**: 根据数据量和访问模式拆分数据库
