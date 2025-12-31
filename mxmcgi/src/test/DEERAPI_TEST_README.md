# DeerAPI 模型测试说明

## 一、环境配置

### 必需的环境变量

在 `.env` 文件中设置：

```bash
DEERAPI_BASE_URL=https://api.deerapi.com
DEERAPI_API_KEY=sk-xxxxx
```

### 获取 API Key

访问 https://api.deerapi.com/pricing 获取 API Key。

## 二、运行测试

### 2.1 运行所有测试

```bash
cd mxmcgi
pnpm tsx src/test/deerapi_test.ts
```

### 2.2 运行单个模型测试

编辑 `deerapi_test.ts` 文件中的 `main()` 函数，取消注释要测试的模型：

```typescript
async function main() {
  // ...
  try {
    // 图片生成模型测试
    await testNanoBanana();        // ✅ 已启用
    // await testFlux2Flex();      // 取消注释以测试
    // await testFlux2Pro();       // 取消注释以测试
    // await testFluxFast();       // 取消注释以测试

    // 文本生成模型测试
    // await testGPT5Nano();       // 取消注释以测试
    // await testClaude45Sonnet(); // 取消注释以测试
    // await testDeepSeekR1();     // 取消注释以测试
    // await testGemini25Flash();  // 取消注释以测试
  }
}
```

## 三、测试的模型

### 3.1 图片生成模型

| 测试函数 | 模型名称 | DeerAPI 标识符 | 价格 |
|---------|---------|--------------|------|
| `testNanoBanana()` | nano-banana | nano-banana | - |
| `testFlux2Flex()` | flux-2-flex | black-forest-labs/flux-2-flex | $0.06/次 |
| `testFlux2Pro()` | flux-2-pro | black-forest-labs/flux-2-pro | $0.03/次 |
| `testFluxFast()` | flux-fast | black-forest-labs/flux-1.1-pro | - |

### 3.2 文本生成模型

| 测试函数 | 模型名称 | DeerAPI 标识符 |
|---------|---------|--------------|
| `testGPT5Nano()` | gpt-5-nano | gpt-5-nano |
| `testClaude45Sonnet()` | claude-4.5-sonnet | claude-4.5-sonnet |
| `testDeepSeekR1()` | deepseek-r1 | deepseek-r1 |
| `testGemini25Flash()` | gemini-2.5-flash | gemini-2.5-flash |

## 四、测试输出

### 4.1 图片生成测试

- 生成的图片会保存到 `test/generated_images/deerapi-{model-name}/` 目录
- 控制台会显示生成进度和结果

### 4.2 文本生成测试

- 生成的文本会直接输出到控制台
- 包含完整的生成内容

## 五、注意事项

1. **API 端点**: 当前实现使用 `/v1/replicate/predictions` 端点，如果实际 API 不同，需要调整 `deerapi-client.ts`
2. **模型映射**: 某些模型可能需要不同的映射方式，根据实际 API 文档调整
3. **错误处理**: 如果测试失败，检查：
   - API Key 是否正确
   - Base URL 是否正确
   - 模型名称是否正确
   - 网络连接是否正常

## 六、调试

### 6.1 启用调试日志

在代码中添加调试日志：

```typescript
console.log('Provider:', provider.name);
console.log('Model:', modelName);
console.log('Params:', JSON.stringify(params, null, 2));
```

### 6.2 检查 API 响应

如果测试失败，检查 API 响应：

```typescript
try {
  const result = await provider.generate(modelName, params);
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error details:', error);
}
```

## 七、常见问题

### Q: 测试失败，提示 "Provider 'deer' 不支持模型"

**A**: 检查 `deer.provider.ts` 中的 `modelMap`，确保模型名称已添加。

### Q: 图片生成超时

**A**: 图片生成可能需要较长时间，默认超时为 2 分钟。可以在 `deerapi-client.ts` 中调整 `maxAttempts` 和 `intervalMs`。

### Q: API 端点错误

**A**: 根据 DeerAPI 实际 API 文档调整 `deerapi-client.ts` 中的端点路径。
