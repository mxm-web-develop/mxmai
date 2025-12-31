# Loop 节点实现总结

## 一、实现概述

Loop 节点功能已成功实现，支持对数组进行迭代处理，循环执行指定的节点。

## 二、已完成的实现

### 2.1 类型定义更新

1. **NodeType 类型** (`mxmdata/src/models/Smartflow.ts`)
   - 添加了 `'loop'` 节点类型

2. **SmartflowNode 接口** (`mxmdata/src/models/Smartflow.ts`)
   - 添加了 loop 节点配置字段：
     - `iterable`: 要循环的数组表达式
     - `item_variable`: 当前项变量名
     - `index_variable`: 循环索引变量名（可选）
     - `loop_nodes`: 要循环执行的节点 ID 列表
     - `max_iterations`: 最大循环次数（可选，默认 100）
     - `collect_output`: 是否收集输出（可选，默认 true）
     - `output_variable`: 收集输出的变量名（可选）
     - `break_condition`: 跳出循环的条件表达式（可选）

3. **ExecutionContext 接口** (`mxmagent/src/core/smartflow/executors/types.ts`)
   - 添加了 `nodeMap` 和 `executeNode` 字段，供 loop 节点使用

### 2.2 LoopExecutor 实现

**文件**: `mxmagent/src/core/smartflow/executors/loop-executor.ts`

**功能**:
- 解析 `iterable` 表达式，获取要循环的数组
- 验证数组类型和最大循环次数
- 对数组中的每个元素循环执行 `loop_nodes` 中的节点
- 收集循环中所有节点的输出
- 支持 `break_condition` 条件跳出循环
- 返回循环结果和收集的输出

**关键实现点**:
- 使用 `VariableResolver` 解析变量表达式
- 创建循环上下文，设置 `item_variable` 和 `index_variable`
- 通过 `context.executeNode` 执行循环内的节点
- 自动收集图片 URL（支持 `image_urls`、`mediaUrls` 和字符串格式）

### 2.3 引擎集成

**文件**: `mxmagent/src/core/smartflow/engine.ts`

**更新内容**:
1. 导入 `LoopExecutor`
2. 在 `executeNode` 方法中添加 `case 'loop'` 处理
3. 在 `runWorkflow` 中将 `nodeMap` 和 `executeNode` 函数传递到 context
4. 在 `executeNodeRecursive` 中跳过 `loop_nodes` 中的节点（避免重复执行）

### 2.4 导出更新

**文件**: `mxmagent/src/core/smartflow/executors/index.ts`
- 添加了 `LoopExecutor` 的导出

## 三、使用方法

### 3.1 基本配置

```json
{
  "id": "loop1",
  "type": "loop",
  "iterable": "{{format_image_prompts.formatted.image_prompts}}",
  "item_variable": "slide_prompt",
  "index_variable": "slide_index",
  "loop_nodes": ["generate_single_image"],
  "max_iterations": 20,
  "collect_output": true,
  "output_variable": "all_slide_images"
}
```

### 3.2 在循环内节点中使用变量

循环内的节点可以通过以下方式引用循环变量：

```json
{
  "id": "generate_single_image",
  "type": "model",
  "model_type": "image",
  "model": "nano-banana",
  "prompt": "{{slide_prompt.prompt}}"
}
```

支持的变量引用：
- `{{item_variable}}`: 当前循环项（如 `{{slide_prompt}}`）
- `{{loop_id.item}}`: 通过 loop 节点 ID 引用当前项（如 `{{loop1.item}}`）
- `{{index_variable}}`: 当前循环索引（如果指定了 `index_variable`）
- `{{loop_id.index}}`: 通过 loop 节点 ID 引用索引

### 3.3 输出格式

Loop 节点的输出格式：

```json
{
  "success": true,
  "output": {
    "iterations": 3,
    "results": [
      {
        "index": 0,
        "item": { "slide_number": 1, "prompt": "..." },
        "node_outputs": {
          "generate_single_image": { "image_urls": ["url1"] }
        }
      },
      ...
    ],
    "all_slide_images": ["url1", "url2", "url3"]
  }
}
```

### 3.4 在 End 节点中引用输出

```json
{
  "id": "end",
  "type": "end",
  "output_mapping": {
    "slide_images": "{{loop_generate_images.output.all_slide_images}}"
  }
}
```

## 四、注意事项

### 4.1 loop_nodes 中的节点

- `loop_nodes` 中的节点不应该在 `edges` 中定义（它们由 loop 节点内部管理）
- 引擎会自动跳过 `loop_nodes` 中的节点，避免重复执行

### 4.2 循环限制

- 默认最大循环次数为 100，可通过 `max_iterations` 配置
- 如果数组长度超过 `max_iterations`，会返回错误

### 4.3 错误处理

- 如果循环中某个节点执行失败，循环会停止并返回错误
- 未来可以考虑添加错误处理策略（继续/停止/重试）

### 4.4 性能考虑

- 循环会增加执行时间，特别是涉及模型调用时
- 每次循环都会产生成本（如模型调用费用）
- 建议设置合理的 `max_iterations` 限制

## 五、测试示例

参考 `ppt-slide-generation-with-loop.json` 配置示例，这是一个完整的 PPT slide 生成智能链，使用 loop 节点为每个 slide 生成图片。

## 六、未来优化方向

1. **并行循环**: 支持并行执行循环（如果节点之间无依赖）
2. **条件循环**: 支持 while 循环（`while_condition`）
3. **嵌套循环**: 支持循环嵌套
4. **错误处理策略**: 支持配置错误处理策略（继续/停止/重试）
5. **循环优化**: 缓存、去重等优化策略

## 七、相关文档

- [Loop 节点设计文档](./LOOP_NODE_DESIGN.md)
- [PPT Slide 生成示例](../examples/ppt-slide-generation-with-loop.json)
- [PPT Slide 生成说明](../examples/PPT_SLIDE_GENERATION_README.md)
