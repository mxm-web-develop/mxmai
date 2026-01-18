# 九宫格任务转换设计方案

## 需求概述

当用户发起九宫格生图任务时：
1. 创建一个生图任务（type: 'graph'）
2. 生成完成后，将大图切割成 9 张图片
3. 将原始任务转换为隐藏类型（'graph-grid9-parent'），不在列表中显示
4. 创建 9 个新的生图任务（type: 'graph'），每个对应一张切割后的图片
5. 每个子任务的 metadata 中包含原始任务ID，方便追溯

## 设计要点

### 1. 任务类型扩展

**新增隐藏类型**：
```typescript
// 在 types.ts 中
export type TaskType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'writing' 
  | 'graph' 
  | 'graph-grid9-parent'  // 新增：九宫格父任务（隐藏）
  | 'other';
```

**类型说明**：
- `graph-grid9-parent`：九宫格父任务，用于存储原始请求和完整大图，不在用户列表中显示
- `graph`：正常的生图任务，包括切割后的子任务

### 2. 任务转换流程

```
用户发起九宫格任务 (type: 'graph', grid9: true)
    ↓
正常执行生成流程
    ↓
生成一张 4K 九宫格大图
    ↓
切割成 9 张图片
    ↓
【任务转换】
1. 将原始任务改为 'graph-grid9-parent'
2. 保存完整大图到原始任务
3. 创建 9 个子任务 (type: 'graph')
4. 每个子任务保存一张切割后的图片
5. 子任务 metadata 包含 parentTaskId
    ↓
用户看到 9 个独立的生图任务
```

### 3. Metadata 结构设计

**父任务 metadata**：
```typescript
{
  model: 'nano-banana',
  provider: 'deer',
  userId: 'xxx',
  storeToMinio: true,
  storageConfig: {...},
  // 九宫格特定字段
  grid9: true,
  grid9Type: 'parent',
  childTaskIds: ['task-1', 'task-2', ..., 'task-9'], // 9个子任务ID
  originalGrid9Image: 'minio-url', // 完整大图的URL
}
```

**子任务 metadata**：
```typescript
{
  model: 'nano-banana',
  provider: 'deer',
  userId: 'xxx',
  storeToMinio: true,
  storageConfig: {...},
  // 九宫格特定字段
  grid9: true,
  grid9Type: 'child',
  parentTaskId: 'original-task-id', // 原始任务ID
  grid9Index: 0, // 0-8，在9宫格中的位置
  grid9Position: { row: 1, col: 1 }, // 位置描述
  // 继承父任务的业务参数
  graphType: 'photograph',
  type: 'portrait',
  generated_prompt: '...', // 继承父任务的prompt
}
```

### 4. 列表过滤逻辑

**在 `database-storage.ts` 的 `list` 方法中**：
```typescript
async list(params: ListTasksParams): Promise<Task[]> {
  const options: ListCGITasksOptions = {
    user_id: params.userId,
    task_type: params.type,
    status: params.status,
    model_name: params.model,
    limit: params.limit,
    offset: params.offset,
    includeDeleted: params.includeDeleted || false,
    startDate: params.startDate,
    endDate: params.endDate,
  };

  const { tasks } = await this.repo.findMany(options);
  
  // 自动过滤隐藏类型
  const visibleTasks = tasks
    .filter(t => t.task_type !== 'graph-grid9-parent')
    .map(t => this.toTask(t));
  
  return visibleTasks;
}
```

**或者在数据库查询层面过滤**（推荐）：
```typescript
// 在 SupabaseCGITaskRepository 的 findMany 方法中
async findMany(options: ListCGITasksOptions): Promise<{ tasks: CGITask[]; total: number }> {
  let query = this.supabase
    .from('cgi_tasks')
    .select('*', { count: 'exact' })
    .neq('task_type', 'graph-grid9-parent') // 自动过滤隐藏类型
    .order('created_at', { ascending: false });
  
  // ... 其他过滤条件
}
```

### 5. 实现代码

#### 5.1 修改 `graph-task.ts`

在 `startGraphTask` 函数中添加九宫格处理逻辑：

```typescript
export async function startGraphTask(taskId: string, originalParams?: Record<string, any>): Promise<void> {
  // ... 前面的代码保持不变，直到生成完成
  
  // 检测是否为九宫格模式
  const isGrid9 = (graphParams as any).grid9 === true;
  
  if (isGrid9 && result.image_urls.length > 0) {
    // 九宫格处理流程
    await handleGrid9Task(
      taskId,
      result,
      graphParams,
      graphType,
      finalUserId,
      storageConfig,
      taskManager
    );
    return; // 九宫格任务已处理完成，直接返回
  }
  
  // ... 原有的单图处理逻辑
}

/**
 * 处理九宫格任务
 */
async function handleGrid9Task(
  originalTaskId: string,
  result: { image_urls: string[]; modelName: string; prompt: string },
  graphParams: any,
  graphType: string,
  userId: string,
  storageConfig: any,
  taskManager: TaskManager
): Promise<void> {
  console.log(`[GraphTask] 开始处理九宫格任务 (taskId: ${originalTaskId})`);
  
  // 1. 切割图片
  const grid9ImageUrl = result.image_urls[0]; // 第一张是九宫格大图
  const { splitGrid9Image } = await import('../utils/grid9-splitter');
  const splitResult = await splitGrid9Image(grid9ImageUrl);
  
  console.log(`[GraphTask] 九宫格图片已切割为 9 张`);
  
  // 2. 上传完整大图到 MinIO（保存到父任务）
  const { storeFromGenerateResult } = await import('../utils/data-store');
  const parentStorageResult = await storeFromGenerateResult(
    {
      mediaUrls: [grid9ImageUrl],
      metadata: {
        generated_prompt: result.prompt,
        graphType,
        type: graphParams.type,
        model: result.modelName,
        grid9: true,
      },
    },
    storageConfig,
    userId,
    result.modelName
  );
  
  const parentImageUrl = parentStorageResult[0].url;
  
  // 3. 上传 9 张切割后的图片到 MinIO
  const childStorageResults = await storeFromGenerateResult(
    {
      mediaUrls: splitResult.images,
      metadata: {
        generated_prompt: result.prompt,
        graphType,
        type: graphParams.type,
        model: result.modelName,
        grid9: true,
      },
    },
    storageConfig,
    userId,
    result.modelName
  );
  
  const childImageUrls = childStorageResults.map(r => r.url);
  const childKeys = childStorageResults.map(r => r.key);
  
  console.log(`[GraphTask] 9 张切割图片已上传到 MinIO`);
  
  // 4. 创建 9 个子任务
  const childTaskIds: string[] = [];
  
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3) + 1;
    const col = (i % 3) + 1;
    
    // 创建子任务
    const childTask = await taskManager.createTask({
      type: 'graph',
      model: result.modelName,
      provider: graphParams.provider,
      params: {
        ...graphParams,
        grid9: false, // 子任务不是九宫格
        grid9Index: i,
        grid9Position: { row, col },
      },
      userId,
      storeToMinio: true,
      storageConfig,
    });
    
    childTaskIds.push(childTask.taskId);
    
    // 立即设置子任务结果（图片已生成）
    await taskManager.setTaskResult(childTask.taskId, {
      mediaUrls: [childImageUrls[i]],
      metadata: {
        generated_prompt: result.prompt,
        graphType: graphType,
        type: graphParams.type,
        // 九宫格特定字段
        grid9: true,
        grid9Type: 'child',
        parentTaskId: originalTaskId,
        grid9Index: i,
        grid9Position: { row, col },
      },
      storageInfo: {
        keys: [childKeys[i]],
        bucket: childStorageResults[i].bucket,
        urls: [childImageUrls[i]],
      },
    });
    
    console.log(`[GraphTask] 子任务 ${i + 1}/9 已创建: ${childTask.taskId}`);
  }
  
  // 5. 将原始任务转换为父任务类型
  const storage = (taskManager as any).storage;
  if (storage) {
    // 更新任务类型为隐藏类型
    await storage.update(originalTaskId, {
      type: 'graph-grid9-parent',
      metadata: {
        ...task.metadata,
        grid9: true,
        grid9Type: 'parent',
        childTaskIds,
        originalGrid9Image: parentImageUrl,
      },
      result: {
        mediaUrls: [parentImageUrl],
        metadata: {
          generated_prompt: result.prompt,
          graphType,
          type: graphParams.type,
          grid9: true,
          grid9Type: 'parent',
        },
        storageInfo: {
          keys: [parentStorageResult[0].key],
          bucket: parentStorageResult[0].bucket,
          urls: [parentImageUrl],
        },
      },
    });
  }
  
  console.log(`[GraphTask] 九宫格任务处理完成 (parent: ${originalTaskId}, children: ${childTaskIds.length})`);
}
```

#### 5.2 修改任务类型定义

```typescript
// types.ts
export type TaskType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'writing' 
  | 'graph' 
  | 'graph-grid9-parent'  // 新增
  | 'other';
```

#### 5.3 修改列表查询

**方案 A：在 Repository 层过滤（推荐）**

```typescript
// SupabaseCGITaskRepository.ts
async findMany(options: ListCGITasksOptions): Promise<{ tasks: CGITask[]; total: number }> {
  let query = this.supabase
    .from('cgi_tasks')
    .select('*', { count: 'exact' })
    .neq('task_type', 'graph-grid9-parent') // 自动过滤隐藏类型
    .order('created_at', { ascending: false });
  
  // ... 其他过滤条件
}
```

**方案 B：在 Storage 层过滤**

```typescript
// database-storage.ts
async list(params: ListTasksParams): Promise<Task[]> {
  const options: ListCGITasksOptions = {
    // ... 参数
  };

  const { tasks } = await this.repo.findMany(options);
  
  // 过滤隐藏类型
  const visibleTasks = tasks
    .filter(t => t.task_type !== 'graph-grid9-parent')
    .map(t => this.toTask(t));
  
  return visibleTasks;
}
```

### 6. 查询子任务关联

如果需要查询某个子任务的父任务，或查询父任务的所有子任务：

```typescript
// 查询子任务的父任务
async function getParentTask(childTaskId: string): Promise<Task | null> {
  const childTask = await taskManager.getTask(childTaskId);
  if (!childTask?.task) return null;
  
  const parentTaskId = childTask.task.metadata.parentTaskId;
  if (!parentTaskId) return null;
  
  return (await taskManager.getTask(parentTaskId))?.task || null;
}

// 查询父任务的所有子任务
async function getChildTasks(parentTaskId: string): Promise<Task[]> {
  const parentTask = await taskManager.getTask(parentTaskId);
  if (!parentTask?.task) return [];
  
  const childTaskIds = parentTask.task.metadata.childTaskIds || [];
  const childTasks = await Promise.all(
    childTaskIds.map(id => taskManager.getTask(id))
  );
  
  return childTasks
    .filter(r => r?.task)
    .map(r => r!.task);
}
```

### 7. 优势分析

1. **用户体验**：
   - 用户看到 9 个独立的生图任务，可以单独查看和管理
   - 每个任务都有完整的图片和metadata
   - 符合现有的任务系统使用习惯

2. **系统一致性**：
   - 所有任务都通过统一的task系统管理
   - 支持现有的任务查询、状态更新等功能
   - 可以追溯原始任务

3. **数据完整性**：
   - 原始大图保存在父任务中（如果需要）
   - 每个子任务都有完整的业务参数和prompt
   - metadata中保存了完整的关联关系

4. **扩展性**：
   - 可以轻松添加查询父任务/子任务的API
   - 可以支持批量操作（如删除父任务时删除所有子任务）
   - 可以支持其他类型的任务转换

### 8. 注意事项

1. **任务类型验证**：
   - 在创建任务时，需要验证 `graph-grid9-parent` 类型不能直接创建
   - 只能通过系统内部转换生成

2. **权限控制**：
   - 子任务和父任务必须属于同一用户
   - 查询父任务时，需要验证用户权限

3. **错误处理**：
   - 如果切割失败，原始任务应该保持为 'graph' 类型
   - 如果子任务创建失败，需要清理已创建的子任务

4. **性能考虑**：
   - 9 张图片的上传是并行的，不会阻塞
   - 子任务的创建可以批量处理

## 总结

这个设计方案通过任务类型转换和子任务创建，实现了九宫格任务的优雅处理。用户看到的是 9 个独立的生图任务，而原始任务被隐藏但保留完整信息，既满足了用户体验，又保持了系统的完整性和可追溯性。
