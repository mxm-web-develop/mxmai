# Provider NULL 问题修复

## 问题描述

在 `cgi_tasks` 表中，有大量记录的 `model_provider` 字段为 `NULL`，导致无法正确追踪任务的 provider 信息。

## 问题原因

1. **TaskManager.createTask**：
   - 当自动选择 provider 失败时，`provider` 仍然是 `undefined`
   - 没有使用环境变量中配置的默认 provider

2. **DatabaseTaskStorage.toCreateDto**：
   - 直接将 `request.provider` 传入，如果为 `undefined`，数据库中的 `model_provider` 就是 `NULL`
   - 没有使用环境变量中配置的默认 provider

## 修复方案

### 1. TaskManager.createTask

**修改位置**：`mxmcgi/src/core/task/task-manager.ts`

**修改内容**：
- 在自动选择 provider 失败时，**使用环境变量中的默认 provider**（通过 `providerFactory.getDefaultProvider()`）
- 如果仍然无法确定，**抛出错误**（不应该发生，因为环境变量已设置）

```typescript
// 如果仍然没有 provider（理论上不应该发生），使用默认 provider
if (!provider) {
  try {
    const { providerFactory } = await import('../providers');
    provider = providerFactory.getDefaultProvider();
    console.log(`[TaskManager] Provider 未指定，使用默认 provider: ${provider}`);
  } catch (error) {
    // 如果连默认 provider 都无法获取，抛出错误
    throw new Error(`无法获取默认 provider，请检查 DEFAULT_PROVIDER 环境变量: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

### 2. DatabaseTaskStorage.toCreateDto

**修改位置**：`mxmcgi/src/core/task/database-storage.ts`

**修改内容**：
- 在转换为 DTO 时，如果 `provider` 是 `undefined`，**使用环境变量中的默认 provider**
- 方法改为 `async`，以便获取默认 provider

```typescript
// 如果 provider 未指定，使用默认 provider（从环境变量读取）
let modelProvider = request.provider;
if (!modelProvider) {
  try {
    const { providerFactory } = await import('../providers');
    modelProvider = providerFactory.getDefaultProvider();
    console.log(`[DatabaseTaskStorage] Provider 未指定，使用默认 provider: ${modelProvider}`);
  } catch (error) {
    // 如果连默认 provider 都无法获取，抛出错误（不应该发生，因为环境变量已设置）
    throw new Error(`无法获取默认 provider，请检查 DEFAULT_PROVIDER 环境变量: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

## 修复效果

- ✅ **新创建的任务**：`model_provider` 字段不会再是 `NULL`，会使用环境变量中的默认 provider
- ✅ **向后兼容**：不影响现有功能，只是确保字段不为空
- ✅ **日志记录**：当使用默认 provider 时，会记录日志，便于排查问题
- ✅ **错误处理**：如果无法获取默认 provider，会抛出明确的错误信息

## 现有数据修复

对于已经存在的 `model_provider` 为 `NULL` 的记录，可以通过以下 SQL 更新：

```sql
-- 将 NULL 更新为 'unknown'
UPDATE cgi_tasks 
SET model_provider = 'unknown' 
WHERE model_provider IS NULL;
```

或者，如果需要根据模型名称推断 provider：

```sql
-- 根据模型名称推断 provider（需要根据实际情况调整）
UPDATE cgi_tasks 
SET model_provider = CASE
  WHEN model_name LIKE 'sora%' OR model_name LIKE 'runway%' THEN 'deer'
  WHEN model_name LIKE 'minimax%' THEN 'deer'
  WHEN model_name IN ('nano-banana', 'flux-fast', 'flux-2-pro', 'seedream-4', 'ideogram-v2a') THEN 'replicate'
  ELSE 'unknown'
END
WHERE model_provider IS NULL;
```

## 测试建议

1. **创建新任务**：
   - 不指定 provider，验证 `model_provider` 不为 `NULL`
   - 指定 provider，验证正确保存
   - 使用不存在的模型，验证使用 'unknown'

2. **检查日志**：
   - 查看是否有 `[TaskManager] Provider 未指定且无法自动选择` 的警告
   - 确认自动选择 provider 的日志正常

3. **数据库验证**：
   - 查询新创建的任务，确认 `model_provider` 不为 `NULL`
   - 统计 `model_provider` 为 `NULL` 的记录数（应该不再增加）

