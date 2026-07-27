# ADR: Partner 终端用户 — 方案一（身份层 + 任务隔离）

**状态**: 已采纳  
**日期**: 2026-06-14

## 背景

integration Key 鉴权后 `callerUserId` 为 Key 所属用户，无法区分 H5/第三方 App 内的终端用户；Key 可进浏览器；无 slug 白名单。

## 决策

1. **数据模型**：`partner_apps`、`partner_end_users`、`partner_sessions`；`published_api_usage_events` 增加 `partner_app_id`、`end_user_id`。
2. **双轨身份**：
   - 匿名：`POST /api/v1/partner/sessions/anonymous` + `X-Partner-Key` + `X-Device-Id`
   - 外部 ID：`POST /api/v1/partner/sessions/delegate` + HMAC
3. **Session JWT**：`type: partner_session`，Gateway 解析后注入 `x-partner-app-id` / `x-partner-end-user-id`。
4. **任务 ACL**：metadata / requestParams 写入 `partnerAppId`、`endUserId`；`canUserAccessTask` 按 end_user 隔离。
5. **slug 白名单**：`partner_apps.allowed_slugs`，Gateway `partnerSlugMiddleware` 校验。
6. **H5**：服务端 `MXM_PARTNER_KEY` 换票，浏览器仅存 session token。

## 向后兼容

integration Key 直调 Open API 仍可用；无 Partner 上下文时不做 end_user 隔离。

## 验收

- 两设备匿名会话任务互不可见
- HMAC 同一 externalId 跨设备可见自己的任务
- 未授权 slug 返回 403
