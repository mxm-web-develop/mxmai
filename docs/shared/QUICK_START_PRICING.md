# 快速解决图片生成"服务价格报错"问题

## 问题症状
发送图片生成请求时返回错误：
```json
{
  "id": "e18364debafcc3f7bb128",
  "type": "graph",
  "status": "failed",
  "progress": {
    "status": "failed",
    "progress": 100,
    "error": "服务价格报错，请联系管理人员"
  }
}
```

## 根本原因
系统缺少DeerAPI图片生成模型的定价配置和provider余额。

## 5分钟解决方案

### 方法1: 使用自动化脚本（推荐）

```bash
# 1. 确保数据库服务正在运行
cd mxmdata
docker-compose up -d postgres

# 2. 回到项目根目录并运行设置脚本
cd ..
./setup_pricing.sh
```

### 方法2: 手动步骤

```bash
# 1. 运行迁移创建表
pnpm --filter @mxmai/mxmdata run migrate:provider-usage-pricing
pnpm --filter @mxmai/mxmdata run migrate:provider-balances

# 2. 执行SQL插入定价数据
psql postgres://postgres:postgres@localhost:5432/postgres -f setup_pricing.sql

# 3. 重启服务
pnpm dev:mxmcgi
# 或重启所有服务
pnpm dev:all
```

## 验证配置

运行诊断工具检查配置是否正确：

```bash
# 安装Python依赖（如果需要）
pip install psycopg2-binary python-dotenv

# 运行诊断
python diagnose_pricing.py
```

预期输出应显示：
- ✅ provider_pricing表中包含deer provider记录
- ✅ provider_balances表中deer余额大于0
- ✅ 所有检查通过

## 自定义定价

如果需要调整价格，编辑`setup_pricing.sql`文件中的以下部分：

```sql
-- nano-banana: 快速图像生成
('deer', 'graph', 'nano-banana', 'per_image', 0.01, 'USD', 10, 5)

-- seedream-4: 高质量图像生成
('deer', 'graph', 'seedream-4', 'per_image', 0.03, 'USD', 30, 10)

-- flux-2-pro: 专业级图像生成
('deer', 'graph', 'flux-2-pro', 'per_image', 0.05, 'USD', 50, 20)
```

参数说明：
- `unit_price`: DeerAPI实际成本（USD/张）
- `platform_unit_price`: 向用户收取的MXM-TOKEN数量
- `platform_min_charge`: 最低收费（MXM-TOKEN）

## 故障排除

### 1. 数据库连接失败
```bash
# 检查PostgreSQL是否运行
docker-compose -f mxmdata/docker-compose.yml ps

# 启动数据库服务
docker-compose -f mxmdata/docker-compose.yml up -d postgres
```

### 2. 迁移命令失败
```bash
# 检查mxmdata包是否构建
pnpm --filter @mxmai/mxmdata build

# 手动运行迁移脚本
cd mxmdata
npx tsx src/scripts/run-provider-usage-pricing-migration.ts
```

### 3. 仍然出现价格报错
```bash
# 检查服务日志
# 查看mxmcgi服务控制台输出

# 手动验证数据库
psql postgres://postgres:postgres@localhost:5432/postgres -c "
SELECT * FROM provider_pricing WHERE provider = 'deer';
SELECT * FROM provider_balances WHERE provider = 'deer';
"
```

### 4. 其他Provider也需要定价
如果使用其他provider（如replicate、openai等），同样需要配置定价：
```sql
-- OpenAI DALL-E示例
INSERT INTO provider_pricing (provider, scope, model_key, charge_mode, unit_price, currency, platform_unit_price)
VALUES ('openai', 'graph', 'dall-e-3', 'per_image', 0.04, 'USD', 40);
```

## 后续管理

### 查看余额
```sql
SELECT provider, balance, currency FROM provider_balances;
```

### 充值余额
```sql
UPDATE provider_balances
SET balance = balance + 100
WHERE provider = 'deer';
```

### 调整价格
```sql
UPDATE provider_pricing
SET unit_price = 0.015, platform_unit_price = 15
WHERE provider = 'deer' AND model_key = 'nano-banana';
```

## 联系支持

如果问题仍然存在：
1. 查看`mxmcgi`服务日志中的详细错误
2. 检查DeerAPI API密钥是否有效
3. 确认网络连接正常
4. 参考详细指南：`PRICING_SETUP_GUIDE.md`