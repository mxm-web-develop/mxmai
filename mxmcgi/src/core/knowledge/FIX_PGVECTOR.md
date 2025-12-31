# 修复 pgvector 扩展不可用问题

## 问题

错误信息：
```
ERROR: extension "vector" is not available
DETAIL: Could not open extension control file "/usr/local/share/postgresql/extension/vector.control": No such file or directory.
```

## 原因

你使用的是本地 Supabase（`http://localhost:8000`），但 Docker Compose 中的 PostgreSQL 镜像（`postgres:16-alpine`）不包含 pgvector 扩展。

## 解决方案

### 方案 1：更换支持 pgvector 的 PostgreSQL 镜像（推荐）

修改 `mxmdata/docker-compose.yml`：

```yaml
postgres:
  image: pgvector/pgvector:pg16  # 使用 PostgreSQL 16 版本，匹配原有数据目录
  container_name: mxmai-postgres
```

**重要**：如果遇到版本不兼容错误（如 "database files are incompatible"），需要：

1. **备份数据**（如果需要保留数据）：
   ```bash
   cd mxmdata
   docker compose exec postgres pg_dumpall -U postgres > backup.sql
   ```

2. **删除旧数据目录**（会丢失数据，仅用于开发环境）：
   ```bash
   cd mxmdata
   docker compose down
   rm -rf data/postgres
   ```

3. **重启服务**：
   ```bash
   docker compose up -d
   ```

### 方案 2：使用 Supabase 官方镜像

```yaml
postgres:
  image: supabase/postgres:15.1.0.117  # 或更新版本
  container_name: mxmai-postgres
```

### 方案 3：手动安装 pgvector（不推荐，较复杂）

如果必须使用 `postgres:16-alpine`，需要在容器内安装 pgvector，但这需要修改 Dockerfile，比较复杂。

## 验证修复

1. **重启 PostgreSQL 容器后**，在 Supabase Studio 的 SQL Editor 中执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

2. **应该成功执行**，不再报错。

3. **然后执行知识库表创建脚本**：

```sql
-- 复制 mxmdata/src/database/schemas/knowledge_base.sql 的内容
-- 从第 10 行开始（跳过扩展创建语句）
```

## 已自动修复

我已经更新了 `mxmdata/docker-compose.yml`，将 PostgreSQL 镜像改为 `ankane/pgvector:latest`。

**下一步**：
1. 重启 Docker 服务：
   ```bash
   cd mxmdata
   docker compose down
   docker compose up -d
   ```
2. 等待服务启动（约 30 秒）
3. 在 Supabase Studio 的 SQL Editor 中执行：
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
4. 然后执行知识库表创建脚本

