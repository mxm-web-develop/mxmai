# 图片生成服务定价设置指南

## 问题分析
当发送图片生成请求时出现"服务价格报错，请联系管理人员"错误，这是因为：
1. `provider_pricing`表中没有deer provider的定价配置
2. `provider_balances`表中没有deer provider的余额记录

## 解决方案

### 步骤1: 确保数据库表已创建
运行以下迁移命令创建必要的表：

```bash
# 从项目根目录运行
pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing
pnpm --filter @mxmai/mxmdata run migrate:provider-balances
```

### 步骤2: 配置数据库连接环境变量
确保`mxmdata/.env`文件中包含正确的数据库连接信息：

```bash
# 取消注释并设置正确的URL
SUPABASE_URL=http://localhost:3001
# 或者使用直接数据库连接
SUPABASE_DB_URL=postgres://postgres:postgres@localhost:5432/postgres
```

### 步骤3: 插入DeerAPI定价数据

DeerAPI图像生成模型主要有：
- `nano-banana`: 快速图像生成
- `seedream-4`: 高质量图像生成
- `flux-2-pro`: 专业级图像生成

需要为每个模型在`provider_pricing`表中插入定价记录。定价包含两个层面：

1. **提供商成本** (USD)：平台支付给DeerAPI的实际费用
   - `unit_price`: 每张图片的成本（USD）
   - `charge_mode`: 'per_image'（按图片计费）

2. **平台价格** (MXM-TOKEN)：向用户收取的平台代币
   - `platform_unit_price`: 每张图片收取的MXM-TOKEN数量
   - `platform_min_charge`: 最低收费

#### 示例SQL（需要替换为实际价格）

```sql
-- 插入DeerAPI图像生成定价
-- 注意：以下价格为示例，请替换为实际价格

-- nano-banana 模型
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5),
  ('deer', 'default', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5);

-- seedream-4 模型
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10),
  ('deer', 'default', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10);

-- flux-2-pro 模型
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge)
VALUES
  ('deer', 'graph', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20),
  ('deer', 'default', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20);
```

**如何确定实际价格：**
1. 查看DeerAPI官方定价文档或账单
2. 根据实际成本设置`unit_price`（USD）
3. 根据平台利润率设置`platform_unit_price`（MXM-TOKEN）
4. 考虑设置`platform_min_charge`确保最低收入

### 步骤4: 添加Provider余额

即使有定价，如果没有余额，任务也会失败。需要为deer provider添加初始余额：

```sql
-- 为deer provider添加初始余额（USD）
INSERT INTO provider_balances (provider, balance, currency)
VALUES ('deer', 100.00, 'USD')
ON CONFLICT (provider) DO UPDATE SET balance = EXCLUDED.balance;
```

### 步骤5: 创建SQL执行脚本

创建文件`setup_pricing.sql`：

```sql
-- setup_pricing.sql
-- 1. 清理旧数据（可选）
DELETE FROM provider_pricing WHERE provider = 'deer';
DELETE FROM provider_balances WHERE provider = 'deer';

-- 2. 插入定价数据（使用你的实际价格）
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price, platform_min_charge) VALUES
  ('deer', 'graph', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5),
  ('deer', 'default', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5),
  ('deer', 'graph', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10),
  ('deer', 'default', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10),
  ('deer', 'graph', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20),
  ('deer', 'default', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20);

-- 3. 添加provider余额
INSERT INTO provider_balances (provider, balance, currency)
VALUES ('deer', 100.00, 'USD')
ON CONFLICT (provider) DO UPDATE SET balance = EXCLUDED.balance;

-- 4. 验证数据
SELECT 'provider_pricing 记录数:' as table_name, COUNT(*) as count FROM provider_pricing WHERE provider = 'deer'
UNION ALL
SELECT 'provider_balances 记录数:' as table_name, COUNT(*) as count FROM provider_balances WHERE provider = 'deer';
```

执行SQL：
```bash
# 使用psql命令行
psql -h localhost -p 5432 -U postgres -d postgres -f setup_pricing.sql

# 或者使用supabase客户端
supabase db reset
```

### 步骤6: 验证配置

运行检查脚本验证配置：

```bash
# 从项目根目录运行
node check_pricing.js
```

### 步骤7: 测试图片生成

配置完成后，重新发送图片生成请求测试是否解决问题。

## 定价策略建议

### 1. 成本计算
- 从DeerAPI获取实际价格（每张图片成本）
- 考虑汇率波动和API调用频率

### 2. 平台定价策略
- **成本加成法**：成本 × (1 + 利润率)
  - 例如：成本$0.01，利润率200% → 收取30 MXM-TOKEN
- **市场定价法**：参考竞品定价
- **价值定价法**：根据生成图片的价值定价

### 3. 不同模型差异化定价
- `nano-banana`: 基础模型，价格最低
- `seedream-4`: 平衡质量和速度，中等价格
- `flux-2-pro`: 最高质量，价格最高

### 4. 批量折扣
可以在`metadata`字段中配置批量折扣策略：
```sql
UPDATE provider_pricing
SET metadata = '{"bulk_discount": {"5_images": 0.9, "10_images": 0.8}}'
WHERE provider = 'deer' AND model_key = 'nano-banana';
```

## 故障排除

### 1. 仍然出现"服务价格报错"
- 检查`provider_pricing`表中是否有`scope='graph'`的记录
- 检查`provider_balances`表中deer的余额是否大于0
- 检查环境变量`PLATFORM_TOKEN_ASSET_CODE`是否正确（默认为'MXM-TOKEN'）

### 2. 用户余额不足错误
用户钱包系统需要单独设置。确保：
- 用户有MXM-TOKEN资产的钱包
- 钱包余额充足

### 3. 其他provider的定价
如果需要支持其他provider（如replicate、openai等），同样需要配置：
```sql
-- OpenAI DALL-E 示例
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price)
VALUES ('openai', 'graph', 'dall-e-3', 'per_image', 0.04, 'USD', 40);
```

## 后续管理

### 1. 监控余额
定期检查provider余额，及时充值：
```sql
SELECT provider, balance, currency, updated_at
FROM provider_balances
WHERE balance < 10; -- 余额低于10时预警
```

### 2. 价格调整
根据成本变化调整价格：
```sql
UPDATE provider_pricing
SET unit_price = 0.015, platform_unit_price = 15, updated_at = NOW()
WHERE provider = 'deer' AND model_key = 'nano-banana';
```

### 3. 添加新模型
当DeerAPI推出新模型时，及时添加定价：
```sql
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price)
VALUES ('deer', 'graph', 'new-model-name', 'per_image', 0.02, 'USD', 20);
```

## 联系支持
如果按照以上步骤仍然无法解决问题，请联系：
- 查看DeerAPI官方定价：https://deerapi.com/pricing
- 检查项目日志：`mxmcgi`服务的控制台输出
- 检查数据库连接和权限