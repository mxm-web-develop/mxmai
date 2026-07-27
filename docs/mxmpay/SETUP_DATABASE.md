# mxmpay 数据库设置指南

## 1. 在 Supabase 中执行 SQL 创建表结构

### 方法一：通过 Supabase Studio（推荐）

1. 打开 Supabase Studio：http://localhost:54323
2. 点击左侧菜单的 **SQL Editor**
3. 复制 `mxmdata/src/database/schemas/mxmpay.sql` 文件的内容
4. 粘贴到 SQL Editor 中
5. 点击 **Run** 执行

### 方法二：通过 Docker 直接执行

如果 Docker 容器正在运行，可以使用以下命令：

```bash
cd /Users/mxm_pro/Desktop/codes/mobile/mxmdata
cat src/database/schemas/mxmpay.sql | docker exec -i mxmai-postgres psql -U postgres -d postgres
```

### 方法三：通过 psql 客户端

```bash
psql -h localhost -p 5432 -U postgres -d postgres -f mxmdata/src/database/schemas/mxmpay.sql
```

## 2. 配置 mxmpay/.env

确保 `mxmpay/.env` 中包含以下 Supabase 配置（与 `mxmdata/.env` 保持一致）：

```env
# Supabase 配置（必须与 mxmdata/.env 一致）
SUPABASE_URL=http://localhost:3001
SUPABASE_ANON_KEY=你的_ANON_KEY
SUPABASE_SERVICE_KEY=你的_SERVICE_KEY（可选，但推荐）

# 其他配置...
PORT=4002
PAYMENT_EXPIRE_MINUTES=20
```

### 如何获取 Supabase 配置

1. 打开 Supabase Studio：http://localhost:54323
2. 点击左侧菜单的 **Settings** → **API**
3. 复制以下值：
   - **Project URL**: 填入 `SUPABASE_URL`（通常是 `http://localhost:3001` 或 `http://localhost:8000`）
   - **anon public key**: 填入 `SUPABASE_ANON_KEY`
   - **service_role key**: 填入 `SUPABASE_SERVICE_KEY`（可选）

## 3. 验证表结构

执行 SQL 后，可以在 Supabase Studio 的 **Table Editor** 中查看以下表：

- `assets` - 资产配置表
- `wallets` - 钱包表
- `wallet_transactions` - 钱包交易记录表
- `wallet_tasks` - 钱包任务表
- `payment_orders` - 支付订单表

## 4. 测试服务启动

配置完成后，运行：

```bash
cd /Users/mxm_pro/Desktop/codes/mobile
pnpm dev:mxmpay
```

如果看到以下输出，说明启动成功：

```
✅ mxmdata 初始化成功
✅ 支付过期检查定时任务已启动
🚀 mxmpay 服务已启动: http://127.0.0.1:4002
```

## 常见问题

### 问题 1: 表已存在错误

如果看到 `relation "xxx" already exists` 错误，说明表已经创建过了。可以忽略此错误，或者先删除表再重新创建。

### 问题 2: 函数不存在错误

如果看到 `function update_updated_at_column() does not exist` 错误，需要先执行 `mxmdata/src/database/schemas/mxmauth.sql` 中的触发器函数定义。

### 问题 3: 连接失败

如果服务启动时提示连接失败，检查：
1. Docker 容器是否正在运行：`docker ps | grep mxmai-postgres`
2. `SUPABASE_URL` 是否正确（通常是 `http://localhost:3001` 或 `http://localhost:8000`）
3. `SUPABASE_ANON_KEY` 是否正确

