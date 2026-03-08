# CGI Task 表性能与存储评估

## 一、数据量估算

### 1.1 业务场景假设

**用户规模**：
- 初期：1,000 活跃用户
- 成长期：10,000 活跃用户
- 成熟期：100,000 活跃用户

**任务频率**（每个用户每天）：
- 图片生成：5-10 次
- 视频生成：1-3 次
- 文本生成：10-20 次
- 知识库导入：0.1-0.5 次（平均每周 1-3 次）

**平均任务数**：每个用户每天约 **15-30 个任务**

### 1.2 数据量计算

| 用户规模 | 每日任务数 | 每月任务数 | 每年任务数 |
|---------|-----------|-----------|-----------|
| 1,000 用户 | 15,000 - 30,000 | 450,000 - 900,000 | 5,400,000 - 10,800,000 |
| 10,000 用户 | 150,000 - 300,000 | 4,500,000 - 9,000,000 | 54,000,000 - 108,000,000 |
| 100,000 用户 | 1,500,000 - 3,000,000 | 45,000,000 - 90,000,000 | 540,000,000 - 1,080,000,000 |

---

## 二、存储空间估算

### 2.1 单条记录大小

**字段大小估算**：

| 字段 | 类型 | 平均大小 | 说明 |
|------|------|---------|------|
| `id` | VARCHAR(64) | 21 bytes | uid(21) |
| `user_id` | VARCHAR(64) | 36 bytes | UUID |
| `task_type` | VARCHAR(50) | 10 bytes | 'image'/'video' 等 |
| `model_name` | VARCHAR(100) | 20 bytes | 模型名称 |
| `model_provider` | VARCHAR(50) | 10 bytes | 'deer'/'replicate' 等 |
| `status` | VARCHAR(50) | 15 bytes | 'completed' 等 |
| `progress` | INTEGER | 4 bytes | 0-100 |
| `error_message` | TEXT | 0-500 bytes | 平均 50 bytes（失败时） |
| `input_data` | JSONB | 1-5 KB | 包含 prompt + 参数，平均 2 KB |
| `prompt` | TEXT | 100-2000 bytes | 平均 500 bytes |
| `output_data` | JSONB | 0-50 KB | **关键字段**，base64 时可能很大 |
| `result_format` | VARCHAR(20) | 10 bytes | 'base64'/'minio' |
| `storage_info` | JSONB | 0-1 KB | MinIO 存储信息，平均 200 bytes |
| `queued_at` | TIMESTAMP | 8 bytes | |
| `started_at` | TIMESTAMP | 8 bytes | |
| `completed_at` | TIMESTAMP | 8 bytes | |
| `created_at` | TIMESTAMP | 8 bytes | |
| `updated_at` | TIMESTAMP | 8 bytes | |
| `deleted_at` | TIMESTAMP | 8 bytes | 软删除标记 |
| `metadata` | JSONB | 0-2 KB | 平均 500 bytes |

**单条记录大小**：
- **最小**（MinIO 存储，无错误）：约 **3-5 KB**
- **平均**（MinIO 存储）：约 **5-8 KB**
- **最大**（Base64 存储，大图片）：约 **50-200 KB**（不推荐）

**推荐配置**：使用 MinIO 存储，平均每条记录 **6 KB**

### 2.2 总存储空间

| 用户规模 | 1年数据量 | 存储空间（6KB/条） | 3年数据量 | 存储空间 |
|---------|----------|------------------|----------|---------|
| 1,000 用户 | 5.4M - 10.8M | 32 GB - 65 GB | 16.2M - 32.4M | 97 GB - 194 GB |
| 10,000 用户 | 54M - 108M | 324 GB - 648 GB | 162M - 324M | 972 GB - 1.9 TB |
| 100,000 用户 | 540M - 1.08B | 3.2 TB - 6.5 TB | 1.62B - 3.24B | 9.7 TB - 19.4 TB |

**结论**：
- **10,000 用户规模**：1 年数据约 **500 GB**，3 年约 **1.5 TB**（可接受）
- **100,000 用户规模**：1 年数据约 **5 TB**，需要优化策略

---

## 三、性能分析

### 3.1 当前索引设计

```sql
CREATE INDEX idx_cgi_tasks_user_id ON cgi_tasks(user_id);
CREATE INDEX idx_cgi_tasks_status ON cgi_tasks(status);
CREATE INDEX idx_cgi_tasks_task_type ON cgi_tasks(task_type);
CREATE INDEX idx_cgi_tasks_model_name ON cgi_tasks(model_name);
CREATE INDEX idx_cgi_tasks_created_at ON cgi_tasks(created_at DESC);
CREATE INDEX idx_cgi_tasks_user_status ON cgi_tasks(user_id, status);
```

**索引评估**：
- ✅ **用户查询**（`user_id`）：有索引，性能良好
- ✅ **状态查询**（`status`）：有索引，但选择性较低（6 个状态值）
- ✅ **复合查询**（`user_id + status`）：有复合索引，性能优秀
- ✅ **时间排序**（`created_at DESC`）：有索引，性能良好
- ⚠️ **JSONB 查询**：`input_data`、`output_data` 无索引，大 JSONB 查询可能慢

### 3.2 查询模式分析

**常见查询**：

1. **用户任务列表**（最常见）
   ```sql
   SELECT * FROM cgi_tasks 
   WHERE user_id = ? AND deleted_at IS NULL 
   ORDER BY created_at DESC 
   LIMIT 20 OFFSET 0;
   ```
   - **性能**：✅ 优秀（`idx_cgi_tasks_user_id` + `idx_cgi_tasks_created_at`）
   - **10,000 用户规模**：< 10ms
   - **100,000 用户规模**：< 50ms（如果用户任务数 < 10,000）

2. **按状态查询**
   ```sql
   SELECT * FROM cgi_tasks 
   WHERE status = 'processing' AND deleted_at IS NULL;
   ```
   - **性能**：⚠️ 中等（`status` 选择性低，可能扫描大量行）
   - **建议**：添加时间范围限制

3. **按任务类型查询**
   ```sql
   SELECT * FROM cgi_tasks 
   WHERE task_type = 'image' AND user_id = ? 
   ORDER BY created_at DESC;
   ```
   - **性能**：✅ 良好（`idx_cgi_tasks_task_type` + `idx_cgi_tasks_user_id`）

### 3.3 写入性能

**插入操作**：
- **单条插入**：< 5ms（JSONB 序列化开销）
- **批量插入**：不适用（任务逐个创建）

**更新操作**（任务状态更新）：
- **更新状态**：< 3ms
- **更新进度**：< 3ms（频繁更新，但 JSONB 字段不变）
- **更新结果**：< 10ms（`output_data` JSONB 更新）

---

## 四、潜在问题

### 4.1 存储问题

1. **Base64 存储**：
   - 如果 `output_data` 包含 base64 图片，单条记录可能 **50-200 KB**
   - **100 万条记录**：可能达到 **50-200 GB**
   - **解决方案**：✅ 已支持 MinIO 存储，避免 base64

2. **软删除数据积累**：
   - `deleted_at IS NOT NULL` 的记录不会被查询，但占用存储
   - **建议**：定期清理（如 90 天后硬删除）

### 4.2 性能问题

1. **全表扫描风险**：
   - `status = 'processing'` 查询可能扫描大量行
   - **解决方案**：添加时间范围限制

2. **JSONB 查询慢**：
   - `input_data->>'prompt'` 等 JSONB 字段查询无索引
   - **当前影响**：较小（主要通过 `prompt` TEXT 字段查询）

3. **索引维护成本**：
   - 6 个索引，写入时需维护
   - **影响**：写入延迟增加约 10-20%

---

## 五、优化建议

### 5.1 短期优化（立即实施）

#### 1. 强制使用 MinIO 存储
```typescript
// 在 TaskExecutor 中，大文件自动使用 MinIO
if (result.mediaUrls && result.mediaUrls.some(url => url.startsWith('data:'))) {
  // 自动转换为 MinIO 存储
  await storeToMinio(...);
}
```

#### 2. 添加查询时间范围限制
```typescript
// 在 findMany 中，默认只查询最近 30 天的任务
if (!options.startDate) {
  options.startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}
```

#### 3. 定期清理软删除数据
```sql
-- 90 天后硬删除软删除的任务
DELETE FROM cgi_tasks 
WHERE deleted_at IS NOT NULL 
  AND deleted_at < NOW() - INTERVAL '90 days';
```

### 5.2 中期优化（10,000+ 用户）

#### 1. 表分区（按时间）
```sql
-- 按月分区
CREATE TABLE cgi_tasks_2024_01 PARTITION OF cgi_tasks
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

**优点**：
- 查询时只扫描相关分区
- 删除旧数据时直接删除分区（快）

**缺点**：
- 需要定期创建新分区
- 跨分区查询可能慢

#### 2. 归档表
```sql
-- 创建归档表
CREATE TABLE cgi_tasks_archive (LIKE cgi_tasks INCLUDING ALL);

-- 将 6 个月前的已完成任务移到归档表
INSERT INTO cgi_tasks_archive 
SELECT * FROM cgi_tasks 
WHERE status = 'completed' 
  AND completed_at < NOW() - INTERVAL '6 months';
```

#### 3. 压缩 JSONB 字段
```sql
-- PostgreSQL 14+ 支持 JSONB 压缩
-- 在创建表时使用 TOAST 压缩（自动）
-- 但可以显式设置压缩级别
ALTER TABLE cgi_tasks 
  ALTER COLUMN output_data SET STORAGE EXTENDED;
```

### 5.3 长期优化（100,000+ 用户）

#### 1. 读写分离
- **写**：主库（PostgreSQL）
- **读**：从库（PostgreSQL 只读副本）或缓存（Redis）

#### 2. 分库分表
- **按用户 ID 分片**：`cgi_tasks_shard_0`, `cgi_tasks_shard_1`, ...
- **或按时间分片**：`cgi_tasks_2024`, `cgi_tasks_2025`, ...

#### 3. 冷热数据分离
- **热数据**（最近 30 天）：PostgreSQL
- **冷数据**（30 天前）：对象存储（MinIO/S3）或归档数据库

---

## 六、可行性评估

### 6.1 当前设计可行性

| 用户规模 | 可行性 | 说明 |
|---------|--------|------|
| **< 1,000 用户** | ✅ **完全可行** | 数据量小，性能无压力 |
| **1,000 - 10,000 用户** | ✅ **可行** | 需要定期清理，建议实施短期优化 |
| **10,000 - 50,000 用户** | ⚠️ **需要优化** | 建议实施中期优化（分区/归档） |
| **> 50,000 用户** | ❌ **需要重构** | 建议实施长期优化（分库分表） |

### 6.2 关键指标

**存储成本**（假设 Supabase 存储 $0.021/GB/月）：
- **10,000 用户**：1 年 500 GB ≈ **$10.5/月**
- **100,000 用户**：1 年 5 TB ≈ **$105/月**

**查询性能目标**：
- **用户任务列表**：< 100ms（P95）
- **任务详情查询**：< 50ms（P95）

---

## 七、推荐方案

### 7.1 立即实施（0-3 个月）

1. ✅ **强制 MinIO 存储**：避免 base64 存储
2. ✅ **添加查询时间范围**：默认只查询最近 30 天
3. ✅ **定期清理软删除**：90 天后硬删除

### 7.2 中期规划（3-12 个月）

1. **表分区**（按月份）：当用户数 > 5,000 时实施
2. **归档表**：将 6 个月前的已完成任务移到归档表
3. **监控告警**：表大小 > 100 GB 时告警

### 7.3 长期规划（12+ 个月）

1. **读写分离**：当用户数 > 20,000 时考虑
2. **分库分表**：当用户数 > 50,000 时考虑
3. **冷热分离**：将 1 年以上的数据移到对象存储

---

## 八、监控指标

建议监控以下指标：

1. **表大小**：`SELECT pg_size_pretty(pg_total_relation_size('cgi_tasks'));`
2. **记录数**：`SELECT COUNT(*) FROM cgi_tasks WHERE deleted_at IS NULL;`
3. **查询性能**：P50/P95/P99 延迟
4. **写入性能**：插入/更新延迟
5. **索引使用率**：`EXPLAIN ANALYZE` 分析

---

## 九、结论

**当前设计在 10,000 用户规模下是可行的**，但需要：

1. ✅ **强制使用 MinIO 存储**（避免 base64）
2. ✅ **定期清理软删除数据**（90 天后硬删除）
3. ✅ **添加查询时间范围限制**（默认 30 天）
4. ⚠️ **监控表大小和查询性能**（设置告警）

**当用户数 > 10,000 时**，建议实施表分区和归档策略。

**当用户数 > 50,000 时**，需要考虑分库分表或读写分离。

