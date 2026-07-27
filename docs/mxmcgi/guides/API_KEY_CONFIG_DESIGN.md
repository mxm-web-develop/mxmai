# API Key 配置设计：DB 存储 + Admin 可配置 + 数组模式

## 现状与目标

- **原状**：Key 写在 .env，单 key，不便 Admin 随时添加/切换。
- **目标**：
  1. **DB 为主**：Key 存数据库表 `provider_api_keys`，Admin 随时增删、改 priority、启用/禁用，无需改 .env 或重启。
  2. **安全**：key_value 仅服务端使用；API 仅返回脱敏（如 `***后4位`）；禁止将 key 写入日志。
  3. **数组模式**：同一 (provider, service) 可配置多条 key，按 priority 升序使用，优先第一个；后续可做 401/429 换 key 重试。
  4. **兜底 .env**：DB 无配置时从 .env 读取（单 key 或多 key 逗号分隔）。

## 设计概览

```
                    ┌─────────────────────────────────────┐
                    │   Key 来源（按优先级合并）             │
                    │   1. DB（admin 配置，按 priority 排序）  │
                    │   2. .env（单 key 或 KEY1,KEY2,KEY3）  │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │   ProviderKeyResolver (mxmcgi 内)     │
                    │   getKeys(provider, service?) → [ ]  │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   DeerProvider              OfficialProvider              ReplicateProvider
   (keys[0] 为主，           (按 service 取 keys，           (keys[0] 为主，
    失败换 keys[1])           失败换下一个)                   失败换下一个)
```

## 1. 存储

### 1.1 .env（保留，兼容）

支持两种写法，解析为「字符串数组」：

- **单 key**（兼容现有）：`DEERAPI_API_KEY=sk-xxx`
- **多 key**（逗号分隔）：`DEERAPI_API_KEYS=sk-1,sk-2,sk-3`

约定：若存在 `*_API_KEYS`，则用其（按顺序）；否则用 `*_API_KEY` 转为单元素数组。

示例：

```bash
# Deer
DEERAPI_API_KEYS=key1,key2,key3
DEERAPI_BASE_URL=https://api.deerapi.com

# Official 各子服务
OPENAI_API_KEYS=sk-1,sk-2
GOOGLE_API_KEYS=key1,key2
ANTHROPIC_API_KEYS=sk-1,sk-2
MINIMAX_API_KEYS=key1
QWEN_API_KEYS=key1

# Replicate
REPLICATE_API_TOKENS=r8_1,r8_2
```

### 1.2 DB（可选，Admin 配置）

表：`provider_api_keys`（在 mxmdata 中建表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| provider | text | `deer` \| `replicate` \| `ppio` \| `official` |
| service | text | 仅 official 时使用：`openai` \| `google` \| `anthropic` \| `minimax` \| `qwen`，其余 NULL |
| key_value | text | 密钥（建议加密存储或至少脱敏日志） |
| priority | int | 越小越优先，0 表示第一个用 |
| is_active | boolean | 是否启用 |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| updated_by | uuid | 操作人（admin user_id） |

- Admin 仅能增删改此表；查询时按 `(provider, service)` 过滤，`ORDER BY priority ASC`。
- **合并规则**：某 (provider, service) 若在 DB 中有记录，则**只使用 DB 的 key 列表**（忽略 .env 中该 provider/service）；否则使用 .env 解析出的数组。

## 2. 解析层（mxmcgi 内）

- **ProviderKeyResolver**（或 `getProviderKeys(provider, service?)`）：
  - 输入：`provider`（`deer` | `replicate` | `ppio` | `official`），`service?`（仅 official：openai / google / anthropic / minimax / qwen）。
  - 输出：`string[]`，按使用顺序排列（第一个优先）。
  - 逻辑：
    1. 若启用 DB：查 `provider_api_keys` 中 `is_active=true` 的 (provider, service)，按 priority 排序得到 `dbKeys`；若 `dbKeys.length > 0` 则返回 `dbKeys`。
    2. 否则从 .env 解析（见上），返回数组。

- **.env 解析规则**（按 provider/service 映射到环境变量名）：

| provider | service | 单 key 变量 | 多 key 变量 |
|----------|---------|-------------|-------------|
| deer | - | DEERAPI_API_KEY | DEERAPI_API_KEYS |
| replicate | - | REPLICATE_API_TOKEN | REPLICATE_API_TOKENS |
| ppio | - | PPIO_API_KEY | PPIO_API_KEYS |
| official | openai | OPENAI_API_KEY | OPENAI_API_KEYS |
| official | google | GOOGLE_API_KEY / GEMINI_API_KEY | GOOGLE_API_KEYS / GEMINI_API_KEYS |
| official | anthropic | ANTHROPIC_API_KEY | ANTHROPIC_API_KEYS |
| official | minimax | MINIMAX_API_KEY | MINIMAX_API_KEYS |
| official | qwen | QWEN_API_KEY | QWEN_API_KEYS |
| official | volc | VOLC_API_KEY | VOLC_API_KEYS |

## 3. 各 Provider 使用方式

- **DeerProvider**：构造时或首次调用时通过 `ProviderKeyResolver.getKeys('deer')` 得到 `keys: string[]`；创建或复用 `DeerAPIClient` 时传入「当前使用的 key」；请求若返回 401/429，则换下一个 key 重试（可限制最多重试 key 数量）。
- **OfficialProvider**：按 service 调用 `getKeys('official', service)`，同上，多 key 轮询。
- **ReplicateProvider**：同 Deer，`getKeys('replicate')`。

客户端（如 DeerAPIClient）可接受 `apiKey: string` 或 `apiKeys: string[]`；内部维护当前下标，失败时下标 +1 再重试。

## 4. Admin API（仅 Admin）

- `GET /api/v1/system/admin/providers/keys?provider=&service=`  
  返回：各条 key 的 id、provider、service、priority、is_active、**masked 展示**（如后四位 `***abc1`），不返回明文。
- `POST /api/v1/system/admin/providers/keys`  
  body: `{ provider, service?, key_value, priority? }`，新增一条。
- `PUT /api/v1/system/admin/providers/keys/:id`  
  body: `{ priority?, is_active? }`，改顺序或启用/禁用。
- `DELETE /api/v1/system/admin/providers/keys/:id`  
  硬删该条 key。

**安全约定**：key_value 仅服务端使用；GET 仅返回 key_masked（如 `***ab12`）；禁止将 key 写入日志。DB 依赖库权限，生产建议开启 TDE 或卷加密。

**火山引擎（volc）**：Official 下新增 service `volc`，对应环境变量 `VOLC_API_KEY`/`VOLC_API_KEYS` 或 DB provider=official、service=volc；图模型槽位 `seedream-4-volc`，对接火山方舟 API 后即可用。

**执行迁移**：在 Supabase/PostgreSQL 执行 `mxmdata/src/database/migrations/add_provider_api_keys.sql` 创建表。

## 5. 实施顺序建议

1. **Phase 1（已做）**：provider-keys 从 .env 读，支持多 key。
2. **Phase 2**：401/429 时换下一个 key 重试（可选）。
3. **Phase 3（已做）**：mxmdata 表 `provider_api_keys` + Repository；Resolver 先查 DB，无则 .env。
4. **Phase 4（已做）**：Admin API GET/POST/PUT/DELETE /keys，脱敏返回。
5. **火山引擎（已做）**：Official 增加 volc 客户端与 seedream-4-volc 槽位。
