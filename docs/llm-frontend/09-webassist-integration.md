# 09 · webassist 项目集成方案

> 本篇把 `llm-frontend` 文档集的通用方法论**落地到本项目 webassist**。基于现有 `架构.md` 和 `backend_new/app/loop/motor/`，**不推倒重做**，而是**渐进式升级**。

## 现状评估

### 已经做到的 ✅

| 6 层 | 现状 | 评价 |
|------|------|------|
| 1. Route Manifest | 路由集中在 `dashborad/src/App.tsx` + `Layout.tsx`，但**没有 manifest 文件** | 部分有 |
| 2. Action Manifest | `backend_new/app/loop/motor/act.py` 有 `act.kind` 多类型（execute/observe/validate/...），但**没有显式 Action Registry** | 雏形 |
| 3. Data Contract | `backend_new/app/loop/contracts.py` + Zod schema 在前端 `action-spec/parse.ts` 等 | 分散 |
| 4. Runtime Guard | `motor/judge.py` 有限，但**没有完整的 7 步流程** | 缺失 |
| 5. State Sync | `motor/history.py` 有轨迹记录，但**没有 LLM ↔ UI 双向同步** | 后端有 |
| 6. Renderer | Popup / Dashboard 都是手写组件，**没有 LLM 驱动的 Renderer** | 缺失 |

### 已有的核心能力

- ✅ **intention → plan → act 主循环**（`架构.md` 已定）
- ✅ **多 act 类型**（observe / execute / validate / summary / navigate / kb / request / followup / code / interactive）
- ✅ **JSON 契约**（contracts.py + 前端 zod parse）
- ✅ **轨迹学习**（`trajectory_promote.py`）
- ✅ **Page Agent**（浏览器端动作执行）

### 缺的关键能力

- ❌ **统一的 Action Manifest**（schema 分散在多处）
- ❌ **well-known 端点**（外部 agent 无法发现能力）
- ❌ **完整 Runtime Guard**（7 步流程）
- ❌ **HITL 标准化**（前端零散）
- ❌ **Result Manifest + Renderer**（LLM 输出解析）
- ❌ **审计 / 限速**（仅靠后端日志）

## 集成目标

把 webassist 从"内部用 LLM 编排"升级到"对外部 agent 也开放能力"：

```
之前:
  Plugin (Popup) ──→ backend_new (motor: intention→plan→act) ──→ LLM
  Dashboard ──→ 业务 API（无 LLM 编排）

之后:
  Plugin (Popup) ──→ backend_new ──→ LLM
  Dashboard    ──→ backend_new ──→ LLM  ← 新增
  外部 Agent   ──→ /.well-known/ai-manifest.json  ← 新增
                  ──→ /api/agent/dispatch  ← 新增（AG-UI 协议）
                  ──→ action 强制走 Runtime Guard
```

## 渐进式改造路线（4 个阶段，~ 6 周）

### 阶段 0：建立 Action Registry（第 1-2 周）

**目标**：把所有分散的 act 抽成统一的 Action Registry（manifest 形式）。

**新增**：
```
backend_new/app/manifest/
├── __init__.py
├── actions/
│   ├── __init__.py
│   ├── kb.py           # kb.* 域
│   ├── runs.py         # runs.* 域
│   ├── feedback.py     # feedback.* 域
│   ├── page.py         # page-agent 用：observe / execute / validate / ...
│   └── _shared.py      # 共享 schema
├── contracts.py        # Run / KnowledgeNode / ActionError 等
├── registry.py         # ActionRegistry 聚合
├── runtime.py          # 7 步 Runtime Guard
├── risk.py             # 风险等级 + 策略表
├── audit.py            # 审计日志
└── wellknown.py        # /.well-known/ai-manifest.json 端点
```

**Action 例子（page 域的 act）**：
```python
# backend_new/app/manifest/actions/page.py
from app.manifest.contracts import ActionManifest, RiskLevel, SideEffects

OBSERVE_ACT = ActionManifest(
    id="page.observe",
    version="1.0.0",
    name="观察页面",
    description="按指定模式抓取页面信息。",
    when_to_use="""
    调用的场景：
    - Plan 需要更多页面数据时
    - evidence 不足时
    
    不调用：
    - 当前 evidence 足够时
    """,
    input_schema={
        "type": "object",
        "properties": {
            "host": {"type": "string"},
            "layers": {
                "type": "array",
                "items": {"enum": ["text", "structure", "formSchema", "interactables", "screenshot"]}
            },
            "selector": {"type": "string"}
        },
        "required": ["layers"]
    },
    output_schema={...},
    risk=RiskLevel.LOW,
    requires_approval=False,
    side_effects=SideEffects(data_writes=False),
    execute=page_observe_execute,  # 实际实现
)

EXECUTE_ACT = ActionManifest(
    id="page.execute",
    version="1.0.0",
    name="执行页面操作",
    description="点击 / 填写 / 提交页面元素。",
    when_to_use="plan 已经确认要执行，且 elementId 在 evidence 中。",
    input_schema={
        "type": "object",
        "properties": {
            "host": {"type": "string"},
            "actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"enum": ["click", "fill", "select", "check", "submit"]},
                        "elementId": {"type": "string"},
                        "value": {"type": "string"}
                    },
                    "required": ["type", "elementId"]
                }
            }
        },
        "required": ["actions"]
    },
    risk=RiskLevel.MEDIUM,  # execute 是写操作
    requires_approval=False,  # plan 自身已经审过
    side_effects=SideEffects(data_writes=True, external_messages=False),
    idempotency_key=lambda args: f"page.execute:{args['host']}:{hash(str(args['actions']))}",
    execute=page_execute_execute,
)
```

**做这件事的关键点**：
- **不要一次性把所有 act 抽完**——先抽 5-10 个最常用的（page.observe / page.execute / kb.node.create / runs.list / feedback.list）
- 其他 act 保留原样，**渐进迁移**
- Action Manifest 必须是**单一来源**——`motor/act.py` 改成读 manifest 而不是 hardcode kind

**验证标准**：
- [ ] `ActionRegistry` 聚合 10+ action
- [ ] 暴露 `GET /api/manifest` 返回所有 manifest 的精简版（不含 execute）
- [ ] 暴露 `GET /.well-known/ai-manifest.json`（RFC 8615 风格）

### 阶段 1：Runtime Guard 落地（第 2-3 周）

**目标**：所有 action 执行走 7 步 Runtime Guard。

```python
# backend_new/app/manifest/runtime.py
from app.manifest.registry import ActionRegistry
from app.manifest.audit import AuditLog
from app.manifest.idempotency import IdempotencyStore
from app.manifest.errors import ActionError, ErrorCode

class ActionRuntime:
    def __init__(self, db, redis, audit: AuditLog, idem: IdempotencyStore):
        self.db = db
        self.redis = redis
        self.audit = audit
        self.idem = idem

    async def execute(
        self,
        action_id: str,
        args: dict,
        ctx: ActionContext,
    ) -> Any:
        def_ = ActionRegistry.get(action_id)
        if not def_:
            raise ActionError(ErrorCode.NOT_FOUND, f"Unknown action: {action_id}")

        # 1. 校验
        validated = def_.validate_input(args)

        # 2. 授权
        await self._check_permission(def_, ctx)

        # 3. 风险 + 准备
        if def_.risk in (RiskLevel.HIGH, RiskLevel.CRITICAL) or def_.requires_approval:
            proposal = await def_.execute(validated, {**ctx, "dry_run": True})
            if not await ctx.request_approval(
                action=action_id,
                args=validated,
                preview=proposal,
                risk=def_.risk,
            ):
                raise ActionError(ErrorCode.FORBIDDEN, "User declined")

        # 4. 幂等
        if def_.idempotency_key:
            key = def_.idempotency_key(validated)
            cached = await self.idem.get(key)
            if cached is not None:
                return cached
            await self.idem.set_in_progress(key)

        # 5. 真实执行
        try:
            result = await def_.execute(validated, ctx)

            # 6. 审计
            await self.audit.log({
                "action": action_id,
                "args": validated,
                "result": result,
                "user": ctx.user.id,
                "trace_id": ctx.trace_id,
                "timestamp": datetime.utcnow().isoformat(),
            })

            # 7. 缓存
            if def_.idempotency_key:
                await self.idem.set(def_.idempotency_key(validated), result)
            return result

        except Exception as e:
            await self.audit.log_error({...})
            raise
```

**关键点**：
- **不要破坏现有调用**——把 `Runtime.execute` 当成"现在的函数 + 一层包装"
- motor 的 `act.py` 改成调 `runtime.execute(action_id, args, ctx)`，**不直接调业务函数**
- HITL 暂时可以用 `request_approval=ctx.user.always_yes`（永远通过）做兼容

**验证标准**：
- [ ] 现有烟测全部通过
- [ ] 审计表有完整记录
- [ ] 重复请求走幂等
- [ ] 高风险 action 强制走准备流程

### 阶段 2：前端 Renderer + HITL UI（第 3-4 周）

**目标**：前端 popup / Dashboard 能渲染 Result Manifest + 显示 HITL。

**新增**：
```
src/manifest/  (前端)
├── actions/        # 镜像后端 manifest（zod 版）
├── runtime.ts      # runtime 浏览器端版本
├── renderer.tsx    # React Renderer
├── schemas/result.ts  # Result Manifest schema
└── components/
    ├── ConfirmCard.tsx
    ├── ResultRenderer.tsx
    └── ...
```

**Renderer 设计**：
```tsx
// src/manifest/renderer.tsx
import { ResultManifest } from './schemas/result'
import { Card, Text, Alert, DataTable, ConfirmCard, Stack } from '@/components'

export function ResultRenderer({ manifest, depth = 0 }: { manifest: unknown; depth?: number }) {
  if (depth > 10) throw new Error('Too deep')
  const m = ResultManifest.parse(manifest)

  switch (m.type) {
    case 'text': return <Text>{m.content}</Text>
    case 'card': return <Card title={m.title}>...</Card>
    case 'alert': return <Alert variant={m.variant}>{m.message}</Alert>
    case 'table': return <DataTable columns={m.columns} rows={m.rows} />
    case 'confirm': return <ConfirmCard manifest={m} />
    // ...
  }
}
```

**HITL UI 例子**：
```tsx
// src/manifest/components/ConfirmCard.tsx
export function ConfirmCard({ manifest }: { manifest: ConfirmManifest }) {
  const { requestApproval } = useActionContext()

  return (
    <Card variant="warning">
      <Group>
        <Badge color="red">HIGH RISK</Badge>
        <Text weight="bold">{manifest.title}</Text>
      </Group>
      <Text size="sm" c="dimmed">{manifest.description}</Text>
      <Divider />
      <Text size="xs" c="dimmed">预览：</Text>
      <Code block>{JSON.stringify(manifest.preview, null, 2)}</Code>
      <Group>
        <Button color="accent" onClick={async () => {
          await requestApproval(manifest.actionName, manifest.actionArgs, true)
        }}>确认执行</Button>
        <Button variant="default" onClick={async () => {
          await requestApproval(manifest.actionName, manifest.actionArgs, false)
        }}>取消</Button>
      </Group>
    </Card>
  )
}
```

**验证标准**：
- [ ] Popup 能渲染 LLM 输出的 Result Manifest
- [ ] Dashboard 关键 action 触发 ConfirmCard
- [ ] 取消能正确中断后续 plan

### 阶段 3：暴露 AG-UI / MCP 端点（第 4-6 周）

**目标**：外部 agent（CopilotKit / Claude）能直接调用 webassist 的 action。

**新增端点**：
```
GET  /.well-known/ai-manifest.json      # 能力发现
GET  /api/manifest                      # 完整 Action Manifest
POST /api/agent/dispatch                # AG-UI 协议端点（SSE）
POST /api/agent/mcp                     # MCP 协议端点
```

**well-known 例子**：
```python
# backend_new/app/manifest/wellknown.py
@router.get("/.well-known/ai-manifest.json")
async def ai_manifest():
    return {
        "schema_version": "1.0",
        "name": "WebAssist",
        "description": "浏览器智能助手",
        "agent_endpoint": "/api/agent/dispatch",
        "mcp_endpoint": "/api/agent/mcp",
        "auth": {"type": "bearer"},
        "capabilities": [
            {
                "id": a.id,
                "name": a.name,
                "description": a.description,
                "input_schema": a.input_schema_json(),
                "risk": a.risk.value,
            }
            for a in ActionRegistry.list_active()
        ]
    }
```

**AG-UI 端点**：
```python
# backend_new/app/manifest/agui.py
from ag_ui_langgraph import add_langgraph_fastapi_endpoint
# 或者自实现 SSE 路由

@router.post("/api/agent/dispatch")
async def dispatch(request: Request):
    """AG-UI 协议：SSE 流式返回事件"""
    # 接收 AG-UI 事件
    # 走 motor 的 intention → plan → act
    # 实时 emit 事件
    return EventSourceResponse(event_generator())
```

**验证标准**：
- [ ] CopilotKit 客户端能连接到 webassist
- [ ] Claude（带 MCP）能调用 webassist 的 action
- [ ] 外部客户端能完成"用户说" → 走完整个 loop → 返回结果

## 立即可做的最小步骤

如果你**今天就动手**，建议从这一步开始：

```bash
# 1. 新建 manifest 目录
mkdir -p backend_new/app/manifest/actions

# 2. 抽 3 个最常用的 action 到 manifest 形式
# backend_new/app/manifest/actions/page.py  - observe, execute
# backend_new/app/manifest/actions/kb.py    - kb.node.create, kb.node.list
# backend_new/app/manifest/actions/runs.py  - runs.list, runs.delete

# 3. 写 ActionRegistry
# backend_new/app/manifest/registry.py

# 4. 写 wellknown 端点
# backend_new/app/manifest/wellknown.py
# 加一个 GET /.well-known/ai-manifest.json 路由

# 5. 在 main.py 注册
# app.include_router(manifest_router)
```

**这是 1-2 天能完成的事**，完成后你立刻有：
- ✅ 应用对外"能力声明"
- ✅ 外部 agent 可以发现你
- ✅ Runtime 入口统一

后面 3 个阶段（Runtime Guard、Renderer、AG-UI 端点）都是**基于这层 manifest 的扩展**。

## 不要做的 5 件事

升级过程中要避免的反模式：

1. ❌ **不要推倒 motor 重做**——现有 intention/plan/act 是好的，**升级它，不是替换它**
2. ❌ **不要一次抽完所有 action**——先抽 5-10 个，验证流程 OK 再继续
3. ❌ **不要让 LLM 自由拼 URL / 调 API**——所有出口走 manifest
4. ❌ **不要忘记 dryRun**——所有 high/critical action 必须有
5. ❌ **不要在前端 hardcode 业务逻辑**——前端只做 renderer，业务在 action.execute 里

## 与现有架构的对接

### motor/plan.py 怎么改

```python
# 之前：
def make_plan(evidence, intention):
    return [
        {"kind": "observe", "args": {...}},
        {"kind": "execute", "args": {...}},
    ]

# 之后：
def make_plan(evidence, intention):
    return [
        {"action": "page.observe", "args": {...}},   # ← 改用 action id
        {"action": "page.execute", "args": {...}},
    ]
```

### motor/act.py 怎么改

```python
# 之前：
async def execute_act(step):
    if step.kind == "execute":
        await do_execute(step.args)
    elif step.kind == "observe":
        await do_observe(step.args)
    # ...

# 之后：
async def execute_act(step, ctx):
    await runtime.execute(step.action, step.args, ctx)
    # 业务分发在 ActionRegistry 里
```

### intention/plan 输出对齐 key 的 json

`架构.md` 里提到"intention/plan/act 全流程输出对齐 key 的 json"——这正是 manifest 化的初衷。建议：

```python
# 整个 motor 共享一套 schema
from app.manifest.contracts import PlanStep, PlanOutput

def make_plan(evidence, intention) -> PlanOutput:
    return PlanOutput(steps=[
        PlanStep(action="page.observe", args={...}, expected_outcome="..."),
        PlanStep(action="page.execute", args={...}, expected_outcome="..."),
    ])
```

## 验证：跑通 3 个最小场景

升级完后，至少能跑通：

### 场景 1：用户说"查最近 5 条 run"
```
1. LLM 调 runs.list
2. runtime.execute 走 7 步
3. Result Manifest 输出 table
4. Renderer 渲染 <DataTable>
```

### 场景 2：用户说"删掉刚才那条错误 run"
```
1. LLM 调 runs.delete
2. runtime 检测 high risk → 准备
3. UI 弹 ConfirmCard
4. 用户确认 → 真删
5. Result Manifest 输出 alert success
```

### 场景 3：外部 agent 接入
```
1. 外部 agent 读 /.well-known/ai-manifest.json
2. 知道有 runs.list / runs.delete
3. 通过 AG-UI 协议调用
4. 走完整 loop
```

跑通这 3 个，改造就**算初步成功**。

## 时间表

| 阶段 | 工期 | 收益 |
|------|------|------|
| 0. Action Registry | 1-2 周 | 能力声明 + well-known |
| 1. Runtime Guard | 1 周 | 统一拦截 + 审计 |
| 2. Renderer + HITL | 1-2 周 | 标准化 UI |
| 3. AG-UI / MCP | 1-2 周 | 外部 agent 可接 |

**总投入**：~ 5-7 周（1 后端 + 1 前端）
**回报**：从"内部 LLM 工具"升级为"AI 原生应用平台"

## 下一步

- 想看 Action Manifest 完整字段定义 → [SPEC-action-manifest-v1.md](./SPEC-action-manifest-v1.md)
- 想看 6 层架构 → [02-architecture.md](./02-architecture.md)
- 想直接看代码 → [05-react-vue-impl.md](./05-react-vue-impl.md)
- 想用现成框架 → [08-tooling-ecosystem.md](./08-tooling-ecosystem.md)

---

### 相关仓库文件

- `架构.md` — 项目自身的 intention/plan/act 核心循环
- `backend_new/app/loop/motor/` — 现有 motor 实现
- `backend_new/app/learning/trajectory_promote.py` — 轨迹学习
- `src/services/page-agent/` — 浏览器端动作执行
