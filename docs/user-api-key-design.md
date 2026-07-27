# 用户 API Key / 个人访问凭证 设计方案

> 目标：平台用户可以在 **OpenClaw、脚本、自建应用** 等外部软件里，通过一个 **Token（API Key）** 代表自己调用平台能力（生图、写作、音频等），无需在第三方里输入账号密码，且可随时撤销。  
> 设计上对齐 **GitHub Personal Access Token、OpenAI API Key、Vercel Token** 等成熟提供方，便于后期扩展和用户理解。

---

## 1. 与成熟接口提供方对照

| 提供方 | 凭证类型 | 用户侧流程 | 典型能力 |
|--------|----------|------------|----------|
| **GitHub** | Personal Access Token (PAT) | 设置 → Developer settings → PAT → 创建，勾选 scope，**只展示一次**；在 Git/API/第三方 App 里填 Token | 代表用户读写 repo、gist、API |
| **OpenAI** | API Key | 控制台 → API keys → 创建，**只展示一次**；在客户端/脚本里填 Key | 代表用户调用 API、计费挂在该账号 |
| **Vercel** | Token | Account → Tokens → 创建，可选 expiry/scope，**只展示一次** | 代表用户部署、读项目等 |
| **Supabase** | anon key + service key；用户级可用 Project API key | 项目设置里复制；客户端带 key 调用 | 代表项目/用户访问数据与 Edge Functions |

共性可以归纳为：

- **一个凭证 = 代表「我」在第三方/客户端里操作**，不把账号密码交给外部。
- **创建时明文只展示一次**，服务端只存 hash 或不可逆摘要，无法从库中反推明文。
- **列表里只显示前缀/备注/创建时间**，方便用户识别是哪个客户端在用，并支持**撤销**。
- **可选**：scope（限制能调哪些接口）、过期时间、单 token 限流，便于安全与合规。

本方案采用同一套思路：用户在我们的 Web 里创建 **API Key（个人访问凭证）**，在 OpenClaw 等地方配置该 Key 后，这些客户端即可代表该用户调用平台接口；后续如需，可再增加 scope/过期时间等，与上述提供方保持一致。

---

## 2. 使用场景（为何要单独设计）

- **OpenClaw / 其他 AI 客户端**：用户希望在本地客户端里直接调用「我们平台的生图、写作等」，而不是只在浏览器里用。客户端需要一种**长期有效、可配置**的凭证，且用户能自己创建/撤销。
- **脚本 / 自建应用**：用户或企业用脚本、内部系统调用平台 API，同样需要**代表某个用户**的 Token，计费、权限、资源归属都挂在该用户下。
- **未来扩展**：若后续支持更多客户端（移动端、桌面端、第三方集成），同一套「用户 API Key」机制可复用，无需再为每种客户端设计一套登录方式。

因此需要把「用户级 API Key」作为**平台级能力**来设计，而不是临时方案。

---

## 3. 整体流程（与 GitHub/OpenAI 对齐）

```
用户在平台 Web 登录
    → 进入「API 密钥」/「个人访问凭证」
    → 创建新 Key：填备注（如「OpenClaw」）、可选勾选权限/过期（首版可略）
    → 系统生成 Token，**仅此一次**展示完整字符串，并提示「请妥善保存，关闭后无法再次查看」
    → 服务端只存储：key_hash（SHA-256）、key_prefix（前几位）、user_id、name、created_at 等

用户在 OpenClaw / 脚本 / 自建应用 中配置
    → Base URL = 平台 Gateway 地址（如 https://api.xxx.com 或 /api/v1 前缀由 Gateway 统一）
    → API Key / Authorization = 刚复制的 Token
    → 客户端请求时带 Header: Authorization: Bearer <token>

Gateway 认证
    → 收到 Authorization: Bearer xxx
    → 先按 JWT 解析（现有登录态）；成功则 req.user = 解码结果
    → 若不为 JWT 或已过期：将 xxx 视为 API Key，计算 hash，查 user_api_keys
    → 命中则根据 user_id 加载用户信息，写入 req.user；可选更新 last_used_at
    → 未命中则 401

下游服务（mxmcgi、mxmauth 等）
    → 只认 Gateway 注入的 req.user（userId、username、role）
    → 计费、权限、任务归属均按该用户处理，与浏览器用 JWT 登录无异
```

这样：**同一套接口，既支持浏览器 JWT 登录，也支持外部客户端用 API Key**，业务侧无感。

---

## 4. 数据模型与存储

**表：`user_api_keys`**（mxmdata 做 migration）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 所属用户，FK → users.id |
| key_hash | TEXT NOT NULL | 密钥的 SHA-256，校验用，不可逆 |
| key_prefix | VARCHAR(12) NOT NULL | 密钥前缀（如 `mxm_1a2b`），列表与日志展示用 |
| name | VARCHAR(128) | 用户填的备注，如「OpenClaw」「公司脚本」 |
| key_type | TEXT | `personal`（个人自动化，全平台已认证 API + Open API）或 `integration`（仅 `/api/v1/open/*`） |
| created_at | TIMESTAMPTZ | 创建时间 |
| last_used_at | TIMESTAMPTZ | 最近一次使用时间（可选，便于用户判断是否在用） |
| expires_at | TIMESTAMPTZ | 可选，过期时间；NULL 表示长期有效（与 GitHub 可选 expiry 一致） |

- **密钥格式**：建议 `mxm_` + 高随机度字符串（如 32 位 nanoid），与常见 `sk-`、`ghp_` 前缀类似，一眼可知是平台 API Key。
- **索引**：`key_hash` 唯一索引（校验）；`user_id` 索引（列表/撤销）；可选 `expires_at` 便于定时清理。

首版可实现：**无 scope、无 expires_at**，只做「全权限、长期有效」；后续再加 scope/expiry 字段与校验逻辑，与成熟提供方一致。

---

## 5. 认证逻辑（Gateway）

在现有 `authMiddleware` 中，在 **JWT 校验失败之后** 增加 API Key 分支：

1. 取 `Authorization: Bearer <token>`，若为空则 401。
2. **先 JWT**：`jwt.verify(token, JWT_SECRET)`；成功则设 `req.user`，`next()`。
3. **再 API Key**（仅在非 JWT 或 JWT 无效时）：
   - `keyHash = SHA256(token)`；
   - 查 `user_api_keys` 中 `key_hash = keyHash` 且 `(expires_at IS NULL OR expires_at > NOW())`；
   - 若存在：按 `user_id` 查 `users` 取 username、role，设 `req.user`；可选更新 `last_used_at`；`next()`；
   - 若不存在：返回 401，与「无效 JWT」一致。

下游只依赖 `req.user`，不关心是 JWT 还是 API Key。

---

## 6. 用户侧 API（mxmauth，需 JWT 登录）

与 GitHub/OpenAI 的「在已登录状态下管理 Token」一致：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/account/api-keys | 创建：生成随机 key，写 hash/prefix/user_id/name，**响应里仅此一次返回明文 key** + id、name、key_prefix、created_at |
| GET | /api/v1/account/api-keys | 列表：当前用户的 key（id、key_prefix、name、created_at、last_used_at、expires_at），**不返回明文** |
| DELETE | /api/v1/account/api-keys/:id | 撤销：删除或软删，需校验归属当前用户 |

- 创建时可限制：每用户最多 N 个（如 10 个），防止滥建。
- 首版可不做 scope；若做 scope，可在表中加 `scopes JSONB`，创建与校验时按 scope 限制可访问的路径/操作。

---

## 7. Web 前端

- **入口**：个人中心 / 设置 下的 **「API 密钥」** 或 **「个人访问凭证」**（与 GitHub 的 Personal access tokens 命名对齐）。
- **列表**：展示 key_prefix、name、创建时间、最近使用、过期时间（若有）；操作：撤销；**不展示、不可复制**完整 Key。
- **创建**：输入备注（必填或可选视产品而定）→ 创建 → 弹窗/新页 **仅一次** 展示完整 Key + 明显提示「请立即保存，关闭后无法再次查看」，与 GitHub/OpenAI 一致。

---

## 8. OpenClaw 等客户端配置

- **Base URL**：填平台 Gateway 的根地址（若 Gateway 把 `/api/v1` 作为统一前缀，则按客户端要求填根地址或带前缀的地址）。
- **API Key**：填用户在平台创建的 Key；客户端一般会以 `Authorization: Bearer <key>` 发送，无需改服务端。
- 若 OpenClaw 使用「自定义 OpenAI 兼容」接口，通常只需配置 Base URL + API Key，即与上述方式一致。

### 8.1 Agent Skill（推荐）

账号中心 **API Token → 下载 Agent Skill** 可获取 `mxm-agent-platform.zip`，内含 Cursor/OpenClaw 可安装的 Skill 与 `scripts/mxm-catalog.mjs`。

Skill 不固化业务列表，而是教 Agent 调用：

```http
GET /api/v1/agent/catalog
Authorization: Bearer mxm_...
```

返回当前全部 Task V2 业务、可执行 Smartflow 及入参字段摘要（**不含**第三方 Open API slug；integration Key 场景见 `docs/API_OPEN_PUBLISH.md`）。详见 `.cursor/skills/mxm_agent_platform/SKILL.md`。

---

## 9. 安全与扩展（对齐成熟提供方）

- **只存 hash、明文只展示一次**：与 GitHub/OpenAI 一致。
- **列表与日志只出现 prefix**：便于用户识别、审计，且泄露 prefix 无法直接调用。
- **撤销即失效**：删除或软删后，该 Token 立即不可用。
- **可选扩展**（后期）：  
  - **Scope**：限制该 Key 只能调某些接口（如仅 /cgi/graph、仅读等）；  
  - **过期时间**：创建时选 7 天/30 天/90 天/无过期；  
  - **单 Key / 单用户限流**：防滥用；  
  - **审计日志**：某 Key 在何时访问了哪些接口，便于安全排查。

首版可只做「全权限、长期有效、可撤销」，后续按需加 scope/expiry/限流/审计。

---

## 10. 实现顺序建议

1. **mxmdata**：migration 新增 `user_api_keys` 表（含 key_hash、key_prefix、user_id、name、created_at、last_used_at；expires_at 可先 nullable 预留）。
2. **mxmdata**（可选）：封装 `UserApiKeyRepository`（create/list/delete/findByKeyHash），供 gateway 与 mxmauth 复用。
3. **mxmauth**：实现 POST/GET/DELETE `/account/api-keys`（创建时生成 key、写库、响应仅一次返回明文）。
4. **gateway**：在 `authMiddleware` 中，JWT 失败后增加 API Key 校验与 `req.user` 注入。
5. **web**：API 密钥管理页（列表 + 创建时一次展示明文 + 撤销）。

按此顺序即可实现「用户获取 Token → 在 OpenClaw 等配置 → 代表自己调用平台功能」的完整链路，并与 GitHub/OpenAI 等成熟接口提供方的用法和安全性对齐，便于后期扩展。

---

## 11. 已发布开放 API（slug）

在 API Key 鉴权之上，平台提供 **「发布为开放 API」** 产品层（表 `published_apis`）：

- 用户/Admin 将 **Task V2 业务**（`scope` + `taskKey` + `subtype`）或 **Smartflow** 登记为全局唯一 **slug**。
- 第三方使用 **自己的 API Key** 调用（与 JWT 相同 Gateway `authMiddleware`）：
  - `GET /api/v1/open/{slug}` — 入参 JSON Schema 快照 + curl 示例（**也需 API Key**）
  - `POST /api/v1/open/{slug}/run` — 异步执行（`params` 或 `input_data`）
  - `GET /api/v1/open/{slug}/jobs/{jobId}` — 轮询状态

- **鉴权身份**：调用方为 Key 所属用户（Gateway 注入 `x-user-id`）。
- **计费**：Open API **扣发布者钱包**（`published_apis.owner_user_id`），不是扣调用方；任务 metadata 记 `callerUserId` / `publishedSlug`，Web「第三方应用」分栏可筛选。
- **Key 类型**：第三方集成应使用 `integration` Key；`personal` Key 仍可调 Open API，但也能访问 `/api/v1/cgi/*`，不宜外发。
- Gateway 在 API Key 鉴权后根据 `key_type` 限制路径：`integration` 仅 `/api/v1/open/*`（WebSocket 亦拒绝）。

详见 [API_OPEN_PUBLISH.md](./API_OPEN_PUBLISH.md)。
