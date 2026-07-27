# mxmdata - 数据访问层设计

## 一、目标与原则

`mxmdata` 提供统一的数据访问抽象，使所有业务服务无需关心底层存储。

**推荐方案：Supabase + MinIO**
- **Supabase**: 基于 PostgreSQL 的云数据库服务，提供 REST API 和实时功能（当前唯一支持的数据库适配器）
- **MinIO**: S3 兼容的对象存储，用于文件存储

**注意**: 当前只支持 Supabase 适配器，不直接访问 PostgreSQL。Supabase 本身就是基于 PostgreSQL 的，提供了更好的开发体验。

核心原则：

- **解耦**：业务仅依赖接口，随时切换数据源。
- **可扩展**：新增业务模块时，可通过扩展接口或适配器快速复用。
- **一致性**：统一的错误处理、日志、重试与连接管理策略。
- **可测试**：接口易于 Mock，单元测试不依赖真实数据库。

---

## 二、总体架构

```text
┌───────────────┐
│  Business     │  mxmauth / mxmpay / mxmcgi / mxmnotify / ...
└──────┬────────┘
       │ RepositoryFactory + Adapter
┌──────▼────────┐
│   mxmdata      │
│  ├─ interfaces │ IUserRepository / IPaymentRepository / ...
│  ├─ adapters   │ Supabase / MinIO / ... (PostgreSQL 适配器尚未实现)
│  ├─ models     │ Type 定义
│  └─ factories  │ RepositoryFactory
└──────┬────────┘
       │
┌──────▼────────┐
│ Storage Layer │ Supabase (推荐) | MinIO | Redis
└───────────────┘
```

目录结构建议：

```text
mxmdata/
├── src/
│   ├── interfaces/
│   ├── adapters/
│   │   ├── supabase/
│   │   └── (postgresql/ 尚未实现，当前只支持 Supabase)
│   │   └── minio/
│   ├── models/
│   ├── factories/
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## 三、接口定义示例

### 3.1 基础 Repository

```typescript
// mxmdata/src/interfaces/IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(user: CreateUserDto): Promise<User>;
  update(id: string, data: UpdateUserDto): Promise<User>;
  delete(id: string): Promise<void>;
  updateSettings(userId: string, settings: UserSettings): Promise<UserSettings>;
  getSettings(userId: string): Promise<UserSettings | null>;
}
```

### 3.2 业务扩展接口

```typescript
// mxmauth 模块需要额外能力
export interface IAccountUserRepository extends IUserRepository {
  updateProfile(userId: string, profile: UserProfile): Promise<User>;
  updateAvatar(userId: string, avatarUrl: string): Promise<User>;
  getMembershipInfo(userId: string): Promise<MembershipInfo>;
}

// mxmpay 只关心余额
export interface IPaymentUserRepository {
  getUserBalance(userId: string): Promise<number>;
  getUserBasicInfo(userId: string): Promise<{ id: string; username: string; balance: number }>;
}
```

### 3.3 组合使用

业务层可以通过“适配器 + 装饰器”方式，在不修改基础 Repository 的情况下扩展方法。

```typescript
export class AccountUserRepositoryAdapter implements IAccountUserRepository {
  constructor(private baseRepo: IUserRepository) {}

  async findById(id: string) { return this.baseRepo.findById(id); }
  // ... 其他基础方法同样委托

  async updateProfile(userId: string, profile: UserProfile) {
    return this.baseRepo.update(userId, { ...profile, updated_at: new Date() });
  }
}
```

---

## 四、适配器实现

### 4.1 Supabase User Repository

```typescript
export class SupabaseUserRepository implements IUserRepository {
  constructor(private client: SupabaseClient) {}

  async findById(id: string) {
    const { data, error } = await this.client.from('users').select('*').eq('id', id).single();
    if (error) throw error;
    return data ? mapUser(data) : null;
  }

  async create(user: CreateUserDto) {
    const { data, error } = await this.client.from('users').insert(user).select().single();
    if (error) throw error;
    return mapUser(data);
  }

  // update / delete / updateSettings 同理
}
```

### 4.2 PostgreSQL 适配器（尚未实现）

**注意**: 当前只支持 Supabase 适配器。Supabase 基于 PostgreSQL，提供了 REST API、实时功能和更好的开发体验。

如果需要直接访问 PostgreSQL，建议使用 Supabase（它本身就是 PostgreSQL）。PostgreSQL 适配器尚未实现，未来如有需要可以添加。

### 4.3 MinIO 存储适配器

```typescript
export class MinIOStorageRepository implements IStorageRepository {
  constructor(private minio: Client) {}

  async uploadFile(bucket: string, key: string, file: Buffer, options?: UploadOptions) {
    await this.minio.putObject(bucket, key, file, file.length, { 'Content-Type': options?.contentType });
    return this.minio.presignedGetObject(bucket, key, 7 * 24 * 60 * 60);
  }
}

---

## 五、工厂模式

```typescript
export class RepositoryFactory {
  // 当前只支持 Supabase
  private static adapter: 'supabase' = (process.env.DATA_ADAPTER as any) || 'supabase';

  static createUserRepository(): IUserRepository {
    // 当前只支持 Supabase
    if (this.adapter !== 'supabase') {
      throw new Error('当前只支持 Supabase 适配器');
    }
    return new SupabaseUserRepository(getSupabaseClient());
  }

  static createPaymentRepository(): IPaymentRepository {
    // TODO: 实现 SupabasePaymentRepository
    throw new Error('Payment repository not yet implemented');
  }

  static createStorageRepository(): IStorageRepository {
    return new MinIOStorageRepository(getMinioClient());
  }
}
```

业务模块通过工厂获取基础仓库，再结合“适配器/装饰器”模式扩展。

---

## 六、配置管理

```typescript
export interface DataLayerConfig {
  adapter: 'supabase'; // 当前只支持 Supabase
  supabase?: { url: string; anonKey: string; serviceKey: string };
  // postgresql?: { host: string; port: number; database: string; user: string; password: string };
  // PostgreSQL 适配器尚未实现，当前只支持 Supabase
  minio: { endPoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string };
}

export const config: DataLayerConfig = {
  adapter: 'supabase', // 默认使用 Supabase，这是推荐的方案
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },
  // PostgreSQL 配置已移除，当前只支持 Supabase
  minio: {
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  },
};
```

**注意**: 当前只支持 Supabase 适配器，`DATA_ADAPTER` 必须设置为 `supabase` 或不设置（默认使用 Supabase）。

---

## 七、服务端口列表

`mxmdata` 通过 Docker Compose 统一管理所有数据服务，以下是各服务的访问端口：

### 7.1 对象存储服务

| 服务 | 端口 | 访问地址 | 说明 |
|------|------|----------|------|
| **MinIO API** | 9000 | `http://localhost:9000` | S3 兼容的对象存储 API |
| **MinIO Console** | 9001 | `http://localhost:9001` | MinIO 管理界面（默认账号：`minioadmin` / `minioadmin`） |

### 7.2 缓存服务

| 服务 | 端口 | 访问地址 | 说明 |
|------|------|----------|------|
| **Redis** | 6379 | `localhost:6379` | 缓存和会话存储（默认无密码，生产环境请设置 `REDIS_PASSWORD`） |

### 7.3 Supabase 服务栈

| 服务 | 端口 | 访问地址 | 说明 |
|------|------|----------|------|
| **PostgreSQL** | 5432 | `localhost:5432` | 数据库服务（用户：`postgres`，密码：`postgres`） |
| **PostgREST** | 3001 | `http://localhost:3001` | REST API 服务（映射到容器内的 3000 端口，避免与 Gateway 冲突） |
| **GoTrue** | 9999 | `http://localhost:9999` | 认证服务 |
| **Realtime** | 4000 | `http://localhost:4000` | 实时订阅服务 |
| **Postgres Meta** | 8080 | `http://localhost:8080` | 元数据管理服务（Supabase Studio 使用） |
| **Kong** | 8000 | `http://localhost:8000` | API 网关（HTTP） |
| **Kong** | 8443 | `https://localhost:8443` | API 网关（HTTPS） |
| **Supabase Studio** | 54323 | `http://localhost:54323` | 图形化管理界面（Dashboard） |

### 7.4 快速访问命令

```bash
# 打开 MinIO Console
pnpm --filter @mxmai/mxmdata minio:open
# 或直接访问: http://localhost:9001

# 打开 Supabase Studio
pnpm --filter @mxmai/mxmdata supabase:open
# 或直接访问: http://localhost:54323

# 测试 Redis 连接
docker exec mxmai-redis redis-cli ping

# 连接 PostgreSQL
psql -h localhost -p 5432 -U postgres -d postgres
```

### 7.5 服务管理

```bash
# 启动所有服务
cd mxmdata
pnpm docker:up

# 查看服务状态
pnpm docker:ps

# 查看服务日志
pnpm docker:logs [service_name]

# 停止所有服务
pnpm docker:down
```

### 7.6 注意事项

1. **端口冲突**：如果端口被占用，可以修改 `docker-compose.yml` 中的端口映射
2. **Supabase Studio**：首次访问可能需要等待服务完全启动（约 30 秒）
3. **Redis 密码**：本地开发默认无密码，生产环境请在 `.env` 中设置 `REDIS_PASSWORD`
4. **PostgreSQL 连接**：使用 Supabase 时，推荐通过 PostgREST (3001) 或 Supabase Studio 访问，而不是直接连接 PostgreSQL

---

## 八、扩展策略与迁移

1. **新增业务模块**：先定义接口（例如 `INotificationRepository`），实现所需适配器，再由业务侧通过工厂引用。
2. **新增数据源**：实现新的 adapter（如 `MongoNotificationRepository`），在工厂中根据配置返回即可。
3. **未来扩展 PostgreSQL 适配器**：如需要直接访问 PostgreSQL，可以实现对应 adapter，但推荐继续使用 Supabase（它基于 PostgreSQL，提供更好的开发体验）。
4. **按模块扩展**：业务可在自身包内提供 `RepositoryFactory` 的包装（如 `AccountRepositoryFactory`），方便注入自定义逻辑。

---

## 九、优势总结

- **完全解耦**：业务与存储实现隔离，可不同模块使用不同后端。
- **高复用**：接口 & adapter 可被多个服务共享。
- **易测试**：可在单测中传入内存实现或 mock adapter。
- **可观测**：所有数据库访问经过统一层，可集中加日志、metrics、熔断。
