# E2E Tests

## Setup

```bash
# Install Playwright browsers
pnpm playwright:install

# Copy env and configure
cp .env.example tests/.env
# Edit tests/.env with your settings
```

## Run Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run with UI mode (交互式)
pnpm test:e2e:ui

# Run headed (可以看到浏览器)
pnpm test:e2e:headed
```

## Test Structure

```
tests/
├── e2e/
│   ├── agent-chat.spec.ts   # Agent Chat 功能测试
│   ├── global-setup.ts     # 全局 setup（登录等）
│   └── .env                # 测试环境变量
└── tsconfig.json
```

## Notes

- Smartflow 测试需要 DB 中配置了 `smartflow_id` 的业务节点
- Memory 测试需要正确配置的知识库连接
- 首次运行会自动启动开发服务器（webServer 配置）
