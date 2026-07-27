# mxmcgi 数据库设置指南

## 概述

mxmcgi 使用 `cgi_tasks` 表来管理所有异步生成任务。在开始使用之前，需要先在 Supabase 中创建这个表。

## 创建数据库表

### 方式一：使用 Supabase Dashboard（推荐）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `mxmdata/src/database/schemas/mxmcgi.sql` 文件中的 SQL 语句
5. 粘贴到 SQL Editor 中
6. 点击 **Run** 执行

### 方式二：使用 Supabase CLI

```bash
# 安装 Supabase CLI（如果还没有）
npm install -g supabase

# 初始化项目（如果还没有）
supabase init

# 将 SQL 文件添加到迁移
cp mxmdata/src/database/schemas/mxmcgi.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_create_cgi_tasks.sql

# 推送迁移到 Supabase
supabase db push
```

### 方式三：使用 psql（本地 PostgreSQL）

```bash
psql -h localhost -U postgres -d your_database -f mxmdata/src/database/schemas/mxmcgi.sql
```

## 验证表已创建

在 Supabase Dashboard 中：
1. 进入 **Table Editor**
2. 查看是否有 `cgi_tasks` 表
3. 确认表结构包含以下字段：
   - `id` (UUID)
   - `user_id` (UUID)
   - `task_type` (VARCHAR)
   - `model_name` (VARCHAR)
   - `status` (VARCHAR)
   - `progress` (INTEGER)
   - `input_data` (JSONB)
   - `output_data` (JSONB)
   - 等等...

## 表结构说明

`cgi_tasks` 表用于存储所有 CGI 异步任务：

- **任务基本信息**：`task_type`, `model_name`, `model_provider`
- **任务状态**：`status`, `progress`, `error_message`
- **任务输入**：`input_data`, `prompt`
- **任务输出**：`output_data`, `result_format`, `storage_info`
- **时间戳**：`created_at`, `updated_at`, `started_at`, `completed_at`

详细结构请参考 `mxmdata/src/database/schemas/mxmcgi.sql`。

## 注意事项

- 确保 `user_id` 字段与你的用户表（`users`）关联
- 如果使用外键约束，需要先创建 `users` 表
- 索引已自动创建，用于优化查询性能

## 从 UUID 迁移到 UID（如果表已存在）

如果表已经存在且字段类型是 UUID，需要执行迁移：

```sql
ALTER TABLE cgi_tasks 
  ALTER COLUMN id TYPE VARCHAR(64),
  ALTER COLUMN user_id TYPE VARCHAR(64);
```

**重要**：
- 迁移是**立即生效**的，**不需要重启数据库**
- 现有数据会自动转换（UUID 格式会保留为字符串）
- 详细迁移说明请参考 `MIGRATE_UUID_TO_UID.md`
