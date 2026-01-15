# Graph业务接口实现线路说明

## 实现流程

```
用户请求 
  ↓
路由层 (graph.ts)
  ├─ 接收业务参数 (type, prompt, style, tone等)
  ├─ 验证参数
  └─ 创建graph类型task
      ↓
任务执行层 (graph-task.ts)
  ├─ 解析task参数
  ├─ 提取graphType和业务参数
  └─ 调用graph-service
      ↓
服务层 (graph-service.ts)
  ├─ generateGraphPrompt()
  │   ├─ 提取业务参数 (根据type动态提取)
  │   ├─ 获取graphconfigs的rules
  │   ├─ 构建提示词生成请求
  │   └─ 调用大模型生成最终提示词
  │
  └─ generateGraphImage()
      ├─ 根据quality选择模型
      │   ├─ quality='high' → nano-banana
      │   └─ quality='fast' → seedream-4
      ├─ 处理参考图参数
      └─ 调用图片生成模型
          ↓
返回结果
  ├─ 生成的提示词
  └─ 图片URLs
```

## 核心组件说明

### 1. 路由层 (`routes/graph.ts`)

**职责：**
- 接收HTTP请求
- 验证必需参数（type, prompt）
- 验证type是否在支持的列表中
- 创建graph类型的task
- 异步执行任务

**三个接口：**
- `POST /graph/photograph` - 摄影接口
- `POST /graph/design` - 设计接口
- `POST /graph/painting` - 绘画接口

**参数结构：**
```typescript
{
  type: 'portrait' | 'landscape' | ...,
  prompt: string,
  // 业务参数（根据type不同而不同）
  style?: string,
  tone?: string,
  // ...
  quality?: 'high' | 'fast',
  aspect_ratio?: string,
  referenceImage?: string | string[]
}
```

### 2. 任务执行层 (`graph-task.ts`)

**职责：**
- 从task中解析参数
- 提取graphType和业务参数
- 调用graph-service执行生成
- 更新task状态和结果

**参数解析：**
```typescript
// requestParams结构：
{
  taskType: 'generate',
  graphType: 'photograph' | 'design' | 'painting',
  userId?: string,
  provider?: string,
  ...业务参数 (type, prompt, style, tone等)
}
```

### 3. 服务层 (`graph-service.ts`)

#### 3.1 提示词生成 (`generateGraphPrompt`)

**流程：**
1. 提取业务参数（根据type动态提取相关参数）
2. 获取graphconfigs的rules（根据graphType和type）
3. 构建提示词生成请求：
   - graphconfigs的rules（系统提示词）
   - 业务参数描述
   - 用户prompt
4. 调用大模型生成最终提示词

**知识库处理（后续实现）：**
- 当前：暂时不实现，knowledgeContext为空
- 后续：根据业务参数（如style、tone等）自动从系统知识库召回相关内容

#### 3.2 图片生成 (`generateGraphImage`)

**流程：**
1. 根据quality选择模型：
   - `quality='high'` → `nano-banana`（通过deerapi）
   - `quality='fast'` → `seedream-4`（通过deerapi）
2. 处理参考图：
   - nano-banana: 使用`image`（单张）或`image_urls`（多张）
   - seedream-4: 使用`image_input`数组
3. 调用图片生成模型
4. 返回图片URLs

### 4. 配置系统 (`graphconfigs/`)

**职责：**
- 为每个graph类型提供提示词生成规则
- 根据小类型（type）返回对应的rules
- 提供类型选项和参数列表

**文件结构：**
- `photograph.ts` - 摄影类型配置（5个小类型）
- `design.ts` - 设计类型配置（4个小类型）
- `painting.ts` - 绘画类型配置（4个小类型）
- `index.ts` - 配置映射和获取函数

## 关键设计点

### 1. 参数提取逻辑

根据`type`字段，只提取该类型相关的业务参数：

```typescript
// 例如：type='portrait'时
// 只提取：style, tone, environment, makeup, pose, lighting
// 忽略：timeOfDay, weather, season等（这些是landscape的参数）
```

### 2. 提示词生成

使用graphconfigs中的rules作为系统提示词，结合业务参数和用户prompt，让大模型生成专业的图片生成提示词。

### 3. 模型选择

- `quality='high'`: 使用nano-banana（更高质量）
- `quality='fast'`: 使用seedream-4（更快速度）

### 4. 知识库（后续实现）

**当前状态：**
- 暂时不实现知识库召回
- knowledgeContext始终为空

**后续实现计划：**
- 根据业务参数自动从系统知识库召回相关内容
- 例如：根据style='modern'、tone='warm'等参数，自动检索相关的摄影知识
- 不需要用户传递knowledgeBase配置，系统内部自动处理

## 数据流

### 请求示例

```json
{
  "type": "portrait",
  "prompt": "一个优雅的女性",
  "style": "modern",
  "tone": "warm",
  "environment": "indoor",
  "quality": "high"
}
```

### 处理流程

1. **路由层**：验证参数，创建task
2. **任务执行层**：解析参数，提取graphType='photograph'
3. **服务层 - 提示词生成**：
   - 提取业务参数：{ style: 'modern', tone: 'warm', environment: 'indoor' }
   - 获取rules（从photograph.ts的portrait配置）
   - 构建提示词生成请求
   - 调用大模型生成：`"A professional portrait of an elegant woman, modern style, warm tone, indoor environment..."`
4. **服务层 - 图片生成**：
   - 选择模型：nano-banana（quality='high'）
   - 调用nano-banana.generate({ prompt: "生成的提示词", aspect_ratio: "16:9" })
   - 返回图片URLs

## 待实现功能

1. **系统内部知识库召回**
   - 根据业务参数自动召回相关知识
   - 不需要用户传递knowledgeBase配置

2. **MinIO存储支持**
   - 当storeToMinio=true时，下载图片并上传到MinIO
   - 返回MinIO URL而不是base64

3. **进度监控**
   - 对于支持进度流的模型，实时更新task进度

## 错误处理

- 参数验证失败：返回400错误
- 任务执行失败：更新task状态为failed，记录错误信息
- 模型调用失败：抛出错误，由任务执行层捕获并更新task状态
