# 测试验收计划

## 概述

本计划覆盖 2026-04-27 完成的核心功能验收。

---

## 一、Agent Memory 系统

### 验收目标
- [ ] Memory Recall：对话时自动召回相关历史记忆
- [ ] Memory Store：对话结束后自动存储重要摘要
- [ ] 用户隔离：不同用户的记忆互不影响

### 验收步骤

#### 1.1 Memory Recall 测试
```bash
# 1. 启动服务
pnpm dev:all

# 2. 发送第一条对话（包含用户信息）
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-memory-001" \
  -d '{"message":"我叫李四，喜欢简约风格，做电商主图"}' \
  --no-buffer

# 3. 等待对话完成

# 4. 发送第二条相关对话，验证记忆召回
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-memory-001" \
  -d '{"message":"我刚才说喜欢什么风格？"}' \
  --no-buffer

# 预期：响应中提到"简约风格"和"电商主图"
```

#### 1.2 Memory Store 测试
```bash
# 查询数据库验证记忆已存储
# 连接到 Supabase，执行：
SELECT id, content, metadata->>'memory_type' as type, metadata->>'importance' as importance
FROM knowledge_base_documents
WHERE knowledge_base_name = 'agent_memory'
  AND metadata->>'user_id' = 'test-memory-001'
ORDER BY created_at DESC LIMIT 5;
```

#### 1.3 用户隔离测试
```bash
# 用户 B 的对话（无记忆）
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-memory-002" \
  -d '{"message":"我叫什么名字？"}' \
  --no-buffer

# 预期：用户 B 不会看到用户 A 的记忆
```

---

## 二、Agent Smartflow 集成

### 验收目标
- [ ] 复杂意图自动触发 Smartflow 工作流
- [ ] Smartflow 执行结果正确返回

### 前置条件
需要在 DB 中配置一个带 `smartflow_id` 的业务节点：
```sql
-- 示例：在 prompt_engineering_configs 中添加
UPDATE prompt_engineering_configs
SET extra = jsonb_set(COALESCE(extra, '{}'), '{smartflow_id}', '"your-smartflow-id"')
WHERE scope = 'writing' AND type = 'article' AND subtype IS NULL;
```

### 验收步骤

#### 2.1 SmartflowIntentDetector 检测
```bash
# 验证检测逻辑（无副作用）
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"message":"生成一篇文章并分析数据"}' \
  --no-buffer

# 观察日志：[SmartflowIntentDetector] 检测到复杂意图
```

#### 2.2 SmartflowEngine 执行
```bash
# 触发后检查日志
# 应看到类似：
# [AgentChat] Smartflow execution started: sf_xxx
# [SmartflowEngine] Executing flow...
# [SmartflowEngine] Flow completed successfully
```

---

## 三、业务节点功能

### 3.1 视频生成节点
```bash
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"message":"生成一条15秒的电商短视频"}' \
  --no-buffer

# 预期：识别为 video/generate 节点 → 确认参数 → 执行 → 返回结果
```

### 3.2 声音生成节点
```bash
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"message":"生成一段温柔的女声旁白"}' \
  --no-buffer

# 预期：识别为 audio 相关节点
```

### 3.3 海报设计节点
```bash
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"message":"做一张科技感海报，主题是AI"}' \
  --no-buffer

# 预期：识别为 graph/design 节点
```

---

## 四、图片上传功能

### 验收步骤
```bash
# 1. 通过 Agent Chat 上传图片
# 前端操作：在 Agent Chat 界面拖拽或选择图片

# 2. 验证 R2 上传
# 检查日志：[AgentChat] Image upload successful

# 3. 验证图片在对话中的使用
# 响应应提到"已收到图片"
```

---

## 五、Playwright E2E 测试

### 运行测试
```bash
# 安装浏览器
pnpm playwright:install

# 复制环境配置
cp .env.example tests/.env
# 编辑 tests/.env 配置 BASE_URL

# 运行测试
pnpm test:e2e

# 或 UI 模式（推荐）
pnpm test:e2e:ui
```

### 测试用例
| 用例 | 描述 | 状态 |
|-----|------|------|
| should recall memory | 验证记忆召回 | pending |
| should trigger smartflow | 验证 Smartflow 触发 | pending |

---

## 六、回归测试

### 确保现有功能未受影响
```bash
# 1. 构建验证
pnpm build:mxmcgi
pnpm build:web

# 2. 通用对话（不触发业务节点）
curl -X POST http://localhost:4003/api/v1/agents/message \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"message":"今天天气怎么样？"}' \
  --no-buffer

# 预期：正常对话回复，不触发业务节点
```

---

## 七、问题排查

| 问题 | 可能原因 | 解决方案 |
|-----|---------|---------|
| Memory 未召回 | KB 表未创建 | 运行 `ensureKnowledgeBase()` 或手动创建 |
| Smartflow 未触发 | DB 未配置 smartflow_id | 检查 `prompt_engineering_configs.extra.smartflow_id` |
| 502 Bad Gateway | mxmcgi 未启动 | `pnpm dev:mxmcgi` |
| 编译错误 | TypeScript 类型问题 | `pnpm tsc --noEmit` 检查 |

---

## 验收清单

完成所有验收项后，在下方打勾：

- [ ] Memory Recall 工作正常
- [ ] Memory Store 成功写入 DB
- [ ] 用户隔离验证通过
- [ ] Smartflow 复杂意图检测正常
- [ ] SmartflowEngine 执行正常
- [ ] 视频生成节点工作正常
- [ ] 声音生成节点工作正常
- [ ] 海报设计节点工作正常
- [ ] 图片上传功能正常
- [ ] Playwright 测试通过
- [ ] 回归测试通过
