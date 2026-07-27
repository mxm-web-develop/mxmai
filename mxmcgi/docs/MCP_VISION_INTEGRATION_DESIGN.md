# MiniMax MCP Vision 集成设计方案

## 问题背景

MiniMax M2.7 虽然是多模态模型，但 **Token Plan 的视觉能力不通过标准 Chat Completion API 提供**，而是通过独立的 MCP 工具服务暴露。

| 通道 | 端点 | 视觉支持 |
|------|------|----------|
| MaxplanProvider | `/v1/text/chatcompletion_v2` | ❌ 纯文本 |
| Token Plan MCP | `understand_image` 工具 | ✅ 图像分析 |
| DeerAPI | Gemini vision 模型 | ✅ 图像分析（需用户授权）|

## 技术架构

```
SuperMXMai
    │
    ├── MaxplanProvider (文本生成 - /v1/text/chatcompletion_v2)
    │
    └── McpVisionProvider [NEW] (图像分析 - MCP 工具调用)
            │
            └── mcporter daemon → MiniMax MCP Server
                    │
                    ├── understand_image (图像理解)
                    └── web_search (网页搜索)
```

### mcporter daemon 已存在

你的机器上 `mcporter daemon` 已在运行：
```
Daemon pid 39151 — socket: /Users/mxm_pro/.mcporter/daemon/daemon-09f1ebb3eae5.sock
- MiniMax: connected (2 tools)
```

## 集成方案

### 方案选择：HTTP API + mcporter 作为 Gateway

不直接在 Node.js 里调用 MCP stdio，而是让 mcporter 充当 HTTP→MCP 的网关：

1. mcporter daemon 已监听 Unix socket
2. 创建一个轻量 HTTP wrapper（可选）或直接用 mcporter CLI 调用
3. 新增 `McpVisionProvider` 通过子进程调用 mcporter

**优点**：解耦、不增加主进程复杂度
**缺点**：每次调用要 fork 进程（但 mcporter 很快）

### 文件变更

```
mxmcgi/src/models/
├── mcp/
│   ├── mod.ts                    [NEW] MCP 模块导出
│   ├── vision-provider.ts         [NEW] McpVisionProvider
│   ├── types.ts                   [NEW] MCP 相关类型定义
│   └── mcporter-client.ts         [NEW] mcporter CLI 调用封装

# 注册新 Provider
mxmcgi/src/core/providers/index.ts
    - 添加 'mcp' 到 VALID_PROVIDERS
    - 添加 mcp provider initializer

# DB 模型注册（Admin 操作）
INSERT INTO provider_models (provider, scope, model_key, upstream_model, enabled, ...)
VALUES ('mcp', 'graph', 'minimax-vision', 'minimax-vision', true, ...);
```

### McpVisionProvider 接口设计

```typescript
// mxmcgi/src/models/mcp/vision-provider.ts
export class McpVisionProvider implements ModelProvider {
  readonly provider: ProviderType = 'mcp';
  readonly name = 'McpVision';

  constructor(
    private readonly injectApiKey?: string,
    private readonly injectMcpServer?: string  // e.g., 'MiniMax'
  ) {}

  supportsModel(modelName: string): boolean {
    return modelName === 'minimax-vision';
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    // 从 params 提取 imageUrl 和 prompt
    // 调用 mcporter call MiniMax.understand_image
    // 解析结果并返回
  }
}
```

### GenerateParams 扩展

现有 `GenerateParams` 的 `prompt` 字段用于文本 prompt，图像通过 `parameters.imageUrl` 传入：

```typescript
// 调用示例
await mcporter.call('MiniMax.understand_image',
  prompt: "描述这张图片的内容",
  image_source: "https://example.com/image.jpg"
);
```

### 返回格式

```typescript
{
  mediaUrls: [analysisText],  // 图像分析结果文本
  metadata: {
    provider: 'mcp',
    model: 'minimax-vision',
    upstreamModel: 'MiniMax.understand_image',
    raw: { /* mcporter 原始输出 */ }
  }
}
```

## 路由配置

在 `provider_models` 表中注册：

| provider | scope | model_key | upstream_model | 说明 |
|----------|-------|-----------|----------------|------|
| mcp | graph | minimax-vision | minimax-vision | MiniMax MCP 图像理解 |

调用路径：
```
POST /api/v1/graph/minimax-vision
  → McpVisionProvider.generate('minimax-vision', params)
    → mcporter call MiniMax.understand_image
      → MCP Server
```

## 实施步骤

### Phase 1: 基础集成（本文档范围）

1. [x] 确认 mcporter daemon 和 MiniMax MCP 已配置并可用
2. [ ] 创建 `mxmcgi/src/models/mcp/` 目录
3. [ ] 编写 `vision-provider.ts`
4. [ ] 编写 `mcporter-client.ts`（子进程调用封装）
5. [ ] 在 ProviderFactory 注册 `mcp` provider
6. [ ] 编写单测验证 mcporter CLI 调用

### Phase 2: DB 集成

7. [ ] 在 `mxmcgi/src/models/provider-model-catalog.ts` 添加 'mcp' 到 VALID_PROVIDERS
8. [ ] Admin 在 provider_models 表注册 minimax-vision 模型
9. [ ] 集成测试

### Phase 3: API 暴露

10. [ ] 在 graph routes 暴露 `/graph/minimax-vision` 端点（复用现有 graph 路由机制）
11. [ ] 文档更新

## 关键约束

1. **DeerAPI 调用必须询问用户授权**（你设定的规则）
2. **mcporter daemon 必须在运行**（用户本地已确认）
3. **MiniMax MCP 配置**在 `~/.claude/settings.json`（已确认有效）
4. **不修改现有 MaxplanProvider**，保持文本和视觉分离

## 备选方案

如果不想 fork 进程，可以写一个简单的 HTTP MCP proxy：
```bash
# mcporter 支持 HTTP server 模式
mcporter serve --http :3000
# 然后 Node.js 直接 fetch
```

但这需要额外服务管理，暂不推荐。

## 验证命令

集成后可用以下命令验证：

```bash
# 手动测试 MCP 调用
npx mcporter call MiniMax.understand_image \
  prompt="描述图片" \
  image_source="https://httpbin.org/image/jpeg"

# 检查 daemon 状态
npx mcporter daemon status
```
