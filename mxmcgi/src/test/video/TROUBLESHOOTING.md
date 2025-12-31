# 故障排查指南

## 502 Bad Gateway 错误

### 可能原因

1. **mxmcgi 服务未运行**
   ```bash
   # 检查服务是否运行
   lsof -i :4003
   # 或
   ps aux | grep mxmcgi
   ```

2. **mxmcgi 服务崩溃**
   - 检查 mxmcgi 服务的日志
   - 查看是否有错误信息

3. **端口配置错误**
   - 确认 Gateway 的 `MXMCGI_URL` 环境变量
   - 确认 mxmcgi 服务监听的端口

### 解决步骤

1. **启动/重启 mxmcgi 服务**
   ```bash
   cd /Users/mxm_pro/Desktop/codes/mobile
   npm run dev:mxmcgi
   # 或
   pnpm dev:mxmcgi
   ```

2. **检查服务日志**
   - 查看 mxmcgi 服务的控制台输出
   - 查找错误信息

3. **验证服务连接**
   ```bash
   # 直接测试 mxmcgi 服务
   curl http://localhost:4003/health
   ```

## 参考图不生效

### 检查清单

1. **图片尺寸必须完全匹配视频分辨率**
   - 如果请求 `size: "720x1280"`，图片必须是 720x1280 像素
   - 脚本会自动调整，但需要安装 `sharp` 包

2. **base64 大小限制**
   - 当前限制：20MB
   - 如果图片太大，建议压缩后再使用

3. **Prompt 必须明确描述动作**
   - 使用 "从这个精确的起始帧开始" 作为开头
   - 明确描述从参考图开始的动作

## 8秒视频变成4秒

### 检查清单

1. **seconds 参数必须是字符串**
   - ✅ 正确：`seconds: "8"`
   - ❌ 错误：`seconds: 8`

2. **查看调试日志**
   - `[Video Route]` - 接收到的参数
   - `[Deer Provider]` - 视频生成参数
   - `[DeerAPI Client]` - 实际发送的参数

3. **确认参数传递链路**
   - test script → Gateway → mxmcgi route → model file → provider → deerapi-client

## 快速诊断命令

```bash
# 1. 检查服务状态
lsof -i :3000  # Gateway
lsof -i :4003  # mxmcgi

# 2. 测试 Gateway 健康检查
curl http://localhost:3000/health

# 3. 测试 mxmcgi 健康检查
curl http://localhost:4003/health

# 4. 查看 Gateway 日志
# 在 Gateway 服务控制台查看

# 5. 查看 mxmcgi 日志
# 在 mxmcgi 服务控制台查看
```

## 常见错误和解决方案

### 错误：PayloadTooLargeError

**原因**：请求体超过限制

**解决**：
1. 确保 mxmcgi 的 `express.json({ limit: '20mb' })` 已设置
2. 压缩图片（使用 sharp 自动压缩）
3. 重启 mxmcgi 服务

### 错误：Service unavailable

**原因**：mxmcgi 服务未运行或崩溃

**解决**：
1. 启动/重启 mxmcgi 服务
2. 检查服务日志
3. 确认端口配置正确

### 错误：参考图尺寸不匹配

**原因**：图片尺寸与视频分辨率不一致

**解决**：
1. 安装 sharp：`npm install sharp` 或 `pnpm add sharp`
2. 脚本会自动调整图片尺寸
3. 或手动调整图片到目标分辨率
