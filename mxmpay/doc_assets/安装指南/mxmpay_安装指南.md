## 安装指南

### 环境要求
在开始安装 mxmpay 支付服务之前，请确保您的开发环境满足以下要求：
*   **Node.js**: 版本 18 或更高版本。推荐使用最新的 LTS 版本。
*   **包管理器**: 推荐使用 `pnpm` 以获得更快的安装速度和磁盘空间效率。`npm` 或 `yarn` 也可用。
*   **操作系统**: 支持 macOS, Linux 和 Windows (建议使用 WSL2)。
*   **数据库**: 项目依赖 `@mxmai/mxmdata` 工作区包，请确保已配置并运行了相应的数据库服务（如 PostgreSQL）。
*   **可选工具**: 项目本身不强制要求 Docker，但您可以使用 Docker 来容器化运行环境。

### 安装方式
首先，克隆项目仓库并进入项目目录。

```bash
# 克隆项目（请将 <repository-url> 替换为实际仓库地址）
git clone <repository-url>
cd mxmpay
```

然后，使用以下任一命令安装项目依赖。**我们强烈推荐使用 pnpm**。

```bash
# 使用 pnpm 安装（推荐）
pnpm install

# 使用 npm 安装
npm install

# 使用 yarn 安装
yarn install
```

### 快速开始
安装依赖后，您可以通过以下最小示例快速启动一个支付服务实例。首先，请确保在项目根目录下已正确配置 `.env` 文件（可参考 `.env.example`）。

```typescript
// 在您的启动文件（如 server.ts）中
import app from './app';
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`mxmpay 服务正在运行，端口: ${PORT}`);
});
```

使用以下命令编译并启动服务：

```bash
# 编译 TypeScript 代码
pnpm run build

# 启动服务
pnpm start
```

服务启动后，默认 API 文档可通过 `http://localhost:3000/api-docs` 访问。

### 常见问题
1.  **Node.js 版本不兼容**
    *   **问题**：安装或运行时出现 `Engine “node” is incompatible` 等错误。
    *   **解决**：请使用 `node -v` 检查当前版本，并使用 `nvm` 或 `fnm` 等工具切换至 Node.js 18 或更高版本。

2.  **工作区依赖 `@mxmai/mxmdata` 缺失**
    *   **问题**：安装时提示无法解析 `@mxmai/mxmdata@workspace:*`。
    *   **解决**：本项目依赖于同一 monorepo 中的 `mxmdata` 包。请确保在项目根工作区（`supermxmai`）下运行安装命令，或已将该依赖包正确发布/链接到本地。

3.  **TypeScript 编译错误**
    *   **问题**：运行 `pnpm run build` 时出现类型错误。
    *   **解决**：请确保所有依赖（尤其是工作区包）已正确安装。尝试删除 `node_modules` 和 `pnpm-lock.yaml`（或 `package-lock.json`/`yarn.lock`）后，重新执行 `pnpm install`。