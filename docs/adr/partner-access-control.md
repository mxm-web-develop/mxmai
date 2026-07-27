# ADR: Partner 访问控制 — slug ACL + 终端用户白名单 + 邀请链接

**状态**: 已采纳  
**日期**: 2026-06-15

## 背景

integration Key 与 `partner_apps` 1:1 绑定，已有 `allowed_slugs` 与 Partner session slug 校验，但：

- 直连 integration Key 调用 Open API 不校验 slug
- 终端用户短信登录无白名单
- Web 控制台缺少封禁、白名单、邀请链接能力

## 决策

### 1. 权限载体

继续在 **`partner_apps`** 上扩展，不在 `user_api_keys` 重复存 scope。

| 字段 | 说明 |
|------|------|
| `end_user_access_mode` | `open`（默认）/ `whitelist` |
| `slug_access_mode` | `all_owner`（默认）/ `restricted` |
| `invite_token_hash` | **已废弃**（旧版应用级可复用 token，保留列兼容） |
| `h5_login_base_url` | 可选，生成 H5 登录 / 邀请 URL 的根地址 |

### 2. 白名单表 `partner_app_allowlist`

`(partner_app_id, provider, subject)` 唯一；`source` 为 `manual` 或 `invite`。

### 2b. 一次性邀请码 `partner_app_invites`（白名单模式）

| 字段 | 说明 |
|------|------|
| `token_hash` | 邀请 token SHA256，全局唯一 |
| `status` | `pending` / `used` / `revoked` |
| `used_subject` / `used_end_user_id` | 验码成功后写入 |

**一码一人**：`POST /invites` 生成独立 token；SMS 验码成功时原子 `consume` → `used`，并 upsert 白名单。

### 3. 终端用户访问

- **open**：任意手机号可 SMS 登录；**忽略** `inviteToken`；分享文案为纯登录 URL（`GET /share-link`，无 `?invite=`）
- **whitelist**：仅白名单内手机号可发码；**或**携带有效 **pending** 邀请码可发码，验码成功后 consume 并写入白名单

邀请 URL（仅白名单）：`{h5_base}/login?invite={token}`

### 4. Gateway

`integrationPartnerAclMiddleware`：`integration` Key 且 `slug_access_mode=restricted` 时校验 `/api/v1/open/:slug`。

### 5. Web UI

Account → API Token → integration Key「权限与用户」抽屉（3 Tab）：

- **服务权限**：slug 限制
- **访问与白名单**：open 模式复制分享文案；whitelist 模式「生成邀请码」+ 列表/作废 + 手动加号
- **终端用户**：封禁 / 解封

## API 摘要

| 模式 | 端点 | 说明 |
|------|------|------|
| open | `GET /share-link` | 返回 `url` + `copyText`（无 invite） |
| whitelist | `POST /invites` | 生成一次性邀请链接 |
| whitelist | `GET /invites` | 邀请码列表 |
| whitelist | `DELETE /invites/:id` | 作废 pending 邀请码 |

旧 `GET/POST invite-link/rotate` 返回 410，请改用上述 API。

## 向后兼容

存量 `partner_apps` 默认 `open` + `all_owner`；`allowed_slugs=[]` 在 `all_owner` 下仍表示不限制 slug。

## 相关文件

- Migration: `add_partner_access_control.sql`、`add_partner_app_invites.sql`
- 访问控制: `mxmauth/src/partner/access-control.ts`
- Gateway ACL: `gateway/src/middleware/integration-partner-acl.ts`
- Web 抽屉: `web/src/components/IntegrationKeyPermissionsDrawer.tsx`
