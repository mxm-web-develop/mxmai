/**
 * DeerAPI 模型测试
 * 
 * 测试所有 DeerAPI 支持的模型（图片生成和文本生成）
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { providerFactory } from '../core/providers';
import type { GenerateParams } from '../core/providers';

// 加载 .env 文件
// 获取可能的 .env 文件路径
const currentDir = process.cwd();
const testDir = __dirname;
const rootDir = path.resolve(testDir, '../..');

const envPaths = [
  path.join(currentDir, '.env'),              // 当前工作目录的 .env
  path.join(rootDir, '.env'),                 // 项目根目录的 .env
  path.join(testDir, '../../.env'),           // 从 test 目录向上找
  path.join(testDir, '../../../.env'),        // 从 test 目录向上找（根目录）
];

// 去重
const uniqueEnvPaths = [...new Set(envPaths)];

let envLoaded = false;
let loadedPath = '';

for (const envPath of uniqueEnvPaths) {
  try {
    const fs = require('fs');
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath });
      if (!result.error) {
        console.log(`✅ 已加载 .env 文件: ${envPath}`);
        envLoaded = true;
        loadedPath = envPath;
        break;
      }
    }
  } catch (error) {
    // 继续尝试下一个路径
  }
}

// 如果还没加载，尝试默认加载（从当前工作目录）
if (!envLoaded) {
  try {
    const result = dotenv.config();
    if (!result.error) {
      console.log(`✅ 已加载默认 .env 文件（从当前工作目录）`);
      envLoaded = true;
    }
  } catch (error) {
    // 忽略错误
  }
}

// 调试信息：显示所有尝试的路径
if (process.env.DEBUG_ENV) {
  console.log('\n🔍 环境变量加载调试信息:');
  console.log('当前工作目录:', currentDir);
  console.log('测试文件目录:', testDir);
  console.log('项目根目录:', rootDir);
  console.log('尝试的 .env 路径:');
  uniqueEnvPaths.forEach(p => {
    const fs = require('fs');
    const exists = fs.existsSync(p);
    console.log(`  ${exists ? '✅' : '❌'} ${p}`);
  });
  console.log('已加载的路径:', loadedPath || '(默认)');
  console.log('DEERAPI_API_KEY:', process.env.DEERAPI_API_KEY ? `已设置 (长度: ${process.env.DEERAPI_API_KEY.length})` : '未设置');
  console.log('DEERAPI_BASE_URL:', process.env.DEERAPI_BASE_URL || '未设置');
  console.log('');
}

// 生成唯一 ID 的辅助函数
function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取输出目录路径（测试文件同级目录下的 generated_images 文件夹）
 */
function getOutputDir(): string {
  return path.join(__dirname, 'generated_images');
}

/**
 * 下载图片并保存到本地
 */
async function downloadAndSaveImage(url: string, filename: string, modelName: string): Promise<string> {
  try {
    const outputDir = getOutputDir();
    const modelDir = path.join(outputDir, modelName);
    
    // 确保输出目录存在
    await fs.mkdir(modelDir, { recursive: true });
    
    // 下载图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 确定文件扩展名
    const urlPath = new URL(url).pathname;
    const ext = urlPath.split('.').pop()?.toLowerCase() || 'png';
    const filePath = path.join(modelDir, `${filename}.${ext}`);
    
    // 保存文件
    await fs.writeFile(filePath, buffer);
    
    return filePath;
  } catch (error) {
    throw new Error(`保存图片失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 保存图片列表到本地
 */
async function saveImages(imageUrls: string[], modelName: string, prefix: string = ''): Promise<void> {
  const outputDir = getOutputDir();
  console.log(`\n💾 正在保存图片到: ${outputDir}/${modelName}`);
  
  if (!imageUrls || imageUrls.length === 0) {
    console.warn(`  ⚠️  警告：没有图片需要保存（imageUrls 为空或长度为 0）`);
    console.warn(`     请检查模型输出是否正确解析`);
    return;
  }
  
  console.log(`  找到 ${imageUrls.length} 张图片，开始下载...`);
  
  for (let index = 0; index < imageUrls.length; index++) {
    const url = imageUrls[index];
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      console.warn(`  ⚠️  跳过无效的 URL (索引 ${index}): ${url}`);
      continue;
    }
    
    const filename = `${prefix}${prefix ? '-' : ''}${generateUniqueId()}-${index + 1}`;
    try {
      const savedPath = await downloadAndSaveImage(url, filename, modelName);
      console.log(`  ✅ 图片 ${index + 1} 已保存: ${savedPath}`);
      console.log(`     URL: ${url}`);
    } catch (error) {
      console.error(`  ❌ 图片 ${index + 1} 保存失败: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`     URL: ${url}`);
    }
  }
}

/**
 * 测试 Nano Banana (图片生成)
 */
async function testNanoBanana() {
  console.log('\n🖼️  测试 1: Nano Banana (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'nano-banana';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "A beautiful sunset over the ocean with birds flying"`);
    console.log('正在生成图片...');
    
    const params: GenerateParams = {
      prompt: 'A beautiful sunset over the ocean with birds flying',
      parameters: {
        aspect_ratio: '16:9',
      },
      enableProgress: true,
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    console.log(`生成图片数量: ${result.mediaUrls.length}`);
    
    if (result.mediaUrls.length > 0) {
      await saveImages(result.mediaUrls, 'deerapi-nano-banana', 'text-to-image');
    } else {
      console.warn('⚠️  未生成任何图片');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Flux 2 Flex (图片生成)
 */
async function testFlux2Flex() {
  console.log('\n🖼️  测试 2: Flux 2 Flex (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'flux-2-flex';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "A futuristic cityscape at night with neon lights"`);
    console.log('正在生成图片...');
    
    const params: GenerateParams = {
      prompt: 'A futuristic cityscape at night with neon lights',
      parameters: {
        aspect_ratio: '16:9',
      },
      enableProgress: true,
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    console.log(`生成图片数量: ${result.mediaUrls.length}`);
    
    if (result.mediaUrls.length > 0) {
      await saveImages(result.mediaUrls, 'deerapi-flux-2-flex', 'text-to-image');
    } else {
      console.warn('⚠️  未生成任何图片');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Flux 2 Pro (图片生成)
 */
async function testFlux2Pro() {
  console.log('\n🖼️  测试 3: Flux 2 Pro (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'flux-2-pro';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "A serene mountain landscape with a lake reflection"`);
    console.log('正在生成图片...');
    
    const params: GenerateParams = {
      prompt: 'A serene mountain landscape with a lake reflection',
      parameters: {
        aspect_ratio: '16:9',
      },
      enableProgress: true,
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    console.log(`生成图片数量: ${result.mediaUrls.length}`);
    
    if (result.mediaUrls.length > 0) {
      await saveImages(result.mediaUrls, 'deerapi-flux-2-pro', 'text-to-image');
    } else {
      console.warn('⚠️  未生成任何图片');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Flux Fast (图片生成)
 */
async function testFluxFast() {
  console.log('\n🖼️  测试 4: Flux Fast (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'flux-fast';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "A cute cat playing with a ball of yarn"`);
    console.log('正在生成图片...');
    
    const params: GenerateParams = {
      prompt: 'A cute cat playing with a ball of yarn',
      parameters: {
        aspect_ratio: '1:1',
      },
      enableProgress: true,
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    console.log(`生成图片数量: ${result.mediaUrls.length}`);
    
    if (result.mediaUrls.length > 0) {
      await saveImages(result.mediaUrls, 'deerapi-flux-fast', 'text-to-image');
    } else {
      console.warn('⚠️  未生成任何图片');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 GPT-5 Nano (文本生成)
 */
async function testGPT5Nano() {
  console.log('\n📝 测试 5: GPT-5 Nano (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'gpt-5-nano';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "Write a short story about a robot learning to paint"`);
    console.log('正在生成文本...');
    
    const params: GenerateParams = {
      prompt: 'Write a short story about a robot learning to paint',
      parameters: {
        temperature: 0.7,
        max_tokens: 500,
      },
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    
    // 文本结果可能在 metadata 中或通过类型断言访问
    const text = (result as any).text || result.metadata?.text || '';
    if (text) {
      console.log(`\n生成的文本:`);
      console.log('-'.repeat(50));
      console.log(text);
      console.log('-'.repeat(50));
    } else {
      console.warn('⚠️  未生成文本内容');
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Claude 4.5 Sonnet (文本生成)
 */
async function testClaude45Sonnet() {
  console.log('\n📝 测试 6: Claude 4.5 Sonnet (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'claude-4.5-sonnet';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "Explain quantum computing in simple terms"`);
    console.log('正在生成文本...');
    
    const params: GenerateParams = {
      prompt: 'Explain quantum computing in simple terms',
      parameters: {
        temperature: 0.7,
        max_tokens: 500,
      },
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    
    const text = (result as any).text || result.metadata?.text || '';
    if (text) {
      console.log(`\n生成的文本:`);
      console.log('-'.repeat(50));
      console.log(text);
      console.log('-'.repeat(50));
    } else {
      console.warn('⚠️  未生成文本内容');
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 DeepSeek R1 (文本生成)
 */
async function testDeepSeekR1() {
  console.log('\n📝 测试 7: DeepSeek R1 (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'deepseek-r1';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "What are the benefits of renewable energy?"`);
    console.log('正在生成文本...');
    
    const params: GenerateParams = {
      prompt: 'What are the benefits of renewable energy?',
      parameters: {
        temperature: 0.7,
        max_tokens: 500,
      },
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    
    const text = (result as any).text || result.metadata?.text || '';
    if (text) {
      console.log(`\n生成的文本:`);
      console.log('-'.repeat(50));
      console.log(text);
      console.log('-'.repeat(50));
    } else {
      console.warn('⚠️  未生成文本内容');
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Gemini 2.5 Flash (文本生成)
 */
async function testGemini25Flash() {
  console.log('\n📝 测试 8: Gemini 2.5 Flash (DeerAPI)');
  console.log('='.repeat(50));
  
  try {
    const modelName = 'gemini-2.5-flash';
    const provider = providerFactory.getProviderForModel(modelName, 'deer');
    
    console.log(`✅ 找到 provider: ${provider.name}`);
    console.log(`📝 提示词: "Describe the process of photosynthesis"`);
    console.log('正在生成文本...');
    
    const params: GenerateParams = {
      prompt: 'Describe the process of photosynthesis',
      parameters: {
        temperature: 0.7,
        max_tokens: 500,
      },
    };
    
    const result = await provider.generate(modelName, params);
    
    console.log(`✅ 生成成功！`);
    
    const text = (result as any).text || result.metadata?.text || '';
    if (text) {
      console.log(`\n生成的文本:`);
      console.log('-'.repeat(50));
      console.log(text);
      console.log('-'.repeat(50));
    } else {
      console.warn('⚠️  未生成文本内容');
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始测试 DeerAPI 模型');
  console.log('='.repeat(50));

  // 检查环境变量
  if (!process.env.DEERAPI_API_KEY) {
    console.error('❌ 错误: 未找到 DEERAPI_API_KEY 环境变量');
    console.log('请在 .env 文件中设置 DEERAPI_API_KEY');
    process.exit(1);
  }

  if (!process.env.DEERAPI_BASE_URL) {
    console.error('❌ 错误: 未找到 DEERAPI_BASE_URL 环境变量');
    console.log('请在 .env 文件中设置 DEERAPI_BASE_URL (默认: https://api.deerapi.com)');
    process.exit(1);
  }

  // 检查环境变量（重新加载一次确保）
  // 如果还没加载，再次尝试从常见位置加载
  if (!process.env.DEERAPI_API_KEY) {
    // 再次尝试加载
    const fs = require('fs');
    const possiblePaths = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '../../.env'),
      path.join(__dirname, '../../../.env'),
    ];
    
    for (const envPath of possiblePaths) {
      if (fs.existsSync(envPath)) {
        console.log(`🔄 重新尝试加载 .env: ${envPath}`);
        dotenv.config({ path: envPath, override: true });
        if (process.env.DEERAPI_API_KEY) {
          console.log(`✅ 成功加载环境变量`);
          break;
        }
      }
    }
  }
  
  const apiKey = process.env.DEERAPI_API_KEY;
  const baseUrl = process.env.DEERAPI_BASE_URL || 'https://api.deerapi.com';
  
  if (apiKey) {
    console.log(`✅ 已找到 DEERAPI_API_KEY (长度: ${apiKey.length})`);
    console.log(`✅ 已找到 DEERAPI_BASE_URL: ${baseUrl}`);
  } else {
    console.error('❌ 错误: DEERAPI_API_KEY 未设置');
    console.log('\n当前环境变量检查:');
    console.log('  DEERAPI_API_KEY:', process.env.DEERAPI_API_KEY || '(未设置)');
    console.log('  DEERAPI_BASE_URL:', process.env.DEERAPI_BASE_URL || '(未设置)');
    console.log('\n尝试的 .env 文件路径:');
    const fs = require('fs');
    const allPaths = [
      path.join(process.cwd(), '.env'),
      path.join(__dirname, '../../.env'),
      path.join(__dirname, '../../../.env'),
    ];
    allPaths.forEach(p => {
      const exists = fs.existsSync(p);
      console.log(`  ${exists ? '✅' : '❌'} ${p}`);
      if (exists) {
        try {
          const content = fs.readFileSync(p, 'utf-8');
          const hasKey = content.includes('DEERAPI_API_KEY');
          console.log(`     ${hasKey ? '✅' : '❌'} 包含 DEERAPI_API_KEY`);
        } catch (e) {
          console.log(`     ⚠️  无法读取文件`);
        }
      }
    });
    console.log('\n提示: 请确保 .env 文件在正确的位置，并且包含 DEERAPI_API_KEY 变量');
    process.exit(1);
  }

  try {
    // 图片生成模型测试
    console.log('\n📸 ========== 图片生成模型测试 ==========');
    await testNanoBanana();
    // await testFlux2Flex();
    // await testFlux2Pro();
    // await testFluxFast();

    // 文本生成模型测试
    console.log('\n📝 ========== 文本生成模型测试 ==========');
    // await testGPT5Nano();
    // await testClaude45Sonnet();
    // await testDeepSeekR1();
    // await testGemini25Flash();

    console.log('\n' + '='.repeat(50));
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
