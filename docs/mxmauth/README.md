# mxmauth - 用户管理业务模块

基于 Express + TypeScript 构建的用户认证和管理服务。

## 功能特性

- ✅ 用户注册/登录
- ✅ JWT Token 管理（Access Token + Refresh Token）
- ✅ 用户信息管理（获取/更新 profile）
- ✅ 用户设置管理（主题、语言、通知）
- ✅ 账户余额和会员信息查询
- ✅ 统一响应格式和错误处理
- ✅ 认证中间件

## 技术栈

- Node.js + TypeScript
- Express.js
- JWT (jsonwebtoken)
- bcrypt
- **@mxmai/mxmdata** (统一数据访问层，不直接操作数据库)

**重要**: mxmauth 模块不直接连接数据库，所有数据库操作都通过 `@mxmai/mxmdata` 数据访问层进行。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入配置：

```bash
# 服务端口
PORT=4001

# CORS 配置
CORS_ORIGIN=http://localhost:3000

# JWT 配置
JWT_SECRET=your-secret-key-change-in-production
JWT_ACCESS_TOKEN_EXPIRES_IN=57600  # Access Token 过期时间（秒），默认16小时 (16 * 3600 = 57600)
JWT_REFRESH_TOKEN_EXPIRES_IN=604800  # Refresh Token 过期时间（秒），默认7天

# 密码加密配置
BCRYPT_ROUNDS=10
```

**重要**: 
- mxauth **不直接连接数据库**，所有数据库操作都通过 `@mxmai/mxmdata` 数据访问层
- 数据库配置必须在 `mxmdata/.env` 文件中配置（参考 `mxmdata/.env.example`）
- 数据库表结构定义在 `mxmdata/src/database/schemas/mxmauth.sql`，mxmauth 只提供业务逻辑

### 3. 启动服务

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

服务将在 `http://localhost:4001` 启动。

## API 接口

**基础路径**: `/api/v1/account`

### 用户注册

```http
POST /api/v1/account/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "phone": "13800138000",
  "password": "password123"
}
```

**响应**:
```json
{
  "code": 201,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "username": "testuser",
      "email": "test@example.com",
      "avatar_url": null,
      "level": 1,
      "balance": 0,
      "membership_type": "free",
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "jwt-token",
      "expiresIn": 3600
    }
  }
}
```

### 用户登录

```http
POST /api/v1/account/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

或使用邮箱/手机号：

```json
{
  "email": "test@example.com",
  "password": "password123"
}
```

### 刷新 Token

```http
POST /api/v1/account/refresh-token
Content-Type: application/json

{
  "refresh_token": "refresh-token-here"
}
```

### 获取用户信息

```http
GET /api/v1/account/profile
Authorization: Bearer <access_token>
```

### 更新用户信息

```http
PUT /api/v1/account/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "username": "newusername",
  "email": "newemail@example.com",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

### 获取用户设置

```http
GET /api/v1/account/settings
Authorization: Bearer <access_token>
```

### 更新用户设置

```http
PUT /api/v1/account/settings
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "theme": "dark",
  "language": "en",
  "notifications_enabled": true
}
```

### 获取账户余额

```http
GET /api/v1/account/balance
Authorization: Bearer <access_token>
```

### 获取会员信息

```http
GET /api/v1/account/membership
Authorization: Bearer <access_token>
```

## 项目结构

```
mxmauth/
├── src/
│   ├── auth/              # 认证相关
│   │   ├── jwt.ts        # JWT Token 生成和验证
│   │   └── password.ts   # 密码加密和验证
│   ├── middleware/        # 中间件
│   │   ├── auth.ts       # 认证中间件
│   │   ├── errorHandler.ts # 错误处理
│   │   └── response.ts   # 响应格式化
│   ├── routes/           # 路由
│   │   ├── account.ts    # 账户相关路由
│   │   └── health.ts     # 健康检查
│   └── index.ts          # 入口文件
├── .env.example          # 环境变量示例
└── package.json
```

## 开发

### 运行开发服务器

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

### 运行测试

```bash
pnpm test
```

## 依赖关系

- **@mxmai/mxmdata**: 数据访问层，提供统一的 Repository 接口
- 需要配置 `mxmdata/.env` 文件以连接数据库

## 详细设计

参见 [MXMAUTH.md](../MXMAUTH.md)

