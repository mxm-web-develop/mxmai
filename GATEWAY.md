# gateway - API 网关模块

## 一、定位与职责

Gateway 位于所有客户端与后端微服务之间，提供统一入口、鉴权、流控与观测能力。核心职责：

- **统一入口**：隐藏后端服务拓扑，对外暴露单一域名 / 端口。
- **认证与授权**：验证 JWT / Session，执行角色、权限或租户校验。
- **限流与防护**：基于 IP、用户、接口做速率限制，抵御恶意请求。
- **路由与负载**：按照路径 / Header / Query 将流量转发到对应微服务，并支持健康检查。
- **CORS & 协议处理**：统一处理跨域、HTTPS、WebSocket 协议升级。
- **日志与观测**：记录访问日志、Tracing、Metrics，为告警与排障提供基础。

---

## 二、部署与架构

可选方案：

1. **Kong / APISIX / Traefik**：借助成熟网关组件，使用插件实现鉴权、限流等。
2. **自研 Node.js 网关**：基于 Express/ Fastify/ Nest.js，按需接入中间件。

推荐架构（举例：Kong + Node.js 控制面）：

```text
Client
  │ HTTPS
  ▼
API Gateway (Kong / Traefik)
  ├─ Auth Plugin (JWT/Keycloak)
  ├─ Rate Limit Plugin (Redis)
  ├─ Logging Plugin (HTTP / Kafka)
  └─ Route -> Upstream Services
        ├─ mxmauth
        ├─ mxmpay
        ├─ mxmcgi
        ├─ mxmagent
        └─ mxmnotify
```

---

## 三、路由与服务发现

路由策略：

| 路径前缀 | 上游服务 | 说明 |
|----------|----------|------|
| `/api/v1/account` | `mxmauth` | 用户、认证、设置 |
| `/api/v1/payment` | `mxmpay` | 支付、订单、回调 |
| `/api/v1/generation` | `mxmcgi` | 生成任务、媒体资源 |
| `/api/v1/agents` | `mxmagent` | 助手列表/收藏 |
| `/api/v1/notifications` | `mxmnotify` | 通知中心 |

实现方式：

- **Kong**：使用 `Service + Route` 配置，Upstream 设置多实例并健康检查。
- **Traefik**：通过 `IngressRoute` 或 `HTTPRoute` 定义，结合 ServiceRegistry (Consul/K8s) 做发现。

---

## 四、认证与授权

### 4.1 JWT 验证

- 网关负责校验 `Authorization: Bearer <token>`。
- 推荐集成 OIDC Provider（如 Keycloak）或自建 `mxmauth` 颁发的 JWT。
- 失败直接返回 401，避免进入后端。

### 4.2 细粒度授权

- 在 JWT Claims 中包含 `role / scope / tenant`，网关根据路由配置做快速判定。
- 对于需要下游自行判定的接口，网关只做基础鉴权，细节在业务服务内完成。

---

## 五、限流与防护

- **速率限制**：按 IP / 用户 / 路由配额，可使用 Redis 计数器。
- **全局熔断**：检测某服务错误率或延迟飙升时，快速熔断并返回降级信息。
- **请求大小限制**：避免超大请求拖垮后端。
- **WAF 规则**：可接入云防火墙或简单黑名单机制。

Kong 示例：

```bash
curl -X POST http://gateway:8001/routes/{route_id}/plugins \
  --data name=rate-limiting \
  --data config.minute=120 \
  --data config.policy=redis
```

---

## 六、CORS、WebSocket 与协议层

- **CORS**：集中配置允许的 `Origin / Methods / Headers`，减少各服务重复代码。
- **HTTPS 终止**：在网关终止 TLS，并向下游使用 mTLS 或内部 HTTP。
- **WebSocket**：保持 `Upgrade` 头并转发到如 `mxmnotify` 的 WS 服务。
- **HTTP/2**：可为外部客户端开启 H2，从而复用连接。

---

## 七、日志、Tracing 与监控

- **访问日志**：记录 request-id、用户、路由、状态码、耗时。可输出到 ELK / Loki。
- **Tracing**：在网关生成 trace/span，向下游传播 `traceparent`，便于全链路追踪。
- **Metrics**：导出 Prometheus 指标（请求速率、错误率、延迟分布）。
- **告警**：根据门限设置报警（如 5xx 持续升高）。

---

## 八、配置管理与热更新

- 配置持久化（PostgreSQL / GitOps / ConfigMap），支持自动下发。
- 灰度路由：例如将 `/api/v1/generation` 的 10% 流量指向新版本。
- 支持动态插件启停，避免重新部署。
