# 项目迁移指南

本指南将帮助您将 `supermxmai` 项目结构复制到新项目，并替换所有业务相关的名称和标识符。

## 📋 迁移步骤

### 第一步：运行迁移脚本

```bash
# 在 supermxmai 项目根目录执行
chmod +x migrate-project.sh
./migrate-project.sh <新项目名称> [目标路径]
```

**示例：**
```bash
./migrate-project.sh mynewproject ~/Desktop/codes/
```

这将会：
- **只复制基础架构模块**：gateway, docs-generator, mxmauth, mxmdata, mxmnotify, scripts, web
- **排除业务模块**：mxmcgi, mxmagent, mxmpay, mxmprompt, moblie, mxmservice, mxmcommunity
- 排除 `node_modules`、`.git`、`dist` 等不需要的文件
- 创建 `migration-config.json` 配置文件
- 自动更新新项目的 `pnpm-workspace.yaml` 和 `tsconfig.json`（只包含迁移的模块）

**重要**：
- ✅ **源项目 supermxmai 不会被修改**，可以继续正常开发
- ✅ 所有配置更新仅在新项目中进行
- ⚠️ `mxmservice` 模块在项目中未被使用（不在 workspace 中，也没有被引用），已自动排除

### 第二步：配置替换规则

编辑新项目中的 `migration-config.json` 文件：

```json
{
  "oldProjectName": "@mxmai",
  "newProjectName": "@mynewproject",
  "oldProjectDescription": "MXM AI Collection",
  "newProjectDescription": "My New Project",
  "oldAuthor": "hanfeng_Zhang",
  "newAuthor": "Your Name",
  "replacements": {
    "@mxmai": "@mynewproject",
    "@mxmweb": "@mynewproject",
    "mxmai": "mynewproject",
    "mxmweb": "mynewproject",
    "MXM AI Collection": "My New Project",
    "hanfeng_Zhang": "Your Name"
  },
  "services": {
    "mxmauth": "auth",
    "mxmnotify": "notify",
    "mxmdata": "data",
    "gateway": "gateway"
  }
}
```

**配置说明：**
- `oldProjectName` / `newProjectName`: 项目包名（用于 package.json）
- `oldProjectDescription` / `newProjectDescription`: 项目描述
- `oldAuthor` / `newAuthor`: 作者名称
- `replacements`: 自定义替换规则（键值对）
- `services`: 服务重命名映射（可选，如果不需要重命名服务可删除此字段）

### 第三步：执行名称替换

```bash
cd <新项目路径>
tsx replace-project-names.ts
```

这个脚本会：
- 遍历所有代码文件
- 根据配置替换所有匹配的字符串
- 显示修改的文件列表和统计信息

### 第四步：安装依赖

```bash
pnpm install
```

### 第五步：配置环境变量

为每个服务创建 `.env` 文件（参考各服务的 `.env.example`）：

```bash
# 数据层
cp mxmdata/.env.example mxmdata/.env
# 编辑 mxmdata/.env

# 认证服务
cp mxmauth/.env.example mxmauth/.env
# 编辑 mxmauth/.env

# 网关
cp gateway/.env.example gateway/.env
# 编辑 gateway/.env

# ... 其他服务类似
```

**重要环境变量：**
- 数据库连接字符串
- JWT 密钥
- 第三方服务 API 密钥
- 端口配置

### 第六步：更新服务配置

#### 1. 更新根目录 package.json

检查并更新：
- 项目名称
- 描述
- 作者
- scripts 中的服务名称（如果重命名了服务）

#### 2. 更新 pnpm-workspace.yaml

迁移脚本已自动更新，只包含迁移的模块：

```yaml
packages:
  - mxmauth
  - mxmnotify
  - mxmdata
  - gateway
```

如果重命名了服务目录，需要相应更新。

#### 3. 更新各服务的 package.json

检查每个服务目录下的 `package.json`：
- `name` 字段
- `description` 字段
- `scripts` 中的命令

#### 4. 更新 TypeScript 配置

检查 `tsconfig.json` 中的 `include` 路径，确保指向正确的服务目录。

### 第七步：清理和初始化

```bash
# 清理构建产物（如果有）
pnpm --filter "*" clean

# 初始化数据库（如果使用）
pnpm init:project
```

### 第八步：测试运行

```bash
# 启动所有服务
pnpm dev:all

# 或单独启动
pnpm dev:auth
pnpm dev:gateway
# ...
```

## 🔍 需要手动检查的内容

### 1. 业务逻辑代码

替换脚本**不会**修改业务逻辑，您需要手动：

- 查看各服务的 `src/` 目录
- 替换业务相关的类型定义
- 更新 API 路由和端点
- 修改数据库 schema 和模型
- 更新业务文档（如 `*.md` 文件）

### 2. 数据库相关

- 检查 `mxmdata/src/` 下的 SQL 文件
- 更新表名、字段名（如果与业务相关）
- 检查数据库初始化脚本
- 更新迁移脚本

### 3. API 文档

- 检查 `API_DOCUMENTATION.md`
- 更新 Postman 集合文件
- 检查各服务的 API 文档

### 4. 配置文件

- `.env.example` 文件中的示例值
- Docker 配置（如果有）
- CI/CD 配置（如果有）

### 5. 移动端应用

**注意**：移动端应用（`moblie/`）是业务模块，不会迁移。如果需要，请单独处理。

## 📁 项目结构说明

### 迁移的模块

```
新项目/
├── gateway/          # API 网关
├── mxmauth/          # 认证服务
├── mxmdata/          # 数据层
├── mxmnotify/        # 通知服务
├── docs-generator/   # 文档生成器
├── scripts/          # 脚本目录
├── web/              # Web 前端（如果存在）
├── package.json      # 根 package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── ...
```

### 不迁移的业务模块

以下模块是 supermxmai 的特定业务，不会迁移：
- `mxmcgi` - CGI 业务服务
- `mxmagent` - Agent 业务服务
- `mxmpay` - 支付业务服务
- `mxmprompt` - Prompt 业务服务
- `moblie` - 移动端应用
- `mxmservice` - 未使用的服务模块
- `mxmcommunity` - 社区服务

## ⚠️ 注意事项

1. **Git 历史**: 迁移脚本不会复制 `.git` 目录，需要在新项目中重新初始化 Git
2. **依赖版本**: 检查 `package.json` 中的依赖版本，确保兼容性
3. **端口冲突**: 检查各服务的端口配置，避免与现有服务冲突
4. **环境变量**: 所有敏感信息都在 `.env` 文件中，确保不要提交到 Git
5. **数据库**: 新项目需要独立的数据库实例，不要使用原项目的数据库

## 🐛 常见问题

### Q: 替换脚本没有替换某些文件？

A: 检查文件是否在排除列表中，或者文件扩展名不在处理列表中。可以手动编辑 `replace-project-names.ts` 添加新的扩展名。

### Q: 服务启动失败？

A: 
1. 检查环境变量是否正确配置
2. 检查端口是否被占用
3. 检查数据库连接是否正常
4. 查看服务日志获取详细错误信息

### Q: 如何保留某些特定的字符串不被替换？

A: 在运行替换脚本之前，可以临时修改这些字符串（例如添加特殊标记），替换完成后再改回来。

## 📚 相关文档

- [项目结构说明](./README.md)
- [端口配置](./PORTS.md)
- [各服务文档](./MXMAUTH.md, ./MXMCGI.md, ...)

## 🎯 下一步

迁移完成后，建议：

1. 创建新的 Git 仓库
2. 设置 CI/CD 流程
3. 编写新项目的 README
4. 更新 API 文档
5. 配置监控和日志系统

---

**祝迁移顺利！** 🚀
