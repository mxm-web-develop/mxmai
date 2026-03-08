# 任务时间与状态调试地图

用于排查 `startedAt` / `completedAt` / `createdAt` / `updatedAt` 异常（如时间差数十小时、时区错位）。  
所有时间写入均为 **UTC**（`new Date().toISOString()`），读库时无 `Z` 后缀按 UTC 解析（见 database-storage）。

---

## 1. 任务创建：created_at / updated_at

| 动作 | 文件:行 | 说明 |
|------|---------|------|
| 写入 created_at、updated_at | **mxmdata** `src/adapters/supabase/SupabaseCGITaskRepository.ts` 约 **59-76** 行 | `const now = new Date().toISOString()`，insert 时传入 `created_at: now`, `updated_at: now` |
| 表结构 | **mxmdata** `src/database/schemas/mxmcgi.sql` 约 **29-34** 行 | `started_at TIMESTAMP`, `completed_at TIMESTAMP`, `created_at TIMESTAMP DEFAULT NOW()`, `updated_at TIMESTAMP DEFAULT NOW()` |
| 触发器（每次 UPDATE 覆盖 updated_at） | **mxmdata** `src/database/schemas/mxmcgi.sql` 约 **48-61** 行 | `update_cgi_tasks_updated_at`：`NEW.updated_at = NOW()`（依赖 DB 会话时区） |

---

## 2. startedAt：何时写入

| 动作 | 文件:行 | 说明 |
|------|---------|------|
| 第一次设为 processing 时写 startedAt | **mxmcgi** `src/core/task/task-manager.ts` 约 **310-316** 行 | `if (status === 'processing') { updates.progress = { ..., startedAt: new Date() } }` |
| 执行任务时触发上述更新 | **mxmcgi** `src/core/task/task-executor.ts` 约 **65-68** 行 | `updateTaskStatus(taskId, 'processing', { progress: 10, startedAt: new Date() })` |
| 写入 DB | **mxmcgi** `src/core/task/database-storage.ts` 约 **239-246** 行 | `updates.progress.startedAt` → `updateDto.started_at = startedAtDate.toISOString()` |
| 写入 Repo | **mxmdata** `SupabaseCGITaskRepository.ts` 约 **125-126** 行 | `if (data.started_at !== undefined) updateData.started_at = data.started_at` |

---

## 3. completedAt：何时写入

| 动作 | 文件:行 | 说明 |
|------|---------|------|
| 设为 failed 时写 completedAt | **mxmcgi** `src/core/task/task-manager.ts` 约 **318-323** 行 | `if (status === 'completed' \|\| status === 'failed' \|\| ...) { updates.progress = { ..., completedAt: new Date() } }` |
| setTaskError 使用 completedAt | **mxmcgi** `src/core/task/task-manager.ts` 约 **427-451** 行 | `setTaskError(taskId, error, options?: { completedAt?: Date })`，内部 `completedAt = options?.completedAt ?? new Date()`，写入 progress 并调 updateTaskStatus |
| 进度流失败（如视频超时） | **mxmcgi** `src/core/task/task-executor.ts` 约 **475-477** 行 | `else if (event.status === 'failed') { await this.taskManager.setTaskError(taskId, event.error \|\| '...') }` |
| 任务恢复标记超时失败时传入合理 completedAt | **mxmcgi** `src/core/task/task-recovery.ts` 约 **705-709** 行 | `completedAt = new Date(Math.min(Date.now(), startTime + timeoutMs))`，`setTaskError(task.id, errorMessage, { completedAt })` |
| 写入 DB | **mxmcgi** `src/core/task/database-storage.ts` 约 **247-253** 行 | `updates.progress.completedAt` → `updateDto.completed_at = completedAtDate.toISOString()` |
| 写入 Repo | **mxmdata** `SupabaseCGITaskRepository.ts` 约 **128-129** 行 | `if (data.completed_at !== undefined) updateData.completed_at = data.completed_at` |

---

## 4. updatedAt：何时变化

| 动作 | 文件:行 | 说明 |
|------|---------|------|
| 应用层不传 updated_at | **mxmcgi** `src/core/task/database-storage.ts` 的 `update()` | updateDto 中未包含 `updated_at`，由 DB 触发器在每次 UPDATE 时设置 |
| 触发器 | **mxmdata** `src/database/schemas/mxmcgi.sql` 约 **58-61** 行 | `BEFORE UPDATE` → `NEW.updated_at = NOW()` |

---

## 5. 从 DB 读出并解析（避免时区错位）

| 动作 | 文件:行 | 说明 |
|------|---------|------|
| 无 Z 按 UTC 解析 | **mxmcgi** `src/core/task/database-storage.ts` 约 **27-40** 行 | `parseUtcFromDb(value)`：字符串无 `Z` 或 `±HH:mm` 时在末尾补 `Z` 再 `new Date(s)` |
| 映射到 Task | **mxmcgi** `src/core/task/database-storage.ts` 约 **108-109, 132-133** 行 | `startedAt: parseUtcFromDb(cgiTask.started_at)`, `completedAt: parseUtcFromDb(cgiTask.completed_at)`, `createdAt: parseUtcFromDb(cgiTask.created_at)`, `updatedAt: parseUtcFromDb(cgiTask.updated_at)` |
| Repo 返回原始值 | **mxmdata** `SupabaseCGITaskRepository.ts` 约 **388-395** 行 | `mapToCGITask(data)` 直接 `started_at: data.started_at`, `completed_at: data.completed_at`, `created_at`, `updated_at`（Supabase 对 TIMESTAMP 常返回无 `Z` 的 ISO 串） |

---

## 6. 视频任务超时相关（便于对“视频生成超时”的 debug）

| 动作 | 文件:行 | 说明 |
|------|---------|------|
| 轮询次数与间隔 | **mxmcgi** `src/core/providers/deer.provider.ts` 约 **1244-1248** 行 | `createVideoProgressStream`：`maxAttempts = 180`, `pollInterval = 60000`（约 3 小时） |
| 超时 yield failed | **mxmcgi** `src/core/providers/deer.provider.ts` 约 **1326-1332** 行 | 轮询用尽后 `yield { status: 'failed', error: '视频生成超时' }` |
| 消费 failed 并 setTaskError | **mxmcgi** `src/core/task/task-executor.ts` 约 **475-477** 行 | `processProgressStream` 中 `event.status === 'failed'` → `setTaskError(taskId, event.error)` |

---

## 7. 快速定位表

- **startedAt 谁写的**：task-manager.ts 310-316，task-executor.ts 65-68  
- **completedAt 谁写的**：task-manager.ts 318-323、427-451，task-executor.ts 475-477，task-recovery.ts 705-709  
- **时间谁读的、怎么解析**：database-storage.ts 27-40（parseUtcFromDb）、108-109、132-133  
- **DB 表与触发器**：mxmdata src/database/schemas/mxmcgi.sql 29-34、48-61  
