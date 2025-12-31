# Loop 节点设计文档

## 一、需求背景

在 PPT slide 生成智能链中，我们需要为多个 slide 生成图片。当前的设计不支持循环，导致我们无法为每个 slide 都生成图片。

## 二、Loop 节点设计

### 2.1 节点类型定义

```typescript
{
  "id": "loop1",
  "type": "loop",
  "name": "循环生成图片",
  "iterable": "{{format_image_prompts.formatted.image_prompts}}",  // 要循环的数组
  "item_variable": "slide_prompt",  // 每次循环中，当前项存储的变量名
  "index_variable": "slide_index",  // 循环索引变量名（可选）
  "loop_nodes": ["generate_image"],  // 要循环执行的节点 ID 列表
  "max_iterations": 10,  // 最大循环次数（可选，防止无限循环）
  "collect_output": true,  // 是否收集循环中所有节点的输出（默认 true）
  "output_variable": "all_images"  // 收集的输出存储的变量名（当 collect_output=true 时）
}
```

### 2.2 执行流程

1. **解析 iterable**：从 context 中解析 `iterable` 表达式，获取要循环的数组
2. **验证数组**：确保 iterable 是一个数组
3. **循环执行**：
   - 对于数组中的每个元素：
     - 将当前元素存储到 `item_variable`（如 `slide_prompt`）
     - 将当前索引存储到 `index_variable`（如 `slide_index`）
     - 执行 `loop_nodes` 中指定的节点
     - 收集节点输出
4. **收集输出**：如果 `collect_output=true`，将所有循环的输出收集到 `output_variable`
5. **返回结果**：返回循环结果

### 2.3 输出格式

```json
{
  "success": true,
  "output": {
    "iterations": 3,  // 循环次数
    "results": [      // 每次循环的结果
      {
        "index": 0,
        "item": { ... },  // 当前循环项
        "node_outputs": {  // 循环中节点的输出
          "generate_image": { "image_urls": [...] }
        }
      },
      ...
    ],
    "all_images": [  // 如果 collect_output=true，收集所有图片
      "url1", "url2", "url3"
    ]
  }
}
```

### 2.4 变量引用

在循环内的节点中，可以使用以下变量：
- `{{loop1.item}}` 或 `{{slide_prompt}}`：当前循环项
- `{{loop1.index}}` 或 `{{slide_index}}`：当前循环索引
- `{{loop1.previous}}`：上一次循环的输出（可选）

### 2.5 配置示例

#### 示例 1：为多个 slide 生成图片

```json
{
  "nodes": [
    {
      "id": "format_image_prompts",
      "type": "formatter",
      "format_prompt": "...",
      "output_format": "json"
    },
    {
      "id": "loop_generate_images",
      "type": "loop",
      "iterable": "{{format_image_prompts.formatted.image_prompts}}",
      "item_variable": "slide_prompt",
      "index_variable": "slide_index",
      "loop_nodes": ["generate_single_image"],
      "max_iterations": 20,
      "collect_output": true,
      "output_variable": "all_slide_images"
    },
    {
      "id": "generate_single_image",
      "type": "model",
      "model_type": "image",
      "model": "nano-banana",
      "prompt": "{{slide_prompt.prompt}}",
      "params": {
        "aspect_ratio": "16:9"
      }
    },
    {
      "id": "end",
      "type": "end",
      "output_mapping": {
        "slide_images": "{{loop_generate_images.output.all_slide_images}}"
      }
    }
  ],
  "edges": [
    { "from": "format_image_prompts", "to": "loop_generate_images" },
    { "from": "loop_generate_images", "to": "end" }
  ]
}
```

#### 示例 2：条件循环（带 break）

```json
{
  "id": "loop_with_condition",
  "type": "loop",
  "iterable": "{{items}}",
  "item_variable": "item",
  "loop_nodes": ["process_item", "check_condition"],
  "break_condition": "{{check_condition.should_break}}",  // 如果为 true，跳出循环
  "collect_output": true
}
```

## 三、实现要点

### 3.1 LoopExecutor 实现

```typescript
export class LoopExecutor {
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // 1. 解析 iterable
    const iterable = VariableResolver.resolve(node.iterable, context);
    
    // 2. 验证是数组
    if (!Array.isArray(iterable)) {
      return {
        success: false,
        error: `Loop 节点的 iterable 必须是数组，当前类型: ${typeof iterable}`
      };
    }
    
    // 3. 检查最大循环次数
    const maxIterations = node.max_iterations || 100;
    if (iterable.length > maxIterations) {
      return {
        success: false,
        error: `循环次数超过最大限制: ${maxIterations}`
      };
    }
    
    // 4. 循环执行
    const results: any[] = [];
    const collectedOutputs: any[] = [];
    
    for (let i = 0; i < iterable.length; i++) {
      const item = iterable[i];
      
      // 设置循环变量
      const loopContext = {
        ...context,
        [node.item_variable]: item,
        [node.index_variable || 'loop_index']: i,
        [`${node.id}.item`]: item,
        [`${node.id}.index`]: i,
      };
      
      // 执行循环内的节点
      const nodeOutputs: Record<string, any> = {};
      for (const loopNodeId of node.loop_nodes || []) {
        const loopNode = // 从 nodeMap 获取节点
        const result = await executeNode(loopNode, loopContext);
        if (!result.success) {
          return {
            success: false,
            error: `循环中节点执行失败: ${loopNodeId} - ${result.error}`
          };
        }
        nodeOutputs[loopNodeId] = result.output;
        
        // 检查 break 条件
        if (node.break_condition) {
          const shouldBreak = VariableResolver.resolve(node.break_condition, loopContext);
          if (shouldBreak === true) {
            break;
          }
        }
      }
      
      // 收集输出
      results.push({
        index: i,
        item: item,
        node_outputs: nodeOutputs
      });
      
      // 如果 collect_output=true，收集特定字段
      if (node.collect_output) {
        // 收集所有图片 URL
        for (const nodeOutput of Object.values(nodeOutputs)) {
          if (nodeOutput.image_urls) {
            collectedOutputs.push(...nodeOutput.image_urls);
          } else if (nodeOutput.mediaUrls) {
            collectedOutputs.push(...nodeOutput.mediaUrls);
          } else if (typeof nodeOutput === 'string') {
            collectedOutputs.push(nodeOutput);
          }
        }
      }
    }
    
    // 5. 返回结果
    const output: any = {
      iterations: iterable.length,
      results: results
    };
    
    if (node.collect_output) {
      output[node.output_variable || 'collected_outputs'] = collectedOutputs;
    }
    
    return {
      success: true,
      output: output
    };
  }
}
```

### 3.2 引擎集成

在 `SmartflowEngine` 中：
1. 添加 `case 'loop'` 处理
2. 修改 `executeNodeRecursive` 以支持循环节点
3. 循环节点执行后，不直接执行 `loop_nodes`，而是由 LoopExecutor 内部处理

### 3.3 边（Edges）处理

循环节点的边处理：
- 循环节点本身作为普通节点，有输入边和输出边
- `loop_nodes` 中的节点不需要在 `edges` 中定义（它们由循环节点内部管理）
- 但 `loop_nodes` 中的节点可以引用循环外的节点输出

## 四、使用场景

1. **批量图片生成**：为多个 slide 生成图片
2. **批量数据处理**：处理数组中的每个元素
3. **迭代优化**：多次迭代优化内容
4. **批量 API 调用**：调用多个 API

## 五、注意事项

1. **性能**：循环会显著增加执行时间，特别是涉及模型调用时
2. **成本**：每次循环都会产生成本（如模型调用费用）
3. **错误处理**：循环中某个节点失败的处理策略（继续/停止）
4. **并发**：未来可以考虑并行执行循环（如果节点之间无依赖）

## 六、未来扩展

1. **并行循环**：支持并行执行循环（`parallel: true`）
2. **条件循环**：支持 while 循环（`while_condition`）
3. **嵌套循环**：支持循环嵌套
4. **循环优化**：缓存、去重等优化策略
