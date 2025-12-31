# 启动 mxmcgi 服务

## 问题诊断

✅ Gateway 正在运行（端口 3000）  
❌ mxmcgi 服务未运行（端口 4003）

这就是为什么会出现 502 Bad Gateway 错误。

## 启动方法

### 方法 1: 使用 pnpm（推荐）

```bash
cd /Users/mxm_pro/Desktop/codes/mobile
pnpm dev:mxmcgi
```

### 方法 2: 直接进入目录启动

```bash
cd /Users/mxm_pro/Desktop/codes/mobile/mxmcgi
npm run dev
# 或
pnpm dev
```

### 方法 3: 启动所有服务

```bash
cd /Users/mxm_pro/Desktop/codes/mobile
pnpm dev:all
```

## 验证服务已启动

启动后，在另一个终端运行：

```bash
# 检查端口
lsof -i :4003

# 测试健康检查
curl http://localhost:4003/health

# 应该返回: {"status":"ok","service":"mxmcgi"}
```

## 然后重新测试

```bash
cd /Users/mxm_pro/Desktop/codes/mobile/mxmcgi/src/test/video
tsx ./test_sora_with_reference.ts
```
