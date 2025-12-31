# PPT Slide 生成智能链说明

## 一、功能概述

这个智能链可以根据用户输入的文本内容，自动生成 PPT slide 大纲，设计样式排版，并为每一页生成配图。

## 二、工作流程

1. **拆分 Slide 大纲**：使用大模型将用户输入的文本拆分成多个 slide 大纲
2. **设计样式排版**：基于用户输入内容和风格要求，为每个 slide 设计样式排版方案
3. **生成图片 Prompt**：为每个 slide 生成适合 nano-banana 模型的图片生成 prompt
4. **生成图片**：使用 nano-banana 模型为每个 slide 生成配图

## 三、配置文件

### 3.1 当前可用版本（无循环）

**文件**：`ppt-slide-generation.json`

**限制**：
- 只能为第一个 slide 生成图片
- 不支持为多个 slide 批量生成图片

**适用场景**：
- 只需要生成单个 slide 的图片
- 测试和验证流程

### 3.2 理想版本（带循环）

**文件**：`ppt-slide-generation-with-loop.json`

**特点**：
- 使用 `loop` 节点为每个 slide 生成图片
- 支持批量生成多个 slide 的配图

**前提条件**：
- 需要实现 `loop` 节点类型（参考 `LOOP_NODE_DESIGN.md`）

## 四、输入参数

### 必需参数

- `content` (text): PPT 内容文本

### 可选参数

- `style` (text): PPT 风格（如：商务、科技、简约、创意等）

## 五、输出结果

### 输出字段

1. **slides_outline** (text): PPT slide 大纲（JSON 格式）
   ```json
   {
     "slides": [
       {
         "slide_number": 1,
         "title": "标题",
         "content": ["要点1", "要点2", "要点3"],
         "type": "封面"
       },
       ...
     ]
   }
   ```

2. **slide_design** (text): Slide 设计样式（JSON 格式）
   ```json
   {
     "design_style": "整体风格描述",
     "color_scheme": {
       "primary": "主色调",
       "secondary": "辅助色"
     },
     "slides": [
       {
         "slide_number": 1,
         "layout": "布局描述",
         "image_style": "图片风格描述",
         "image_description": "图片生成描述"
       },
       ...
     ]
   }
   ```

3. **slide_images** (image): 所有 slide 的配图 URL 数组
   ```json
   [
     "https://example.com/image1.jpg",
     "https://example.com/image2.jpg",
     ...
   ]
   ```

## 六、使用示例

### 6.1 创建智能链

```bash
POST /api/v1/smartflows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "PPT Slide 生成",
  "description": "根据文本生成 PPT slide 和配图",
  "schema": {
    // ... 从 ppt-slide-generation.json 复制
  },
  "status": "active",
  "is_public": false
}
```

### 6.2 执行智能链

```bash
POST /api/v1/smartflows/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-123",
  "input": [
    {
      "content": "人工智能的发展历程",
      "type": "text",
      "name": "content"
    },
    {
      "content": "科技风格",
      "type": "text",
      "name": "style"
    }
  ]
}
```

### 6.3 查询执行结果

```bash
GET /api/v1/smartflow-tasks/:taskId
Authorization: Bearer <token>
```

## 七、循环节点需求

### 7.1 为什么需要循环节点？

当前设计不支持循环，导致我们无法为多个 slide 批量生成图片。要实现完整的 PPT slide 生成功能，需要添加 `loop` 节点类型。

### 7.2 循环节点设计

参考 `LOOP_NODE_DESIGN.md` 了解循环节点的详细设计。

### 7.3 实现步骤

1. **创建 LoopExecutor**：
   - 文件：`mxmagent/src/core/smartflow/executors/loop-executor.ts`
   - 实现循环逻辑

2. **更新引擎**：
   - 在 `engine.ts` 中添加 `case 'loop'` 处理
   - 修改节点执行逻辑以支持循环

3. **更新类型定义**：
   - 在 `SmartflowNode` 类型中添加 loop 节点字段

4. **测试**：
   - 使用 `ppt-slide-generation-with-loop.json` 测试循环功能

## 八、注意事项

1. **成本**：每个 slide 生成图片都会产生成本，建议设置 `max_iterations` 限制
2. **性能**：循环会增加执行时间，特别是涉及多个模型调用时
3. **错误处理**：循环中某个图片生成失败的处理策略（继续/停止）
4. **JSON 解析**：确保 `format_image_prompts` 节点输出有效的 JSON 格式

## 九、未来优化

1. **并行生成**：支持并行生成多个 slide 的图片（如果 loop 节点支持并行）
2. **缓存机制**：缓存已生成的图片，避免重复生成
3. **图片优化**：自动调整图片尺寸、格式等
4. **模板支持**：支持不同的 PPT 模板风格
