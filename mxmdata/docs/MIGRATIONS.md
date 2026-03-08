# 数据迁移说明

以下迁移按需执行（依赖 Supabase/PostgreSQL 已就绪，且 `mxmdata/.env` 中配置好 `SUPABASE_DB_URL` 或 `DATABASE_URL`）。

## 敏感词表（敏感词管理、提示词工程）

**用途**：Admin 敏感词管理、按业务 slot 绑定敏感词表。

**脚本**：`add_sensitive_word_tables.sql`  
**执行**（在项目根目录）：

```bash
pnpm --filter @mxmai/mxmdata run migrate:sensitive-words
```

或在 `mxmdata` 目录下：

```bash
cd mxmdata && pnpm run migrate:sensitive-words
```

**表**：`sensitive_word_lists`、`sensitive_words`、`sensitive_word_list_bindings`。

**执行迁移后仍报「Could not find the table ... in the schema cache」**：Supabase PostgREST 会缓存 schema。在项目根目录执行：
```bash
pnpm --filter @mxmai/mxmdata run reload-schema
```
或在 Supabase Dashboard → Project Settings → API 中点击 Reload schema cache。

**若 lists/bindings 仍返回 500（表已有）**：多半是 Supabase 对这三张表开启了 RLS，anon key 无权限。可二选一：

- **推荐**：配置 `SUPABASE_SERVICE_KEY`（service_role 会绕过 RLS），在 mxmcgi/mxmdata 的 `.env` 中设置后重启。
- **或**：关闭三张表的 RLS，执行：

```bash
pnpm --filter @mxmai/mxmdata run migrate:sensitive-words-rls
```

脚本对应 SQL：`add_sensitive_word_disable_rls.sql`。

---

## 提示词工程配置

**用途**：按 (scope, type, subtype) 配置四部分提示词、知识库开关等。

**脚本**：`add_prompt_engineering_config.sql`  
**执行**：在 Supabase SQL Editor 或 psql 中执行该 SQL，或由项目内已有初始化流程执行。

---

## 知识库默认绑定

**用途**：各业务 (scope, category, sub_type) 默认使用的知识库。

**脚本**：`add_knowledge_base_defaults.sql`  
**执行**：

```bash
pnpm --filter @mxmai/mxmdata run migrate:kb-defaults
```

---

## 任务事件 Outbox（可选）

**用途**：任务状态变更事件发往 mxmnotify 等。

**脚本**：`add_task_event_outbox.sql`  
**执行**：在 Supabase 中执行该 SQL。

---

## 其他迁移（按需）

| 脚本 | 说明 | 执行命令 |
|------|------|----------|
| add_admin_stats_functions.sql | 系统概览统计函数 | `pnpm --filter @mxmai/mxmdata run migrate:admin-stats` |
| add_wallet_user_fk.sql | 钱包用户外键 | `pnpm --filter @mxmai/mxmdata run migrate:wallet-user-fk` |
| add_character_relations.sql | 角色关联 | `pnpm --filter @mxmai/mxmdata run migrate:character-relations` |
| add_provider_api_keys.sql | Provider API Key 表 | 手动执行 SQL |

---

## 敏感词管理 502/500 的常见原因

1. **mxmcgi 未启动**：先解决 `MODULE_NOT_FOUND` 等启动错误，确保 mxmcgi 在 4003 端口监听。
2. **未执行敏感词迁移**：若未执行 `migrate:sensitive-words`，敏感词接口会报 503（表未初始化），需先执行该迁移。
3. **表已有仍 500**：多为 RLS 或权限导致。请配置 `SUPABASE_SERVICE_KEY`，或执行 `migrate:sensitive-words-rls` 关闭三张表的 RLS；接口在检测到 RLS/权限错误时会返回 503 并提示上述两种做法。
