# mxmauth - 用户管理业务模块

## 一、核心功能

- 用户注册/登录
- 用户信息管理
- 用户设置（主题、语言）
- 用户等级/会员管理
- 账户安全

---

## 二、数据库表设计

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  membership_type VARCHAR(20) DEFAULT 'free', -- free, pro, premium
  membership_expires_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, banned
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户设置表
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(10) DEFAULT 'system', -- light, dark, system
  language VARCHAR(10) DEFAULT 'zh', -- zh, en
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户会话表
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_info JSONB,
  ip_address VARCHAR(45),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 三、API 接口规范

**基础路径**: `/api/v1/account`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/register` | 用户注册 | ❌ |
| POST | `/login` | 用户登录 | ❌ |
| POST | `/logout` | 用户登出 | ✅ |
| POST | `/refresh-token` | 刷新Token | ❌ |
| GET | `/profile` | 获取用户信息 | ✅ |
| PUT | `/profile` | 更新用户信息 | ✅ |
| GET | `/settings` | 获取用户设置 | ✅ |
| PUT | `/settings` | 更新用户设置 | ✅ |
| GET | `/balance` | 获取账户余额 | ✅ |
| GET | `/membership` | 获取会员信息 | ✅ |

### 请求/响应示例

```typescript
// POST /api/v1/account/register
Request: {
  username: string;
  email?: string;
  phone?: string;
  password: string;
  verification_code?: string; // 手机/邮箱验证码
}

Response: {
  code: 200;
  data: {
    user: {
      id: string;
      username: string;
      email?: string;
      avatar_url?: string;
    };
    tokens: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
  };
}

// GET /api/v1/account/profile
Response: {
  code: 200;
  data: {
    id: string;
    username: string;
    email?: string;
    phone?: string;
    avatar_url?: string;
    level: number;
    balance: number;
    membership_type: 'free' | 'pro' | 'premium';
    membership_expires_at?: string;
    created_at: string;
  };
}

// PUT /api/v1/account/settings
Request: {
  theme?: 'light' | 'dark' | 'system';
  language?: 'zh' | 'en';
  notifications_enabled?: boolean;
}
```

---

## 四、异步任务通知

当用户相关操作需要异步处理时（如邮箱验证、密码重置等），通过消息队列发送通知事件：

```typescript
// 邮箱验证成功
{
  event_type: 'async_task.status_changed',
  module_type: 'mxmauth',
  task_id: 'auth-task-789',
  user_id: 'user-123',
  task_status: 'completed',
  task_status_message: '邮箱验证成功',
  metadata: {
    auth_type: 'email_verification',
    email: 'user@example.com',
  },
  notification_config: {
    send_push: true,
  }
}
```

详细通知机制参见 [MXMNOTIFY.md](./MXMNOTIFY.md)

