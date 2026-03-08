# 知识库数据库设置指南

## 问题

如果遇到以下错误：
```
Could not find the table 'public.knowledge_bases' in the schema cache
```

说明数据库表尚未创建，需要执行 SQL 迁移脚本。

## 创建数据库表

### ⚠️ 重要：先启用 pgvector 扩展

在创建表之前，必须先启用 `pgvector` 扩展。

#### 情况 1：使用 Supabase 云服务

Supabase 云服务默认支持 pgvector，但需要通过 Dashboard 启用：

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **Database** → **Extensions**（或直接访问：`https://app.supabase.com/project/YOUR_PROJECT/database/extensions`）
4. 在搜索框中输入 `vector` 或 `pgvector`
5. 找到 `vector` 扩展，点击右侧的 **Enable** 按钮
6. 等待几秒钟，扩展启用成功后会显示绿色对勾

启用后，在 SQL Editor 中执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 情况 2：使用本地 Supabase（Docker）

如果使用本地 Supabase（通过 Docker），pgvector 应该已经包含，但可能需要启用：

1. 确保使用支持 pgvector 的 Supabase 镜像
2. 在 Supabase Studio 中（通常是 `http://localhost:8000`）：
   - 进入 **Database** → **Extensions**
   - 搜索并启用 `vector` 扩展

或者在 SQL Editor 中直接执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 情况 3：使用本地 PostgreSQL（非 Supabase）

如果使用本地 PostgreSQL（非 Supabase），需要先安装 pgvector：

**macOS (使用 Homebrew)**:
```bash
brew install pgvector
```

**Linux (Ubuntu/Debian)**:
```bash
# 根据你的 PostgreSQL 版本调整（14, 15, 16 等）
sudo apt-get install postgresql-14-pgvector
```

**Docker (如果使用 Docker Compose)**:
在 `docker-compose.yml` 中使用支持 pgvector 的镜像：
```yaml
postgres:
  image: ankane/pgvector:latest  # 或 supabase/postgres:版本号
```

安装后，在 PostgreSQL 中执行：
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 常见错误

- ❌ `extension "vector" is not available` - pgvector 未安装或未启用
  - **Supabase 云服务**：在 Dashboard 的 Extensions 页面启用
  - **本地 PostgreSQL**：需要先安装 pgvector 扩展
- ❌ `type "vector" does not exist` - 扩展未启用，执行 `CREATE EXTENSION`
- ❌ `CREATE EXTENSION IF NOT EX` - 语句不完整
- ✅ `CREATE EXTENSION IF NOT EXISTS vector;` - 正确

**注意**：如果遇到 `extension "vector" is not available` 错误，说明需要先在系统层面安装或启用 pgvector。

### 方式一：使用 Supabase Dashboard（推荐）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. **第一步**：先执行以下语句启用扩展：
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
5. **第二步**：复制 `mxmdata/src/database/schemas/knowledge_base.sql` 文件中的全部 SQL 语句
6. 粘贴到 SQL Editor 中
7. 点击 **Run** 执行

### 方式二：使用 Supabase CLI

```bash
# 安装 Supabase CLI（如果还没有）
npm install -g supabase

# 初始化项目（如果还没有）
supabase init

# 将 SQL 文件添加到迁移
cp mxmdata/src/database/schemas/knowledge_base.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_create_knowledge_base.sql

# 推送迁移到 Supabase
supabase db push
```

### 方式三：使用 psql（本地 PostgreSQL）

```bash
psql -h localhost -U postgres -d your_database -f mxmdata/src/database/schemas/knowledge_base.sql
```

## 验证表已创建

在 Supabase Dashboard 中：
1. 进入 **Table Editor**
2. 查看是否有以下表：
   - `knowledge_bases` - 知识库配置表
   - `knowledge_base_documents` - 知识库文档表
3. 确认表结构正确

## 表结构说明

### knowledge_bases 表

知识库配置表，存储知识库的基本信息和配置：
- `id` (UUID) - 主键
- `name` (VARCHAR) - 知识库名称（唯一标识）
- `display_name` (VARCHAR) - 显示名称
- `description` (TEXT) - 描述
- `type` (VARCHAR) - 检索类型：'vector' | 'keyword' | 'hybrid'
- `embedding_model` (VARCHAR) - 嵌入模型
- `agent_id` (VARCHAR) - 关联的 agent ID
- `is_builtin` (BOOLEAN) - 是否为内置知识库
- `is_public` (BOOLEAN) - 是否公开
- `owner_id` (UUID) - 创建者（用户 ID）
- `document_count` (INTEGER) - 文档数量
- `total_size_bytes` (BIGINT) - 总大小（字节）
- `config` (JSONB) - 扩展配置
- `created_at` (TIMESTAMP) - 创建时间
- `updated_at` (TIMESTAMP) - 更新时间

### knowledge_base_documents 表

知识库文档表，存储文档内容和向量嵌入：
- `id` (UUID) - 主键
- `knowledge_base_name` (VARCHAR) - 所属知识库名称
- `title` (VARCHAR) - 文档标题
- `content` (TEXT) - 文档内容
- `content_type` (VARCHAR) - 内容类型：'text' | 'markdown' | 'html'
- `embedding` (vector(1536)) - 向量嵌入（pgvector）
- `metadata` (JSONB) - 元数据
- `tags` (TEXT[]) - 标签数组
- `user_id` (UUID) - 创建者（用户 ID）
- `is_public` (BOOLEAN) - 是否公开
- `view_count` (INTEGER) - 查看次数
- `created_at` (TIMESTAMP) - 创建时间
- `updated_at` (TIMESTAMP) - 更新时间

## 注意事项

1. **pgvector 扩展（必需）**：知识库使用 pgvector 进行向量搜索，**必须先启用** `vector` 扩展，否则会报错 `type "vector" does not exist`：
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   
   **执行顺序**：
   1. 先执行 `CREATE EXTENSION IF NOT EXISTS vector;`
   2. 再执行 `knowledge_base.sql` 中的其他语句

2. **索引**：SQL 脚本会自动创建必要的索引，用于优化查询性能。

3. **RPC 函数**：SQL 脚本会创建 `search_knowledge_base` RPC 函数，用于向量搜索。

## 快速测试

创建表后，可以通过以下方式测试：

```bash
# 通过 Gateway 访问
curl -X GET http://localhost:3000/api/v1/knowledge/bases \
  -H "Authorization: Bearer <your-token>"

# 应该返回空数组 []，而不是错误
```

