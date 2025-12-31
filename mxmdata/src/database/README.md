# 数据库 Schema 定义

此目录包含各业务模块的数据库表结构 SQL 定义。

## 目录结构

```
database/
├── schemas/          # 各模块的 schema 文件
│   ├── mxmauth.sql   # 用户管理模块表结构
│   ├── mxmpay.sql    # 支付模块表结构
│   ├── mxmprompt.sql # 提示词优化模块表结构（向量数据库）
│   └── ...
└── migrations/       # 数据库迁移脚本（待添加）
```

## 使用方法

### Supabase

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制对应的 SQL 文件内容
5. 粘贴并执行

### PostgreSQL（本地开发，不推荐）

**注意**: 当前只支持 Supabase 适配器。如果使用本地 PostgreSQL，需要通过 Supabase 连接，而不是直接访问。

```bash
# 不推荐：直接访问 PostgreSQL
# psql -h localhost -U postgres -d mxmai -f schemas/mxmauth.sql

# 推荐：使用 Supabase Dashboard 的 SQL Editor
```

## 模块 Schema

### mxmauth.sql

用户管理模块的表结构：
- `users` - 用户表
- `user_settings` - 用户设置表
- `user_sessions` - 用户会话表（可选）

### mxmpay.sql

支付模块的表结构：
- `wallets` - 钱包表
- `transactions` - 交易表
- `payment_methods` - 支付方式表

### mxmprompt.sql

提示词优化模块的表结构（向量数据库）：
- `base_models` - 主力模型表
- `lora_models` - LoRA 模型表
- `prompt_templates` - 提示词模板表
- `generation_cases` - 生成案例表

**注意**：此模块使用 pgvector 扩展进行向量搜索，需要启用 `vector` 扩展。

## 注意事项

- 所有数据库表结构定义都在 `mxmdata` 模块中统一管理
- 业务模块（如 mxmauth）不直接定义表结构，只通过 `@mxmai/mxmdata` 访问数据
- 修改表结构时，需要同时更新对应的 SQL 文件和 `mxmdata` 中的接口定义

