# MXM AI Platform 架构重构方案

> **版本**: v1.0
> **日期**: 2026-05-01
> **状态**: 架构提案

---

## 1. 背景与目标

### 1.1 当前架构问题

基于代码分析，当前系统存在以下核心问题：

| 问题类别 | 具体问题 | 影响 |
|----------|----------|------|
| **紧耦合** | mxmcgi 单体服务承载所有核心业务 | 无法独立扩展单个模块 |
| **职责模糊** | Gateway 包含 legacy 业务逻辑 (1173 行 proxy.ts) | 修改风险高 |
| **技术栈混乱** | 所有服务统一 Express，无语言优势 | AI 密集型任务无性能优势 |
| **通信方式落后** | 任务状态依赖轮询而非 WebSocket/SSE | 实时性差，资源浪费 |
| **初始化低效** | Provider 同步初始化，60+ Provider 全量注册 | 启动慢，内存占用高 |
| **配置分散** | dotenv 配置在多处加载，路径不统一 | 部署易出错 |
| **存储双写** | MinIO 存在 legacy 双写逻辑 | 数据一致性风险 |
| **数据库共享** | 所有服务共享 Supabase 连接池 | 高负载时连接竞争 |

### 1.2 重构目标

1. **服务边界清晰**: 按业务领域拆分微服务
2. **语言优势最大化**: AI 密集型用 Python，高并发用 Go，Web 用 Node.js
3. **事件驱动**: 任务状态变更通过消息队列而非轮询
4. **可观测性**: 统一的日志、追踪、指标
5. **可扩展性**: 支持水平扩展和独立部署
6. **开发体验**: 清晰的领域边界，易于测试和维护

---

## 2. 目标架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端 (Web / Mobile / API)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway (Go)                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Auth        │  │ Router      │  │ Rate Limit  │  │ Observability│     │
│  │ Middleware  │  │             │  │             │  │             │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Auth Service    │  │  Task Gateway    │  │  Notification    │
│  (Go)           │  │  (Go)           │  │  Gateway (Go)    │
│  - JWT签发      │  │  - 任务路由     │  │  - SSE/WebSocket│
│  - OAuth2       │  │  - 状态聚合     │  │  - 消息推送     │
│  - API Key      │  └────────┬─────────┘  └────────┬─────────┘
└──────────────────┘           │                       │
                               ▼                       ▼
                    ┌──────────────────────────────────────────┐
                    │           Message Queue (Redis Streams)   │
                    │  - 任务状态变更事件                       │
                    │  - 用户通知事件                          │
                    │  - 审计日志事件                         │
                    └──────────────────────────────────────────┘
           │                    │                    │                    │
           ▼                    ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Writing Service │ │  Graph Service  │ │  Audio Service   │ │  Video Service   │
│  (Python)       │ │  (Python)       │ │  (Python)       │ │  (Python)       │
│  - text/llm    │ │  - 图片生成     │ │  - TTS/ASR     │ │  - 视频生成     │
│  - Agent/对话   │ │  - 图片编辑     │ │  - 音频处理     │ │  - 视频编辑     │
│  - 知识库      │ │  - 风格迁移     │ │                 │ │                 │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
           │                    │                    │                    │
           └──────────────────┴──────────────────┴──────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────────────────┐
                    │     Smartflow Engine (Python + LangGraph) │
                    │  - 工作流编排    - 条件分支               │
                    │  - 循环处理      - 并行执行               │
                    │  - 人机交互      - 子流程                 │
                    └──────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          基础设施层                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ PostgreSQL   │  │   Redis      │  │    MinIO     │  │  Provider    │  │
│  │ (Supabase)  │  │  (Cache/Q)   │  │   (S3)       │  │  API Keys    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 服务设计

### 3.1 服务矩阵

| 服务 | 语言 | 职责 | 核心依赖 |
|------|------|------|----------|
| **api-gateway** | Go | 路由转发、认证、限流 | go-jwt, gin, redis |
| **auth-service** | Go | 用户认证、JWT 签发、OAuth2 | go-jwt, bcrypt |
| **task-gateway** | Go | 任务入口、状态聚合 | redis streams |
| **notification-service** | Go | SSE/WebSocket 推送 | gorilla/websocket |
| **writing-service** | Python | 文本生成、Agent 对话 | FastAPI, LangChain, LangGraph |
| **graph-service** | Python | 图片生成编辑 | FastAPI, diffusion models |
| **audio-service** | Python | 音频处理 | FastAPI, audio models |
| **video-service** | Python | 视频处理 | FastAPI, video models |
| **smartflow-engine** | Python | 工作流编排 | LangGraph, asyncio |
| **knowledge-service** | Python | 知识库、向量检索 | FastAPI, pgvector |

### 3.2 服务详细设计

#### 3.2.1 API Gateway (Go)

**职责**:
- 统一入口，路由转发到下游服务
- JWT Token 验证（透传 user info headers）
- API Key 验证
- 请求限流（token bucket）
- 统一错误处理
- 可观测性（请求日志、metrics）

**核心模块**:
```go
// cmd/gateway/main.go
func main() {
    r := gin.New()
    r.Use(otelgin.Handler("api-gateway"))
    r.Use(ratelimit.New())
    r.Use(auth.JWTMiddleware())

    // 路由分组
    v1 := r.Group("/api/v1")
    v1.POST("/auth/*path", proxy(authService))
    v1.GET("/tasks/:id", proxy(taskGateway))
    v1.POST("/writing/*path", proxy(writingService))
    v1.POST("/graph/*path", proxy(graphService))
    // ...
}
```

**与当前系统对比**:
| 项目 | 当前 | 重构后 |
|------|------|--------|
| 代码量 | 1173 行 proxy.ts | ~300 行，纯路由 |
| 业务逻辑 | 包含 legacy 任务创建 | 仅做转发 |
| 配置方式 | 硬编码路径规则 | YAML 配置 |

#### 3.2.2 Writing Service (Python)

**职责**:
- 文本生成（writing scope）
- Agent 对话（基于 LangChain）
- Prompt 模板管理
- Task v2 执行

**核心模块**:
```python
# writing_service/
# ├── main.py
# ├── api/
# │   ├── routes/
# │   │   ├── writing.py      # 写作 API
# │   │   ├── agent.py        # Agent 对话 API
# │   │   └── prompts.py      # Prompt 管理 API
# │   └── deps.py             # 依赖注入
# ├── core/
# │   ├── llm/                # LLM 提供商
# │   │   ├── base.py
# │   │   ├── openai.py
# │   │   ├── anthropic.py
# │   │   └── router.py       # 模型路由
# │   ├── agents/             # Agent 实现
# │   │   ├── base.py
# │   │   ├── chat.py
# │   │   └── smartflow.py
# │   └── templates/          # Prompt 模板
# ├── services/
# │   ├── writing.py
# │   ├── agent.py
# │   └── knowledge.py
# └── infrastructure/
#     ├── database.py
#     └── cache.py

# 入口
from fastapi import FastAPI
app = FastAPI()

@app.post("/api/v1/tasks/writing")
async def create_writing_task(req: WritingRequest):
    task = await TaskService.create(req)
    await MessageQueue.publish("task.created", task)
    return {"task_id": task.id}
```

**与当前系统对比**:
| 项目 | 当前 | 重构后 |
|------|------|--------|
| 框架 | Express + 自封装 | FastAPI (自动 OpenAPI, 类型安全) |
| LLM 调用 | 散落在各 route | 统一的 LLM Router |
| Agent | 33KB chat.ts 单一文件 | 模块化 Agent 框架 |

#### 3.2.3 Graph Service (Python)

**职责**:
- 图片生成（photograph, design, painting）
- 图片编辑
- 风格迁移
- 参考图处理（R2 上传）

**核心模块**:
```python
# graph_service/
# ├── main.py
# ├── api/
# │   ├── routes/
# │   │   ├── generate.py     # 生成 API
# │   │   ├── edit.py         # 编辑 API
# │   │   └── reference.py    # 参考图 API
# │   └── deps.py
# ├── core/
# │   ├── models/             # 图像模型
# │   │   ├── base.py
# │   │   ├── gpt_image.py   # GPT Image API
# │   │   ├── stable_diffusion.py
# │   │   └── router.py
# │   ├── processors/         # 后处理
# │   │   ├── upscale.py
# │   │   ├── style_transfer.py
# │   │   └── inpaint.py
# │   └── storage/            # R2/MinIO
# │       ├── uploader.py
# │       └── url_generator.py
# └── services/
#     ├── generator.py
#     └── editor.py
```

#### 3.2.4 Smartflow Engine (Python)

**职责**:
- 工作流编排（基于 LangGraph）
- 节点执行器
- 条件分支、循环
- 并行执行
- 子流程支持
- 人机交互节点

**核心架构**:
```python
# smartflow_engine/
# ├── main.py
# ├── graph/
# │   ├── compiler.py         # Schema -> LangGraph
# │   ├── executor.py         # 执行引擎
# │   └── state.py            # 状态管理
# ├── nodes/
# │   ├── base.py
# │   ├── start.py
# │   ├── end.py
# │   ├── llm.py              # LLM 节点
# │   ├── tool.py             # 工具节点
# │   │   ├── web_search.py
# │   │   ├── deep_search.py
# │   │   ├── python_executor.py
# │   │   └── http_request.py
# │   ├── condition.py         # 条件分支
# │   ├── loop.py             # 循环
# │   ├── variable.py         # 变量操作
# │   └── business.py          # 业务节点（调用其他微服务）
# └── api/
#     ├── deploy.py           # 部署工作流
#     ├── execute.py         # 执行任务
#     └── status.py          # 状态查询

# LangGraph 集成示例
from langgraph.graph import StateGraph
from typing import TypedDict

class SmartflowState(TypedDict):
    inputs: dict
    outputs: dict
    variables: dict
    current_node: str
    iteration_count: int

def create_smartflow_graph(schema: SmartflowSchema) -> StateGraph:
    builder = StateGraph(SmartflowState)

    # 编译节点
    for node in schema.nodes:
        if node.type == "llm":
            builder.add_node(node.id, create_llm_node(node))
        elif node.type == "condition":
            builder.add_node(node.id, create_condition_node(node))
        # ...

    # 编译边
    for edge in schema.edges:
        builder.add_edge(edge.source, edge.target)

    return builder.compile()
```

#### 3.2.5 Task Gateway (Go)

**职责**:
- 任务创建入口
- 任务状态聚合（从各微服务收集）
- 任务列表查询
- SSE/WebSocket 状态推送

**状态聚合**:
```go
// 各微服务发布状态变更到 Redis Stream
// task-gateway 订阅并聚合

type TaskStatus struct {
    TaskID     string    `json:"task_id"`
    Status     string    `json:"status"` // pending, processing, completed, failed
    Progress   int       `json:"progress"`
    Result     any       `json:"result,omitempty"`
    Error      string    `json:"error,omitempty"`
    UpdatedAt  time.Time `json:"updated_at"`
}

// 订阅消息队列
func (s *TaskGateway) Subscribe(taskID string) <-chan TaskStatus {
    ch := make(chan TaskStatus, 1)
    go func() {
        sub := s.redis.Subscribe(ctx, fmt.Sprintf("task:%s:status", taskID))
        defer close(ch)
        for msg := range sub {
            var status TaskStatus
            json.Unmarshal(msg.Payload, &status)
            select {
            case ch <- status:
            case <-ctx.Done():
                return
            }
        }
    }()
    return ch
}
```

---

## 4. 通信设计

### 4.1 服务间通信方式

| 通信场景 | 方式 | 协议 |
|----------|------|------|
| 同步调用（API） | REST/gRPC | HTTP/JSON 或 Protobuf |
| 任务状态变更 | 异步事件 | Redis Streams |
| 实时推送 | SSE | Server-Sent Events |
| 长时间运行 | WebSocket | WebSocket |

### 4.2 消息队列设计

**Redis Streams 用法**:
```
# 任务生命周期事件
task.created      -> task-gateway 订阅
task.processing  -> 通知客户端
task.completed   -> 通知客户端 + 清理资源
task.failed      -> 通知客户端 + 告警

# 通知事件
user.notification -> notification-service 订阅
user.message     -> notification-service 订阅
```

**消息格式**:
```json
{
  "event": "task.completed",
  "timestamp": "2026-05-01T10:00:00Z",
  "data": {
    "task_id": "task_xxx",
    "user_id": "user_xxx",
    "result": { ... }
  }
}
```

### 4.3 API 设计

#### 统一响应格式
```typescript
// 成功
{
  "success": true,
  "data": { ... },
  "request_id": "req_xxx"
}

// 错误
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "任务不存在",
    "details": { ... }
  },
  "request_id": "req_xxx"
}
```

#### 任务 API
```yaml
# Task Gateway API
POST /api/v1/tasks
  Body: { "type": "writing", "scope": "article", "params": {...} }
  Response: { "task_id": "task_xxx", "status": "pending" }

GET /api/v1/tasks/{task_id}
  Response: { "task_id": "task_xxx", "status": "processing", "progress": 50 }

GET /api/v1/tasks/{task_id}/events
  Response: SSE stream of status updates
```

---

## 5. 数据存储设计

### 5.1 数据库 Schema 分离

**按服务划分 Schema**（而非共享数据库）:

| 服务 | Schema | 表 |
|------|---------|-----|
| auth-service | auth | users, sessions, api_keys |
| task-gateway | tasks | tasks, task_events |
| writing-service | writing | prompts, templates |
| graph-service | graph | image_configs, styles |
| knowledge-service | knowledge | kb, documents, embeddings |
| smartflow | flows | flow_schemas, flow_runs |

### 5.2 向量存储

**pgvector 用于知识库**:
```sql
-- 知识库表
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    embedding vector(1536),
    content TEXT,
    metadata JSONB
);

-- 创建 HNSW 索引
CREATE INDEX ON knowledge_base USING hnsw (embedding vector_cosine_ops);
```

### 5.3 缓存策略

| 数据类型 | 缓存策略 | TTL |
|----------|----------|-----|
| Session | Redis String | 24h |
| API Key Hash | Redis String | 无过期 |
| 任务状态 | Redis Hash | 7d |
| Prompt 模板 | Redis String | 1h |
| LLM Response | Redis String | 按业务 |

---

## 6. 可观测性设计

### 6.1 日志

**统一日志格式** (JSON):
```json
{
  "timestamp": "2026-05-01T10:00:00Z",
  "level": "INFO",
  "service": "writing-service",
  "request_id": "req_xxx",
  "message": "Task completed",
  "context": {
    "task_id": "task_xxx",
    "duration_ms": 1234
  }
}
```

### 6.2 追踪

**OpenTelemetry 集成**:
```
Client Request
    │
    ▼
API Gateway (span: incoming request)
    │
    ▼
Writing Service (span: process task)
    │
    ├──────────────────┐
    ▼                  ▼
LLM Provider      Knowledge Base
(span: llm call)  (span: recall)
```

### 6.3 指标

**关键 Metrics**:
- Request rate, latency histogram, error rate
- Task completion rate, average duration
- LLM token usage, cost
- Queue depth, processing rate

---

## 7. 安全设计

### 7.1 认证流程

```
Client                    API Gateway                Auth Service
  │                           │                          │
  │──── POST /auth/login ───▶│                          │
  │                           │──── verify credentials ──▶│
  │                           │◀──── JWT token ─────────│
  │◀─── { token: "..." } ───│                          │
  │                           │                          │
  │──── GET /api/v1/tasks ───│                          │
  │  Authorization: Bearer ──▶│                          │
  │                           │──── verify JWT ─────────▶│
  │                           │◀─── user_id, role ──────│
  │                           │──── forward with headers │
  │                           │────────────────────────▶ Writing Service
  │◀─── Response ───────────│                          │
```

### 7.2 权限模型

**RBAC + 资源级权限**:
```yaml
roles:
  admin:
    - "*"  # 所有权限

  user:
    - tasks:create
    - tasks:read:own
    - tasks:cancel:own
    - smartflows:create
    - smartflows:read:own
    - smartflows:execute:own
```

---

## 8. 部署架构

### 8.1 Kubernetes 部署

```yaml
# docker-compose.yml (开发) / K8s manifests (生产)
services:
  api-gateway:
    image: mxmai/api-gateway:latest
    ports: ["3000:3000"]
    environment:
      - AUTH_SERVICE_URL=http://auth-service:8080
      - TASK_GATEWAY_URL=http://task-gateway:8080

  writing-service:
    image: mxmai/writing-service:latest
    ports: ["8001:8000"]
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:5432/writing

  smartflow-engine:
    image: mxmai/smartflow-engine:latest
    ports: ["8002:8000"]
    environment:
      - REDIS_URL=redis://redis:6379
      - WRITING_SERVICE_URL=http://writing-service:8000
      - GRAPH_SERVICE_URL=http://graph-service:8000
```

### 8.2 扩展策略

| 服务 | 扩展方式 | 触发条件 |
|------|----------|----------|
| API Gateway | HPA (CPU > 70%) | 横向扩展 |
| writing-service | HPA (RQ > 100) | 横向扩展 |
| smartflow-engine | HPA (Running flows > 50) | 横向扩展 |
| Redis | 主从复制 | 读分离 |
| PostgreSQL | 读写分离 + 分片 | 数据量 > 1TB |

---

## 9. 迁移路径

### 9.1 阶段一：基础设施准备
1. 部署 Redis Streams 集群
2. 部署 PostgreSQL (按服务分离 schema)
3. 部署 MinIO 独立 Bucket
4. 搭建 CI/CD 流水线

### 9.2 阶段二：新服务开发
1. 开发 API Gateway (Go)
2. 开发 Auth Service (Go)
3. 开发 Task Gateway (Go)
4. 开发 Writing Service (Python)
5. 开发 Graph Service (Python)

### 9.3 阶段三：Smartflow 重构
1. 开发 Smartflow Engine (Python)
2. 迁移现有 Smartflow 功能
3. 实现 LangGraph 集成

### 9.4 阶段四：切换与下线
1. 灰度切换流量到新架构
2. 监控验证
3. 下线旧服务

---

## 10. 技术选型对比

| 领域 | 当前方案 | 重构方案 | 理由 |
|------|----------|----------|------|
| **网关** | Express (JS) | Gin (Go) | Go 并发处理 HTTP 更强，内存占用低 |
| **AI 服务** | Express (JS) | FastAPI (Python) | Python 对 AI 模型生态更好，异步原生支持 |
| **工作流** | 自封装 JS | LangGraph | 成熟的状态机图编排库 |
| **实时通信** | 轮询 + SSE | Redis Streams + WebSocket | 事件驱动，实时性强 |
| **服务通信** | HTTP 代理 | REST + gRPC | gRPC 对内通信更高效 |
| **任务队列** | 内存/数据库 | Redis Streams | 支持持久化、消息追踪 |
| **数据库** | 共享 Supabase | 按服务分离 | 降低耦合，独立扩展 |

---

## 11. 性能提升预估

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| API Gateway QPS | ~500 | ~5000 | 10x |
| 任务创建延迟 | 100ms | 20ms | 5x |
| 状态更新延迟 | 2-5s (轮询) | <100ms (推送) | 20-50x |
| LLM 调用吞吐 | 受 Node 限制 | Python 异步 | 3-5x |
| 冷启动时间 | 30s+ | <5s (懒加载) | 6x |
| 内存占用/服务 | 共享 | 独立隔离 | 可预测 |

---

## 12. 总结

### 12.1 核心改进

1. **语言优势最大化**: AI 密集型用 Python，高并发用 Go，Web 用 TypeScript
2. **服务边界清晰**: 每个服务职责单一，可独立部署和扩展
3. **事件驱动架构**: 实时推送替代轮询，减少资源浪费
4. **可观测性**: 统一日志、追踪、指标
5. **现代化框架**: FastAPI 自动 OpenAPI，LangGraph 状态机

### 12.2 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 微服务复杂度 | 分阶段迁移，逐步上线 |
| Python GIL | 多进程 + async I/O |
| 数据一致性 | 最终一致 + 事务补偿 |
| 服务间延迟 | gRPC + 连接池 |

### 12.3 后续优化方向

1. **Service Mesh**: 引入 Istio 进行流量管理
2. **多云部署**: Kubernetes Federation
3. **成本优化**: Spot Instance + Auto Scaling
4. **AI 加速**: GPU 调度优化
