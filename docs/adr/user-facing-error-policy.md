# ADR: 用户可见错误策略（脱敏 + 权限）

## Status

Accepted (2026-08-03)

## Context

上线前上游 Provider（Maxplan / Deer / Atlas 等）失败常把完整 HTTP body、`proxy=`、内部 URL、`request_id` 写进 `Error.message`，经 `setTaskError` → `progress.error` / 同步 API → 前端 toast / 引导气泡 / 任务卡原样展示。非技术用户看到不可理解且含内网细节的串；运维与 admin 仍需要完整原文排查。

## Decision

### 1. 三层职责

| 层 | 职责 |
|----|------|
| **存储 / 日志** | DB `error_message`、`progress.error`（落库时）与服务器日志保留**完整**上游串 |
| **出站 API / WS / 通知** | 按请求者 `role === 'admin'` 脱敏；非 admin 只出稳定 `code` + 产品文案 |
| **前端 UI** | 统一 `toUserFacingError` + `ErrorNotice`；admin 可折叠「技术详情」；React `ErrorBoundary` 兜底 |

### 2. 出站契约

同步失败：

```json
{
  "success": false,
  "code": "UPSTREAM_OVERLOADED",
  "error": "系统繁忙，请稍后重试",
  "debugDetail": "<仅 admin>",
  "retryable": true
}
```

任务 `progress`（读出后）：

```json
{
  "status": "failed",
  "error": "<用户文案>",
  "errorCode": "UPSTREAM_OVERLOADED",
  "errorDebug": "<仅 admin 附带原文>"
}
```

### 3. 错误码（首批）

| code | 用户文案 | 启发 |
|------|----------|------|
| `UPSTREAM_OVERLOADED` | 系统繁忙，请稍后重试 | 529 / overloaded_error / 负载较高 |
| `UPSTREAM_RATE_LIMIT` | 请求过于频繁，请稍后再试 | 429 |
| `UPSTREAM_UNAVAILABLE` | 上游服务暂不可用，请稍后重试 | 502/503/504 |
| `UPSTREAM_CONTENT_POLICY` | 内容未通过安全审核，请修改后重试 | CONTENT_POLICY |
| `NETWORK_ERROR` | 网络异常，请检查后重试 | fetch 失败 |
| `TASK_VALIDATION_ERROR` | 填写内容有误，请检查后重试 | ValidationError |
| `TASK_CONFIG_ERROR` | 业务暂不可用，请稍后重试或联系管理员 | ConfigurationError |
| `INSUFFICIENT_BALANCE` | （沿用计费文案） | 402 |
| `BILLING_MISCONFIGURED` | （沿用计费文案） | 503 |
| `INTERNAL_ERROR` | 操作失败，请稍后重试 | 兜底 |

### 4. 权限

- **仅** `user.role === 'admin'` 可获得 `debugDetail` / `errorDebug`。
- Admin 调试面板（`AdminBusinessTestModal` 等）保持原文，不经此脱敏。
- 禁止对非 admin 暴露：`proxy=`、上游完整 URL、原始 JSON body、`request_id`、堆栈、内部 taskKey/nestedText 调试串作为主文案。

### 5. 实现锚点

- Backend：`mxmcgi/src/errors/*`（`PlatformError` / `mapUpstreamError` / `shapeErrorForViewer` / `sanitizeProgressError`）
- Frontend：`web/src/lib/platformErrors.ts`、`ErrorNotice`、`AppErrorBoundary`
- 规则：`.cursor/rules/ui-no-internal-leak.mdc` 同步禁止上游堆栈泄漏

## Consequences

- 历史任务 DB 仍含全文；列表/详情 API 对非 admin 读时替换 `progress.error`。
- Provider 可渐进改为抛 `PlatformError`；即使未改，出站 shape 仍兜底。
- 前端与后端码表需保持同步（同名 code + 默认文案）。
