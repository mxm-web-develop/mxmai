# Smartflow 业务节点重新设计分析

## 一、现状问题

### 当前 modelExecutor 的问题

当前 `modelExecutor.ts` 通过 `mxmCGIHttpClient` 调用 mxmcgi 服务，但**路径完全不匹配真实业务路由**：

| modelExecutor 调用路径 | 真实 mxmcgi 路由 | 状态 |
|----------------------|-----------------|------|
| `POST /cgi/text/${model}` | `POST /writing/completion/:modelName` | ❌ 路径错误 |
| `POST /cgi/image/${model}` | `POST /graph/:modelName` | ❌ 路径错误 |
| `POST /cgi/embedding/${model}` | `POST /knowledge/embedding` | ❌ 路径错误 |
| video | `POST /video/generate` | ❌ 未实现 |
| sound/audio | `POST /audio` | ❌ 未实现 |

**结果**：business 节点根本无法正常工作。

---

## 二、设计方案

### 方案：统一 business 节点

将所有 mxmcgi 业务能力统一封装为一个 `business` 节点类型，通过 `service` 字段区分业务类型：

```typescript
// 节点定义
interface BusinessNode {
  type: 'business';
  service: 'writing' | 'graph' | 'video' | 'audio' | 'character' | 'knowledge';
  action: string;           // 具体动作，如 'completion' | 'outline' | 'generate'
  params: Record<string, any>; // 业务参数
  model?: string;           // 可选，指定模型
}
```

### 业务路由映射表

| service | action | mxmcgi 路由 | 说明 |
|---------|--------|------------|------|
| `writing` | `completion` | `POST /writing/completion/:modelName` | 写作补全 |
| `writing` | `outline` | `POST /writing/outline` | 大纲生成 |
| `writing` | `generate` | `POST /writing/generate` | 完整文章生成 |
| `writing` | `suno_lyrics` | `POST /writing/suno/lyrics` | Suno歌词 |
| `graph` | `photograph` | `POST /graph/photograph` | 摄影图片 |
| `graph` | `design` | `POST /graph/design` | 设计图片 |
| `graph` | `painting` | `POST /graph/painting` | 绘画图片 |
| `graph` | `image` | `POST /graph/:modelName` | 通用图片生成 |
| `video` | `generate` | `POST /video/generate` | 视频生成 |
| `audio` | `tts` | `POST /audio` | TTS语音 |
| `character` | `chat` | `POST /api/v1/characters/chat` | 角色对话 |
| `knowledge` | `search` | `POST /knowledge/search` | 知识库搜索 |

---

## 三、httpClient 需要新增的方法

```typescript
// 新增 businessHttpClient 方法
async writingCompletion(model: string, params: {
  prompt?: string;
  title?: string;
  content?: string;
}): Promise<any>

async writingOutline(params: { title: string; type?: string }): Promise<any>

async graphPhotograph(params: { prompt: string; style?: string }): Promise<any>

async videoGenerate(params: {
  prompt: string;
  duration?: number;
  model?: string;
}): Promise<any>

async audioTTS(params: {
  text: string;
  voice?: string;
  speed?: number;
}): Promise<any>
```

---

## 四、前端节点配置

每个 business 节点前端需要根据 `service` 显示不同表单：

- `writing` → 显示 action 下拉 + 写作参数表单
- `graph` → 显示图片类型 + prompt 表单
- `video` → 显示视频参数表单
- `audio` → 显示语音参数表单
- `character` → 显示角色选择 + 对话表单
- `knowledge` → 显示知识库选择 + 搜索表单

---

## 五、需开发内容

### 后端
1. **重写 businessExecutor** — 接入真实 mxmcgi 路由
2. **扩展 mxmCGIHttpClient** — 新增所有业务方法
3. **完善 video/sound 实现** — 接入 `/video` `/audio` 路由

### 前端
1. **business 节点表单** — 按 service 显示不同配置界面
2. **service 选择器** — 下拉选择业务类型
3. **action 参数映射** — 根据 action 显示对应参数

### 测试
1. 各 service → action 组合的端到端测试
2. test/run 模式区分（完整打印 vs 精简打印）
