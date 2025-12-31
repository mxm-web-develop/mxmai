# Smartflow 使用示例

## 一、创建 Smartflow

```typescript
import { createSmartflowService } from './service';
import type { CreateSmartflowDto } from '@mxmai/mxmdata';

const service = createSmartflowService();

// 创建 Smartflow
const smartflowDto: CreateSmartflowDto = {
  name: '日系写真生成工作流',
  description: '生成日系风格的写真照片',
  schema: {
    nodes: [
      {
        id: 'start',
        type: 'start',
        input: [
          {
            content: '',
            type: 'text',
            name: 'user_input'
          }
        ],
        expected_outputs: [
          { type: 'text', name: 'description', required: true },
          { type: 'image', name: 'image', required: true }
        ],
        smartflow_name: '日系写真生成工作流'
      },
      {
        id: 'text_gen',
        type: 'model',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: '分析用户需求：{{input.user_input}}'
      },
      {
        id: 'format_prompt',
        type: 'formatter',
        template: 'nano-banana-photo-prompt',
        format_prompt: '将需求转换为专业摄影提示词',
        reference_nodes: ['text_gen'],
        output_format: 'prompt'
      },
      {
        id: 'image_gen',
        type: 'model',
        model_type: 'image',
        model: 'nano-banana',
        prompt: '{{format_prompt.formatted}}'
      },
      {
        id: 'end',
        type: 'end',
        output_mapping: {
          description: '{{text_gen.response}}',
          image: '{{image_gen.image_urls}}'
        }
      }
    ],
    edges: [
      { from: 'start', to: 'text_gen' },
      { from: 'text_gen', to: 'format_prompt' },
      { from: 'format_prompt', to: 'image_gen' },
      { from: 'image_gen', to: 'end' }
    ]
  },
  status: 'active',
  author_id: 'user-123'
};

const smartflow = await service.createSmartflow(smartflowDto);
console.log('Smartflow created:', smartflow.id);
```

## 二、执行 Smartflow（创建 Task）

```typescript
// 执行 Smartflow
const execution = await service.executeSmartflow(
  smartflow.id,  // Smartflow ID
  'user-123',    // 用户 ID
  [
    {
      content: '生成一张日系风格的写真照片',
      type: 'text',
      name: 'user_input'
    }
  ],
  'conversation-456'  // 可选的对话 ID
);

console.log('Task created:', execution.id);
console.log('Status:', execution.status);  // 'running'
```

## 三、查询 Task 状态

```typescript
// 获取 Task 详情（包含执行状态和节点输出）
const task = await service.getExecution(execution.id);

console.log('Task status:', task.status);
console.log('Progress:', task.progress);  // 0-100
console.log('Flow chain:', task.flow_chain);  // 每个节点的执行记录

// flow_chain 示例：
// [
//   {
//     node_id: 'start',
//     node_name: '工作流入口',
//     state: 'completed',
//     input: {...},
//     output: {...},
//     timestamp: 1234567890,
//     duration: 10
//   },
//   {
//     node_id: 'text_gen',
//     node_name: '文本生成',
//     state: 'completed',
//     input: {...},
//     output: { response: '...' },
//     timestamp: 1234567900,
//     duration: 1500
//   },
//   ...
// ]
```

## 四、获取用户的 Task 列表

```typescript
// 获取用户的所有执行实例
const executions = await service.getUserExecutions('user-123', 10, 0);

for (const exec of executions) {
  console.log(`Task ${exec.id}: ${exec.status} - ${exec.progress}%`);
}
```

## 五、获取 Smartflow 列表

```typescript
// 获取用户的 Smartflow 列表
const mySmartflows = await service.getUserSmartflows('user-123');

// 获取公开的 Smartflow 列表
const publicSmartflows = await service.getPublicSmartflows();
```

## 六、完整流程示例

```typescript
import { createSmartflowService } from './service';

async function main() {
  const service = createSmartflowService();

  // 1. 创建 Smartflow
  const smartflow = await service.createSmartflow({
    name: '简单文本生成',
    schema: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          input: [{ content: '', type: 'text', name: 'user_input' }],
          expected_outputs: [{ type: 'text', name: 'result', required: true }]
        },
        {
          id: 'text_gen',
          type: 'model',
          model_type: 'text',
          model: 'gpt-5-nano',
          prompt: '{{input.user_input}}'
        },
        {
          id: 'end',
          type: 'end',
          output_mapping: { result: '{{text_gen.response}}' }
        }
      ],
      edges: [
        { from: 'start', to: 'text_gen' },
        { from: 'text_gen', to: 'end' }
      ]
    },
    author_id: 'user-123'
  });

  console.log('✅ Smartflow created:', smartflow.id);

  // 2. 执行 Smartflow
  const execution = await service.executeSmartflow(
    smartflow.id,
    'user-123',
    [
      {
        content: '你好，请介绍一下自己',
        type: 'text',
        name: 'user_input'
      }
    ]
  );

  console.log('✅ Task created:', execution.id);

  // 3. 等待执行完成（轮询）
  let task = execution;
  while (task.status === 'running' || task.status === 'pending') {
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒
    task = await service.getExecution(execution.id);
    console.log(`⏳ Progress: ${task.progress}%`);
  }

  // 4. 查看结果
  if (task.status === 'completed') {
    console.log('✅ Task completed!');
    console.log('Output:', task.output_data);
    console.log('Flow chain:', task.flow_chain);
  } else if (task.status === 'failed') {
    console.log('❌ Task failed:', task.error_message);
  }
}

main().catch(console.error);
```

---

## 数据流程

1. **创建 Smartflow** → 存储到 `smartflows` 表
2. **执行 Smartflow** → 创建 Task（`smartflow_executions` 表）
3. **执行过程中** → 实时更新 `flow_chain`，记录每个节点的状态和输出
4. **执行完成** → 更新 `status` 为 `completed`，保存 `output_data`

---

## 关键字段说明

### SmartflowExecution (Task)
- `id`: Task ID
- `smartflow_id`: 关联的 Smartflow ID
- `status`: 执行状态（pending, running, completed, failed, cancelled）
- `progress`: 进度（0-100）
- `input_data`: 输入数据
- `output_data`: 最终输出数据
- `flow_chain`: 执行链，记录每个节点的执行情况
- `error_message`: 错误信息（如果失败）

### flow_chain 结构
```typescript
Array<{
  node_id: string;           // 节点 ID
  node_name: string;         // 节点名称
  state: 'pending' | 'processing' | 'completed' | 'failed';
  input?: any;               // 节点输入
  output?: any;              // 节点输出
  error?: string;            // 错误信息
  timestamp: number;         // 时间戳
  duration?: number;         // 执行时长（毫秒）
}>
```
