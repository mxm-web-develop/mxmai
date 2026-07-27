import { McpVisionProvider, checkDaemon, understandImage } from './src/models/mcp/mod.ts';

async function main() {
  console.log('=== MCP Vision Provider 端到端测试 ===\n');

  console.log('1. 检查 mcporter daemon...');
  const daemonOk = await checkDaemon();
  console.log(`   Daemon 运行中: ${daemonOk}`);

  // 2. 测试 understandImage 函数
  console.log('\n2. 测试 understandImage 函数...');
  const testImageUrl = 'https://httpbin.org/image/jpeg';
  
  try {
    const result = await understandImage('描述这张图片的内容', testImageUrl);
    const textContent = result.content.find((c: any) => c.type === 'text');
    console.log(`   ✅ understandImage 成功!`);
    console.log(`   结果: ${textContent?.text?.slice(0, 150)}...`);
  } catch (e: any) {
    console.log(`   ❌ 失败: ${e.message}`);
  }

  // 3. 测试通过 Provider.generate 调用（传正确的参数）
  console.log('\n3. 测试 McpVisionProvider.generate (传 imageUrl)...');
  try {
    const provider = new McpVisionProvider();
    const result = await provider.generate('minimax-vision', {
      prompt: '描述这张图片',
      parameters: { imageUrl: testImageUrl }
    });
    console.log(`   ✅ generate 成功!`);
    console.log(`   mediaUrls: ${JSON.stringify(result.mediaUrls)}`);
  } catch (e: any) {
    console.log(`   ❌ generate 失败: ${e.message}`);
  }

  // 4. 测试 supportsModel
  console.log('\n4. 测试 supportsModel...');
  const provider = new McpVisionProvider();
  console.log(`   supportsModel("minimax-vision"): ${provider.supportsModel('minimax-vision')}`);
  console.log(`   supportsModel("gpt-4"): ${provider.supportsModel('gpt-4')}`);

  console.log('\n=== 全部测试完成 ===');
}

main().catch(console.error);
