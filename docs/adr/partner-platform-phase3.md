# ADR: Partner 开放平台 — 方案三（双模式 + 控制台）

**状态**: 已采纳  
**日期**: 2026-06-14

## 决策

1. **Token Exchange**：`POST /api/v1/partner/token/exchange`（integration Key → 短期 session，可传 `scopeSlugs`）。
2. **Partner 控制台 API**：`GET /partner/apps`、`/apps/:id/stats`、`/apps/:id/end-users`、封禁、secret 轮换。
3. **Scoped WebSocket**：`WS /api/v1/ws/open/subscribe?token=&slug=&jobId=`，session 鉴权 + usage 表校验 end_user。
4. **审计**：`partner_audit_logs` 记录换票、封禁、secret 轮换。

## 待演进

- ~~平台托管登录（短信）~~ → 已实现 `POST /partner/auth/sms/send|verify`（微信仍待做）
- ~~Web Partner 控制台完整 UI~~ → 见 [partner-access-control.md](./partner-access-control.md)（Account → API Token 权限抽屉）
- 平台托管登录（微信 OAuth）绑定 `partner_end_users`
- IP 白名单
