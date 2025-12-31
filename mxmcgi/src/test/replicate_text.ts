/**
 * Replicate 文本模型测试
 * 
 * 测试所有 Replicate 支持的文本生成模型
 */

import dotenv from 'dotenv';
import * as path from 'path';
import { textGeneration as deepseekTextGeneration } from '../core/text/deepseek-r1';
import { textGeneration as geminiTextGeneration, multimodalGeneration as geminiMultimodalGeneration, multiImageGeneration as geminiMultiImageGeneration } from '../core/text/gemini-3-pro';
import { textGeneration as claudeTextGeneration, multimodalGeneration as claudeMultimodalGeneration } from '../core/text/claude-4.5-sonnet';
import { textGeneration as gptTextGeneration, multimodalGeneration as gptMultimodalGeneration } from '../core/text/gpt-5-nano';
// import { formatFileSize } from '../../../moblie/lib/storage/file-utils';

// 加载 .env 文件
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
  path.join(process.cwd(), '../.env'),
];

for (const envPath of envPaths) {
  try {
    dotenv.config({ path: envPath });
    break;
  } catch {
    // 继续尝试下一个路径
  }
}

// 生成唯一 ID 的辅助函数
function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 测试 DeepSeek R1
 */
async function testDeepSeekR1() {
  console.log('\n📝 测试 1: DeepSeek R1');
  console.log('=' .repeat(50));

  try {
    const prompt = '请用简洁的语言解释什么是量子计算，不超过100字。';
    console.log(`提示词: ${prompt}`);
    
    // 测试 1: JSON 模式
    console.log('\n场景 1: JSON 模式（完整返回）');
    console.log('正在生成（JSON 模式）...');

    // const result1 = await deepseekTextGeneration(prompt, {
    //   max_tokens: 500,
    //   temperature: 0.7,
    //   system_prompt: '你是一个专业的科技科普助手，擅长用简洁易懂的语言解释复杂概念。',
    //   outputFormat: 'json',
    // });

    // console.log(`✅ 生成成功！`);
    // console.log(`文本长度: ${result1.text?.length || 0} 字符`);
    // console.log(`使用情况:`, result1.usage);
    // console.log(`\n生成内容:\n${result1.text || ''}`);

    // 测试 2: 流式模式
    console.log('\n场景 2: 流式模式（实时输出）');
    console.log('正在生成（流式模式）...\n');

    const result2 = await deepseekTextGeneration(prompt, {
      max_tokens: 500,
      temperature: 0.7,
      system_prompt: '你是一个专业的科技科普助手，擅长用简洁易懂的语言解释复杂概念。',
      outputFormat: 'stream',
    });

    if (result2.stream) {
      console.log('📡 开始接收流式数据（新格式，包含 status 和 collection）：\n');
      let chunkCount = 0;
      let lastStatus = '';
      let lastCollection = '';
      
      for await (const chunkData of result2.stream) {
        // chunkData 包含: { chunk, status, collection }
        if (chunkData.status !== lastStatus) {
          console.log(`\n[状态变更] ${lastStatus || 'pending'} -> ${chunkData.status}`);
          lastStatus = chunkData.status;
        }
        
        if (chunkData.chunk) {
          process.stdout.write(chunkData.chunk); // 实时输出当前 chunk
          chunkCount++;
        }
        
        // 显示累积的 collection（每 10 个 chunk 显示一次，避免刷屏）
        if (chunkCount % 10 === 0 && chunkData.collection !== lastCollection) {
          console.log(`\n[累积文本长度: ${chunkData.collection.length} 字符]`);
          lastCollection = chunkData.collection;
        }
      }
      
      console.log('\n\n✅ 流式输出完成！');
      console.log(`总片段数: ${chunkCount}`);
      console.log(`最终状态: ${lastStatus}`);
      // 获取最后一个 chunk 的 collection 作为完整内容
      if (lastCollection) {
        console.log(`总文本长度: ${lastCollection.length} 字符`);
        console.log(`\n完整内容:\n${lastCollection}`);
      }
    } else {
      console.log('⚠️  流式模式未返回 stream，使用 JSON 结果');
      console.log(result2.text || '');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Gemini 3 Pro
 */
async function testGemini3Pro() {
  console.log('\n📝 测试 2: Gemini 3 Pro');
  console.log('=' .repeat(50));

  try {
    // 测试 1: 纯文本生成
    console.log('\n场景 1: 纯文本生成');
    const prompt1 = 'What are the key differences between machine learning and deep learning? Explain in detail.';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成...');

    const result1 = await geminiTextGeneration(prompt1, {
      temperature: 0.8,
      max_tokens: 1000,
      system_prompt: 'You are a helpful AI assistant that explains technical concepts clearly and in detail.',
    });

    console.log(`✅ 生成成功！`);
    console.log(`文本长度: ${result1.text?.length || 0} 字符`);
    console.log(`使用情况:`, result1.usage);
    console.log(`\n生成内容:\n${result1.text?.substring(0, 500) || ''}...`);

    // 测试 2: 多模态生成（如果有测试图片）
    console.log('\n场景 2: 多模态生成（文本 + 图片）');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    if (!testImagePath) {
      console.log('⚠️  跳过多模态测试：未设置 TEST_IMAGE_PATH 环境变量');
    } else {
      try {
        const fs = await import('fs/promises');
        await fs.access(testImagePath);
        console.log(`✅ 找到测试图片: ${testImagePath}`);

        // 转换为 base64
        const imageBuffer = await fs.readFile(testImagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = testImagePath.toLowerCase().split('.').pop();
        const mimeType = ext === 'png' ? 'image/png' : 
                         ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'webp' ? 'image/webp' : 'image/png';
        const imageDataUri = `data:${mimeType};base64,${base64}`;

        const result2 = await geminiMultimodalGeneration(
          '请详细描述这张图片的内容，包括主要元素、颜色、风格和可能的场景。',
          imageDataUri,
          {
            temperature: 0.7,
            max_tokens: 500,
          }
        );

        console.log(`✅ 多模态生成成功！`);
        console.log(`文本长度: ${result2.text?.length || 0} 字符`);
        console.log(`\n生成内容:\n${result2.text || ''}`);
      } catch (error) {
        console.error('❌ 多模态测试失败:', error);
      }
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Claude 4.5 Sonnet
 */
async function testClaude45Sonnet() {
  console.log('\n📝 测试 3: Claude 4.5 Sonnet');
  console.log('=' .repeat(50));

  try {
    // 测试 1: JSON 模式（完整返回）
    console.log('\n场景 1: JSON 模式（完整返回）');
    const prompt1 = 'Write a short story about a robot learning to paint, in about 150 words.';
    // console.log(`提示词: ${prompt1}`);
    // console.log('正在生成（JSON 模式）...');

    // const result1 = await claudeTextGeneration(prompt1, {
    //   max_tokens: 500,
    //   system_prompt: 'You are a creative writing assistant. Write engaging and imaginative stories.',
    //   temperature: 0.9,
    //   outputFormat: 'json',
    // });

    // console.log(`✅ 生成成功！`);
    // console.log(`文本长度: ${result1.text?.length || 0} 字符`);
    // console.log(`使用情况:`, result1.usage);
    // console.log(`\n生成内容:\n${result1.text}`);

    // 测试 2: 流式模式
    console.log('\n场景 2: 流式模式（实时输出）');
    const prompt2 = 'Explain the concept of artificial intelligence in simple terms.';
    console.log(`提示词: ${prompt2}`);
    console.log('正在生成（流式模式）...\n');

    const result2 = await claudeTextGeneration(prompt2, {
      max_tokens: 300,
      system_prompt: 'You are a helpful teacher that explains complex concepts simply.',
      temperature: 0.7,
      outputFormat: 'stream',
      enableCollection: false, // 测试：禁用 collection 累积，节省内存
    });

    if (result2.stream) {
      console.log('📡 开始接收流式数据（新格式，包含 status 和 collection）：\n');
      let chunkCount = 0;
      let lastStatus = '';
      let lastCollection = '';
      
      for await (const chunkData of result2.stream) {
        // chunkData 包含: { chunk, status, collection }
        console.log(JSON.stringify(chunkData));
        
        // if (chunkData.chunk) {
        //   process.stdout.write(chunkData.chunk); // 实时输出当前 chunk
        //   chunkCount++;
        // }
        
        // // 显示累积的 collection（每 10 个 chunk 显示一次，避免刷屏）
        // if (chunkCount % 10 === 0 && chunkData.collection !== lastCollection) {
        //   console.log(`\n[累积文本长度: ${chunkData.collection.length} 字符]`);
        //   lastCollection = chunkData.collection;
        // }
      }
      
      console.log('\n\n✅ 流式输出完成！');
      console.log(`总片段数: ${chunkCount}`);
      console.log(`最终状态: ${lastStatus}`);
      // 获取最后一个 chunk 的 collection 作为完整内容
      if (lastCollection) {
        console.log(`总文本长度: ${lastCollection.length} 字符`);
        console.log(`\n完整内容:\n${lastCollection}`);
      }
    } else {
      console.log('⚠️  流式模式未返回 stream，使用 JSON 结果');
      console.log(result2.text || '');
    }

    // 测试 3: 多模态生成（如果有测试图片）
    console.log('\n场景 3: 多模态生成（文本 + 图片）');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    if (!testImagePath) {
      console.log('⚠️  跳过多模态测试：未设置 TEST_IMAGE_PATH 环境变量');
    } else {
      try {
        const fs = await import('fs/promises');
        await fs.access(testImagePath);
        console.log(`✅ 找到测试图片: ${testImagePath}`);

        // 转换为 base64
        const imageBuffer = await fs.readFile(testImagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = testImagePath.toLowerCase().split('.').pop();
        const mimeType = ext === 'png' ? 'image/png' : 
                         ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'webp' ? 'image/webp' : 'image/png';
        const imageDataUri = `data:${mimeType};base64,${base64}`;

        const result3 = await claudeMultimodalGeneration(
          'Analyze this image and describe its artistic style and composition.',
          imageDataUri,
          {
            max_tokens: 300,
            max_image_resolution: 1.0,
          }
        );

        console.log(`✅ 多模态生成成功！`);
        console.log(`文本长度: ${result3.text?.length || 0} 字符`);
        console.log(`\n生成内容:\n${result3.text || ''}`);
      } catch (error) {
        console.error('❌ 多模态测试失败:', error);
      }
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 GPT-5 Nano (GPT-4o Mini)
 */
async function testGPT5Nano() {
  console.log('\n📝 测试 4: GPT-5 Nano (GPT-4o Mini)');
  console.log('=' .repeat(50));

  try {
    // 测试 1: 纯文本生成
    console.log('\n场景 1: 纯文本生成');
    const prompt1 = 'Explain the concept of recursion in programming with a simple example.';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成...');

    // 测试 1: JSON 模式
    console.log('\n场景 1: JSON 模式（完整返回）');
    const result1 = await gptTextGeneration(prompt1, {
      max_completion_tokens: 500,
      temperature: 0.7,
      outputFormat: 'stream',
      system_prompt: 'You are a programming tutor. Explain concepts clearly with examples.',
    });

    console.log(`✅ 生成成功！`);
    console.log(`文本长度: ${result1.text?.length || 0} 字符`);
    console.log(`使用情况:`, result1.usage);
    console.log(`\n生成内容:\n${result1.text || ''}`);

    // 测试 2: 流式模式
    console.log('\n场景 2: 流式模式（实时输出）');
    const prompt2 = 'Write a short story about a robot learning to paint, in about 150 words.';
    console.log(`提示词: ${prompt2}`);
    console.log('正在生成（流式模式）...\n');

    const result2 = await gptTextGeneration(prompt2, {
      max_completion_tokens: 500,
      temperature: 0.7,
      system_prompt: 'You are a creative writing assistant. Write engaging and imaginative stories.',
      outputFormat: 'stream',
      enableCollection: true, // 启用 collection 累积
    });

    if (result2.stream) {
      console.log('📡 开始接收流式数据（新格式，包含 status 和 collection）：\n');
      let chunkCount = 0;
      let lastStatus = '';
      let lastCollection = '';
      
      for await (const chunkData of result2.stream) {
        // chunkData 包含: { chunk, status, collection }
        if (chunkData.status !== lastStatus) {
          console.log(`\n[状态变更] ${lastStatus || 'pending'} -> ${chunkData.status}`);
          lastStatus = chunkData.status;
        }
        
        if (chunkData.chunk) {
          process.stdout.write(chunkData.chunk); // 实时输出当前 chunk
          chunkCount++;
        }
        
        // 显示累积的 collection（每 10 个 chunk 显示一次，避免刷屏）
        if (chunkCount % 10 === 0 && chunkData.collection !== lastCollection) {
          console.log(`\n[累积文本长度: ${chunkData.collection.length} 字符]`);
          lastCollection = chunkData.collection;
        }
      }
      
      console.log('\n\n✅ 流式输出完成！');
      console.log(`总片段数: ${chunkCount}`);
      console.log(`最终状态: ${lastStatus}`);
      // 获取最后一个 chunk 的 collection 作为完整内容
      if (lastCollection) {
        console.log(`总文本长度: ${lastCollection.length} 字符`);
        console.log(`\n完整内容:\n${lastCollection}`);
      }
    } else {
      console.log('⚠️  流式模式未返回 stream，使用 JSON 结果');
      console.log(result2.text || '');
    }

    // 测试 3: 多模态生成（如果有测试图片）
    console.log('\n场景 2: 多模态生成（文本 + 图片）');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    if (!testImagePath) {
      console.log('⚠️  跳过多模态测试：未设置 TEST_IMAGE_PATH 环境变量');
    } else {
      try {
        const fs = await import('fs/promises');
        await fs.access(testImagePath);
        console.log(`✅ 找到测试图片: ${testImagePath}`);

        // 转换为 base64
        const imageBuffer = await fs.readFile(testImagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = testImagePath.toLowerCase().split('.').pop();
        const mimeType = ext === 'png' ? 'image/png' : 
                         ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'webp' ? 'image/webp' : 'image/png';
        const imageDataUri = `data:${mimeType};base64,${base64}`;

        const result2 = await gptMultimodalGeneration(
          'What do you see in this image?',
          [imageDataUri],
          {
            max_completion_tokens: 300,
            temperature: 0.7,
          }
        );

        console.log(`✅ 多模态生成成功！`);
        console.log(`文本长度: ${result2.text?.length || 0} 字符`);
        console.log(`\n生成内容:\n${result2.text || ''}`);
      } catch (error) {
        console.error('❌ 多模态测试失败:', error);
      }
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试所有模型使用不同 provider
 */
async function testProviderSelection() {
  console.log('\n📝 测试 5: Provider 选择');
  console.log('=' .repeat(50));

  try {
    const prompt = 'Hello, how are you?';
    
    // 测试默认 provider (replicate)
    console.log('\n场景 1: 使用默认 provider (replicate)');
    try {
      const result = await deepseekTextGeneration(prompt, {
        max_tokens: 100,
      });
      console.log(`✅ 默认 provider 成功`);
      console.log(`生成内容: ${result.text?.substring(0, 50) || ''}...`);
    } catch (error) {
      console.error('❌ 默认 provider 失败:', error);
    }

    // 测试显式指定 replicate
    console.log('\n场景 2: 显式指定 replicate provider');
    try {
      const result = await deepseekTextGeneration(prompt, {
        max_tokens: 100,
        provider: 'replicate',
      });
      console.log(`✅ Replicate provider 成功`);
      console.log(`生成内容: ${result.text?.substring(0, 50) || ''}...`);
    } catch (error) {
      console.error('❌ Replicate provider 失败:', error);
    }

    // 测试不支持的 provider
    console.log('\n场景 3: 测试不支持的 provider (ppio)');
    try {
      await deepseekTextGeneration(prompt, {
        max_tokens: 100,
        provider: 'ppio',
      });
      console.log('⚠️  意外成功（ppio 不应该支持 deepseek-r1）');
    } catch (error) {
      console.log(`✅ 正确抛出错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// ==================== 主函数 ====================

async function main() {
  console.log('🚀 Replicate 文本模型测试开始');
  console.log('=' .repeat(50));

  // 检查环境变量
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ 错误: 未设置 REPLICATE_API_TOKEN 环境变量');
    console.log('   请在 .env 文件中设置: REPLICATE_API_TOKEN=your-token');
    console.log('   获取 Token: https://replicate.com/account/api-tokens');
    console.log(`   当前工作目录: ${process.cwd()}`);
    process.exit(1);
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN!;
  console.log(`✅ 已找到 REPLICATE_API_TOKEN (长度: ${replicateToken.length})`);

  try {
    // 运行测试
    // await testDeepSeekR1();
    // await testGemini3Pro();
    // await testClaude45Sonnet();
    // await testGPT5Nano();
    await testProviderSelection();

    console.log('\n' + '=' .repeat(50));
    console.log('✅ 所有测试完成！');
  } catch (error) {
    console.error('\n❌ 测试过程中出现错误:', error);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(console.error);
}
