# mxmdata - 数据访问层

统一的数据访问抽象层，使所有业务服务无需关心底层存储。

**推荐方案：Supabase + MinIO + Redis**
- **Supabase**: 基于 PostgreSQL 的云数据库服务，提供 REST API 和实时功能
- **MinIO**: S3 兼容的对象存储，用于文件存储
- **Redis**: 缓存和会话存储，由 `mxmdata` 通过 Docker 统一管理，避免跨系统问题

**注意**: 当前只支持 Supabase 适配器，不直接访问 PostgreSQL。Supabase 本身就是基于 PostgreSQL 的，提供了更好的开发体验。

## 快速开始

### 1. 配置环境变量

在 `mxmdata` 目录下创建 `.env` 文件：

```bash
cd mxmdata
cp .env.example .env
# 编辑 .env 文件，填入数据库配置
```

### 2. 启动数据服务

**方式一：一键启动（推荐）**

```bash
# 在 mxmdata 目录下
pnpm start:all
# 或
./start-all.sh
```

一键启动脚本会自动：
- 启动所有 Docker 服务（MinIO, Redis, PostgreSQL, Supabase 等）
- 等待服务就绪
- 测试连接
- 可选：初始化数据库表结构

**方式二：手动启动**

```bash
# 在 mxmdata 目录下
pnpm docker:up

# 查看服务状态
pnpm docker:ps
```

**注意**：Redis 服务由 `mxmdata` 通过 Docker 统一管理，所有服务（如 `mxmauth`）都通过 `localhost:6379` 访问 Redis，无需在系统层面安装 Redis，避免跨系统问题。

### 3. 打开管理界面

```bash
# 打开 MinIO Console (http://localhost:9001)
# 默认账号: minioadmin / minioadmin
pnpm minio:open

# 打开 Supabase Dashboard (如果使用云服务)
pnpm supabase:open
```

### 4. 测试连接

```bash
# 测试数据库和存储连接
pnpm test:connection

# 测试功能（MinIO CRUD 操作）
pnpm test:functionality

# 测试 Supabase 创建数据（用户 CRUD）
pnpm test:create
```

## 目录结构

```
mxmdata/
├── data/                    # 数据存储目录
│   ├── minio/              # MinIO 数据
│   ├── redis/              # Redis 数据
│   └── postgres/           # PostgreSQL 数据
├── docker-compose.yml      # Docker 服务配置
├── src/
│   ├── adapters/           # 适配器实现
│   │   ├── supabase/       # Supabase 适配器
│   │   ├── minio/          # MinIO 适配器
│   │   └── extensions/     # 扩展适配器示例
│   ├── interfaces/         # 接口定义
│   │   ├── IUserRepository.ts
│   │   ├── IUserMediaRepository.ts    # 用户媒体资产接口
│   │   ├── IUserAgentRepository.ts     # 用户助手项目接口
│   │   ├── IStorageRepository.ts
│   │   └── IPaymentRepository.ts
│   ├── models/             # 数据模型
│   │   ├── User.ts
│   │   ├── Media.ts         # 媒体资产模型
│   │   ├── Agent.ts         # 助手项目模型
│   │   ├── Storage.ts
│   │   └── Payment.ts
│   ├── factories/          # Repository 工厂
│   └── scripts/            # 工具脚本
└── README.md
```

## 常用命令

所有命令需要在 `mxmdata` 目录下执行，或使用 `pnpm --filter @mxmai/mxmdata <command>`。

```bash
# 服务管理
pnpm start:all          # 一键启动所有服务（推荐）
pnpm docker:up          # 启动服务
pnpm docker:down        # 停止服务
pnpm docker:restart     # 重启服务
pnpm docker:logs        # 查看日志
pnpm docker:ps          # 查看状态
pnpm docker:pull        # 拉取镜像

# 代理配置
pnpm proxy:setup        # 配置 Docker 代理（Clash）

# GUI 访问
pnpm minio:open         # 打开 MinIO Console
pnpm supabase:open      # 打开 Supabase Dashboard

# 测试
pnpm test:connection    # 测试连接
pnpm test:functionality # 测试功能（MinIO）
pnpm test:create        # 测试创建数据（Supabase 用户 CRUD）

# 开发
pnpm dev                # 开发模式
pnpm build              # 构建
pnpm start              # 启动
```

## 详细文档

- [README_DATABASE.md](./README_DATABASE.md) - 数据库使用指南
- [SETUP_SERVICES.md](./SETUP_SERVICES.md) - 服务安装和配置
- [QUICK_START.md](./QUICK_START.md) - 快速开始指南
- [TEST_SUMMARY.md](./TEST_SUMMARY.md) - 测试总结
