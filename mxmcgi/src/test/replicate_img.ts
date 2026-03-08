/**
 * Replicate 图片生成模型测试
 * 
 * 测试所有 Replicate 支持的图片生成模型
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runByModelKey } from '../models/run';

// 单轨：通过 registry 执行，兼容旧测试的 textToImage/editImage 等语义
async function graphGenerate(modelKey: string, params: Record<string, any>) {
  const r = await runByModelKey('graph', modelKey, params, undefined);
  return { ...r, image_urls: (r as any).mediaUrls || (r as any).image_urls || [] };
}
const nanoBananaTextToImage = (p: string, o?: any) => graphGenerate('nano-banana', { prompt: p, ...o });
const nanoBananaEditImage = (p: string, img: string, o?: any) => graphGenerate('nano-banana', { prompt: p, parameters: { image: img }, ...o });
const nanoBananaMultiImage = (p: string, o?: any) => graphGenerate('nano-banana', { prompt: p, ...o });
// flux-kontext-fast 已禁用，用 flux-fast 占位
const fluxKontextFastTextToImage = (p: string, o?: any) => graphGenerate('flux-fast', { prompt: p, ...o });
const fluxKontextFastEditImage = (p: string, img: string, o?: any) => graphGenerate('flux-fast', { prompt: p, parameters: { input_image: img }, ...o });
const ideogramTextToImage = (p: string, o?: any) => graphGenerate('ideogram-v2a', { prompt: p, ...o });
const recraftTextToImage = (p: string, o?: any) => graphGenerate('recraft-crisp-upscale', { prompt: p, ...o });
const recraftUpscaleImage = (img: string, o?: any) => graphGenerate('recraft-crisp-upscale', { prompt: '', parameters: { image: img }, ...o });
const fluxFastTextToImage = (p: string, o?: any) => graphGenerate('flux-fast', { prompt: p, ...o });
const seedream4TextToImage = (p: string, o?: any) => graphGenerate('seedream-4', { prompt: p, ...o });
const seedream4EditImage = (p: string, img: string, o?: any) => graphGenerate('seedream-4', { prompt: p, parameters: { image_input: [img] }, ...o });
const seedream4MultiReference = (p: string, imgs: string[], o?: any) => graphGenerate('seedream-4', { prompt: p, parameters: { image_input: imgs }, ...o });

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
 * 测试 Nano Banana (Gemini 3 Pro Image Preview)
 */
async function testNanoBanana() {
  console.log('\n🖼️  测试 1: Nano Banana (Gemini 3 Pro Image Preview)');
  console.log('='.repeat(50));

  try {
    // 测试 1: 文本生成图片
    console.log('\n场景 1: 文本生成图片');
    const prompt1 = '一组风格统一的插图，用于AI生图软件的模型介绍，四个不同的模型分别是:标准，快速，动漫，专业，简约大气';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成图片...');

    // 使用 generate 函数以支持进度监控
    const result1 = await graphGenerate('nano-banana', {
      prompt: prompt1,
      aspect_ratio: '16:9',
      // image_size: '1K', // Replicate 的 nano-banana-pro 不支持此参数
      enableProgress: true, // 启用进度监控
    });

    // 如果有进度流，监控进度
    if (result1.progress) {
      console.log('📊 开始监控生成进度...\n');
      
      for await (const progressEvent of result1.progress) {
        const progressBar = progressEvent.progress 
          ? `[${'='.repeat(Math.floor(progressEvent.progress / 5))}${' '.repeat(20 - Math.floor(progressEvent.progress / 5))}] ${progressEvent.progress}%`
          : '';
        
        console.log(`状态: ${progressEvent.status} ${progressBar}`);
        
        if (progressEvent.logs) {
          // logs 可能是数组或字符串
          const logsArray = Array.isArray(progressEvent.logs) 
            ? progressEvent.logs 
            : [progressEvent.logs];
          
          if (logsArray.length > 0) {
            logsArray.forEach((log: string) => {
              console.log(`  📝 ${log}`);
            });
          }
        }
        
        if (progressEvent.output) {
          console.log(`  ✅ 部分输出已生成`);
        }
        
        if (progressEvent.error) {
          console.error(`  ❌ 错误: ${progressEvent.error}`);
        }
        
        // 如果完成，显示最终结果并保存图片
        if (progressEvent.status === 'succeeded' && progressEvent.output) {
          const finalUrls = Array.isArray(progressEvent.output) 
            ? progressEvent.output 
            : [progressEvent.output];
          console.log(`\n✅ 生成成功！`);
          console.log(`生成图片数量: ${finalUrls.length}`);
          await saveImages(finalUrls, 'nano-banana', 'text-to-image');
          break;
        }
      }
    } else {
      // 如果没有进度流，直接显示结果并保存图片
      console.log(`✅ 生成成功！`);
      console.log(`生成图片数量: ${result1.image_urls.length}`);
      await saveImages(result1.image_urls, 'nano-banana', 'text-to-image');
    }

    // 测试 2: 图片编辑（如果有测试图片）
    console.log('\n场景 2: 图片编辑');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    if (!testImagePath) {
      console.log('⚠️  跳过图片编辑测试：未设置 TEST_IMAGE_PATH 环境变量');
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
        const imageBase64 = `data:${mimeType};base64,${base64}`;

        const editPrompt = 'Add a rainbow in the sky';
        console.log(`编辑提示词: ${editPrompt}`);
        console.log('正在编辑图片...');

        const result2 = await nanoBananaEditImage(editPrompt, imageBase64, {
          aspect_ratio: '16:9',
          image_size: '1K',
        });

        console.log(`✅ 编辑成功！`);
        console.log(`生成图片数量: ${result2.image_urls.length}`);
        await saveImages(result2.image_urls, 'nano-banana', 'edit');
      } catch (error) {
        console.log(`⚠️  图片编辑测试失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 测试 3: 多图理解和合成（如果有测试图片）
    console.log('\n场景 3: 多图理解和合成');
    if (!testImagePath) {
      console.log('⚠️  跳过多图测试：未设置 TEST_IMAGE_PATH 环境变量');
    } else {
      try {
        const fs = await import('fs/promises');
        const imageBuffer = await fs.readFile(testImagePath);
        const base64 = imageBuffer.toString('base64');
        const ext = testImagePath.toLowerCase().split('.').pop();
        const mimeType = ext === 'png' ? 'image/png' : 
                         ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                         ext === 'webp' ? 'image/webp' : 'image/png';
        const imageBase64 = `data:${mimeType};base64,${base64}`;

        const multiPrompt = 'Combine these images into a collage showing different perspectives';
        console.log(`多图提示词: ${multiPrompt}`);
        console.log('正在处理多图...');

        // 使用同一张图片两次作为示例
        const result3 = await nanoBananaMultiImage(multiPrompt, [imageBase64, imageBase64], {
          aspect_ratio: '16:9',
          image_size: '1K',
        });

        console.log(`✅ 多图处理成功！`);
        console.log(`生成图片数量: ${result3.image_urls.length}`);
        await saveImages(result3.image_urls, 'nano-banana', 'multi-image');
      } catch (error) {
        console.log(`⚠️  多图测试失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Flux Kontext Fast
 */
async function testFluxKontextFast() {
  console.log('\n🖼️  测试 2: Flux Kontext Fast');
  console.log('='.repeat(50));

  try {
    // 测试 1: 文本生成图片
    console.log('\n场景 1: 文本生成图片');
    const prompt1 = 'A futuristic cityscape at night with neon lights and flying cars';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成图片...');

    // 使用 generate 函数以支持进度监控
    const result1 = await graphGenerate('flux-fast', {
      prompt: prompt1,
      aspect_ratio: '16:9',
      num_outputs: 1,
      output_format: 'png',
      enableProgress: true, // 启用进度监控
    });

    // 如果有进度流，监控进度
    if (result1.progress) {
      console.log('📊 开始监控生成进度...\n');
      
      for await (const progressEvent of result1.progress) {
        const progressBar = progressEvent.progress 
          ? `[${'='.repeat(Math.floor(progressEvent.progress / 5))}${' '.repeat(20 - Math.floor(progressEvent.progress / 5))}] ${progressEvent.progress}%`
          : '';
        
        console.log(`状态: ${progressEvent.status} ${progressBar}`);
        
        if (progressEvent.logs) {
          const logsArray = Array.isArray(progressEvent.logs) 
            ? progressEvent.logs 
            : [progressEvent.logs];
          
          if (logsArray.length > 0) {
            logsArray.forEach((log: string) => {
              console.log(`  📝 ${log}`);
            });
          }
        }
        
        if (progressEvent.output) {
          console.log(`  ✅ 部分输出已生成`);
        }
        
        if (progressEvent.error) {
          console.error(`  ❌ 错误: ${progressEvent.error}`);
        }
        
        // 如果完成，显示最终结果并保存图片
        if (progressEvent.status === 'succeeded' && progressEvent.output) {
          const finalUrls = Array.isArray(progressEvent.output) 
            ? progressEvent.output 
            : [progressEvent.output];
          console.log(`\n✅ 生成成功！`);
          console.log(`生成图片数量: ${finalUrls.length}`);
          await saveImages(finalUrls, 'flux-kontext-fast', 'text-to-image');
          break;
        }
      }
    } else {
      // 如果没有进度流，直接使用结果
      console.log(`✅ 生成成功！`);
      console.log(`生成图片数量: ${result1.image_urls.length}`);
      await saveImages(result1.image_urls, 'flux-kontext-fast', 'text-to-image');
    }

    // 测试 2: 图片编辑（如果有测试图片）
    console.log('\n场景 2: 图片编辑');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    // if (!testImagePath) {
    //   console.log('⚠️  跳过图片编辑测试：未设置 TEST_IMAGE_PATH 环境变量');
    // } else {
    //   try {
    //     const fs = await import('fs/promises');
    //     await fs.access(testImagePath);
    //     console.log(`✅ 找到测试图片: ${testImagePath}`);

    //     // 转换为 base64
    //     const imageBuffer = await fs.readFile(testImagePath);
    //     const base64 = imageBuffer.toString('base64');
    //     const ext = testImagePath.toLowerCase().split('.').pop();
    //     const mimeType = ext === 'png' ? 'image/png' : 
    //                      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
    //                      ext === 'webp' ? 'image/webp' : 'image/png';
    //     const imageBase64 = `data:${mimeType};base64,${base64}`;

    //     const editPrompt = 'Transform this into a cyberpunk style';
    //     console.log(`编辑提示词: ${editPrompt}`);
    //     console.log('正在编辑图片...');

    //     const result2 = await fluxKontextFastEditImage(editPrompt, imageBase64, {
    //       aspect_ratio: '16:9',
    //       num_outputs: 1,
    //       output_format: 'png',
    //     });

    //     console.log(`✅ 编辑成功！`);
    //     console.log(`生成图片数量: ${result2.image_urls.length}`);
    //     await saveImages(result2.image_urls, 'flux-kontext-fast', 'edit');
    //   } catch (error) {
    //     console.log(`⚠️  图片编辑测试失败: ${error instanceof Error ? error.message : String(error)}`);
    //   }
    // }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Ideogram V2A
 */
async function testIdeogramV2A() {
  console.log('\n🖼️  测试 3: Ideogram V2A');
  console.log('='.repeat(50));

  try {
    // 测试：文本生成图片（擅长生成日漫卡通风格）
    console.log('\n场景: 文本生成图片（日漫卡通风格）');
    const prompt1 = 'A cute anime girl with long pink hair, big sparkling eyes, wearing a school uniform, cherry blossoms in the background, kawaii style, vibrant colors, detailed illustration';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成图片...');

    // 使用 generate 函数以支持进度监控
    const result1 = await graphGenerate('ideogram-v2a', {
      prompt: prompt1,
      aspect_ratio: '16:9',
      style_type: 'Anime', // 使用 Anime 风格类型（注意：API 要求首字母大写）
      num_images: 1,
      turbo: false, // 使用高质量模式
      enableProgress: true, // 启用进度监控
    });

    // 如果有进度流，监控进度
    if (result1.progress) {
      console.log('📊 开始监控生成进度...\n');
      
      for await (const progressEvent of result1.progress) {
        const progressBar = progressEvent.progress 
          ? `[${'='.repeat(Math.floor(progressEvent.progress / 5))}${' '.repeat(20 - Math.floor(progressEvent.progress / 5))}] ${progressEvent.progress}%`
          : '';
        
        console.log(`状态: ${progressEvent.status} ${progressBar}`);
        
        if (progressEvent.logs) {
          const logsArray = Array.isArray(progressEvent.logs) 
            ? progressEvent.logs 
            : [progressEvent.logs];
          
          if (logsArray.length > 0) {
            logsArray.forEach((log: string) => {
              console.log(`  📝 ${log}`);
            });
          }
        }
        
        if (progressEvent.output) {
          console.log(`  ✅ 部分输出已生成`);
        }
        
        if (progressEvent.error) {
          console.error(`  ❌ 错误: ${progressEvent.error}`);
        }
        
        // 如果完成，显示最终结果并保存图片
        if (progressEvent.status === 'succeeded' && progressEvent.output) {
          const finalUrls = Array.isArray(progressEvent.output) 
            ? progressEvent.output 
            : [progressEvent.output];
          console.log(`\n✅ 生成成功！`);
          console.log(`生成图片数量: ${finalUrls.length}`);
          await saveImages(finalUrls, 'ideogram-v2a', 'text-to-image');
          break;
        }
      }
    } else {
      // 如果没有进度流，直接使用结果
      console.log(`✅ 生成成功！`);
      console.log(`生成图片数量: ${result1.image_urls.length}`);
      await saveImages(result1.image_urls, 'ideogram-v2a', 'text-to-image');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Recraft Crisp Upscale
 */
async function testRecraftCrispUpscale() {
  console.log('\n🖼️  测试 4: Recraft Crisp Upscale');
  console.log('='.repeat(50));

  try {
    // 测试 1: 文本生成图片
    console.log('\n场景 1: 文本生成图片');
    const prompt1 = 'A detailed illustration of a magical forest with glowing mushrooms and fireflies';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成图片...');

    // 使用 generate 函数以支持进度监控
    const result1 = await graphGenerate('recraft-crisp-upscale', {
      prompt: prompt1,
      image_size: 'square_hd',
      style: 'digital_illustration',
      num_images: 1,
      enableProgress: true, // 启用进度监控
    });

    // 如果有进度流，监控进度
    if (result1.progress) {
      console.log('📊 开始监控生成进度...\n');
      
      for await (const progressEvent of result1.progress) {
        const progressBar = progressEvent.progress 
          ? `[${'='.repeat(Math.floor(progressEvent.progress / 5))}${' '.repeat(20 - Math.floor(progressEvent.progress / 5))}] ${progressEvent.progress}%`
          : '';
        
        console.log(`状态: ${progressEvent.status} ${progressBar}`);
        
        if (progressEvent.logs) {
          const logsArray = Array.isArray(progressEvent.logs) 
            ? progressEvent.logs 
            : [progressEvent.logs];
          
          if (logsArray.length > 0) {
            logsArray.forEach((log: string) => {
              console.log(`  📝 ${log}`);
            });
          }
        }
        
        if (progressEvent.output) {
          console.log(`  ✅ 部分输出已生成`);
        }
        
        if (progressEvent.error) {
          console.error(`  ❌ 错误: ${progressEvent.error}`);
        }
        
        // 如果完成，显示最终结果并保存图片
        if (progressEvent.status === 'succeeded' && progressEvent.output) {
          const finalUrls = Array.isArray(progressEvent.output) 
            ? progressEvent.output 
            : [progressEvent.output];
          console.log(`\n✅ 生成成功！`);
          console.log(`生成图片数量: ${finalUrls.length}`);
          await saveImages(finalUrls, 'recraft-crisp-upscale', 'text-to-image');
          break;
        }
      }
    } else {
      // 如果没有进度流，直接使用结果
      console.log(`✅ 生成成功！`);
      console.log(`生成图片数量: ${result1.image_urls.length}`);
      await saveImages(result1.image_urls, 'recraft-crisp-upscale', 'text-to-image');
    }

    // 测试 2: 图片放大（如果有测试图片）
    console.log('\n场景 2: 图片放大');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    if (!testImagePath) {
      console.log('⚠️  跳过图片放大测试：未设置 TEST_IMAGE_PATH 环境变量');
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
        const imageBase64 = `data:${mimeType};base64,${base64}`;

        console.log('正在放大图片...');

        const result2 = await recraftUpscaleImage(imageBase64, {
          style: 'realistic_image',
        });

        console.log(`✅ 放大成功！`);
        console.log(`生成图片数量: ${result2.image_urls.length}`);
        await saveImages(result2.image_urls, 'recraft-crisp-upscale', 'upscale');
      } catch (error) {
        console.log(`⚠️  图片放大测试失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Flux Fast
 */
async function testFluxFast() {
  console.log('\n🖼️  测试 5: Flux Fast');
  console.log('='.repeat(50));

  try {
    // 测试：文本生成图片
    console.log('\n场景: 文本生成图片');
    const prompt1 = 'A serene Japanese garden with cherry blossoms, koi pond, and traditional architecture';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成图片...');

    // 使用 generate 函数以支持进度监控
    const result1 = await graphGenerate('flux-fast', {
      prompt: prompt1,
      aspect_ratio: '16:9',
      num_outputs: 1,
      output_format: 'png',
      enableProgress: true, // 启用进度监控
    });

    // 如果有进度流，监控进度
    if (result1.progress) {
      console.log('📊 开始监控生成进度...\n');
      
      for await (const progressEvent of result1.progress) {
        const progressBar = progressEvent.progress 
          ? `[${'='.repeat(Math.floor(progressEvent.progress / 5))}${' '.repeat(20 - Math.floor(progressEvent.progress / 5))}] ${progressEvent.progress}%`
          : '';
        
        console.log(`状态: ${progressEvent.status} ${progressBar}`);
        
        if (progressEvent.logs) {
          const logsArray = Array.isArray(progressEvent.logs) 
            ? progressEvent.logs 
            : [progressEvent.logs];
          
          if (logsArray.length > 0) {
            logsArray.forEach((log: string) => {
              console.log(`  📝 ${log}`);
            });
          }
        }
        
        if (progressEvent.output) {
          console.log(`  ✅ 部分输出已生成`);
        }
        
        if (progressEvent.error) {
          console.error(`  ❌ 错误: ${progressEvent.error}`);
        }
        
        // 如果完成，显示最终结果并保存图片
        if (progressEvent.status === 'succeeded' && progressEvent.output) {
          const finalUrls = Array.isArray(progressEvent.output) 
            ? progressEvent.output 
            : [progressEvent.output];
          console.log(`\n✅ 生成成功！`);
          console.log(`生成图片数量: ${finalUrls.length}`);
          await saveImages(finalUrls, 'flux-fast', 'text-to-image');
          break;
        }
      }
    } else {
      // 如果没有进度流，直接使用结果
      console.log(`✅ 生成成功！`);
      console.log(`生成图片数量: ${result1.image_urls.length}`);
      await saveImages(result1.image_urls, 'flux-fast', 'text-to-image');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 Seedream 4
 */
async function testSeedream4() {
  console.log('\n🖼️  测试 6: Seedream 4');
  console.log('='.repeat(50));

  try {
    // 测试 1: 文本生成图片
    console.log('\n场景 1: 文本生成图片');
    const prompt1 = 'A majestic dragon flying over a medieval castle at sunset';
    console.log(`提示词: ${prompt1}`);
    console.log('正在生成图片...');

    // 使用 generate 函数以支持进度监控
    const result1 = await graphGenerate('seedream-4', {
      prompt: prompt1,
      size: '2K',
      aspect_ratio: '16:9',
      enableProgress: true, // 启用进度监控
    });

    // 如果有进度流，监控进度
    if (result1.progress) {
      console.log('📊 开始监控生成进度...\n');
      
      for await (const progressEvent of result1.progress) {
        const progressBar = progressEvent.progress 
          ? `[${'='.repeat(Math.floor(progressEvent.progress / 5))}${' '.repeat(20 - Math.floor(progressEvent.progress / 5))}] ${progressEvent.progress}%`
          : '';
        
        console.log(`状态: ${progressEvent.status} ${progressBar}`);
        
        if (progressEvent.logs) {
          const logsArray = Array.isArray(progressEvent.logs) 
            ? progressEvent.logs 
            : [progressEvent.logs];
          
          if (logsArray.length > 0) {
            logsArray.forEach((log: string) => {
              console.log(`  📝 ${log}`);
            });
          }
        }
        
        if (progressEvent.output) {
          console.log(`  ✅ 部分输出已生成`);
        }
        
        if (progressEvent.error) {
          console.error(`  ❌ 错误: ${progressEvent.error}`);
        }
        
        // 如果完成，显示最终结果并保存图片
        if (progressEvent.status === 'succeeded' && progressEvent.output) {
          // Seedream 4 返回 { items: [...] } 格式
          let finalUrls: string[] = [];
          if (Array.isArray(progressEvent.output)) {
            finalUrls = progressEvent.output.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
          } else if (typeof progressEvent.output === 'object' && progressEvent.output.items) {
            finalUrls = Array.isArray(progressEvent.output.items)
              ? progressEvent.output.items.filter((url: any): url is string => typeof url === 'string' && url.length > 0)
              : [];
          } else if (typeof progressEvent.output === 'string') {
            finalUrls = [progressEvent.output];
          }
          
          console.log(`\n✅ 生成成功！`);
          console.log(`生成图片数量: ${finalUrls.length}`);
          await saveImages(finalUrls, 'seedream-4', 'text-to-image');
          break;
        }
      }
    } else {
      // 如果没有进度流，直接使用结果
      console.log(`✅ 生成成功！`);
      console.log(`生成图片数量: ${result1.image_urls.length}`);
      await saveImages(result1.image_urls, 'seedream-4', 'text-to-image');
    }

    // 测试 2: 图片编辑（如果有测试图片）
    console.log('\n场景 2: 图片编辑');
    const testImagePath = process.env.TEST_IMAGE_PATH;
    
    if (!testImagePath) {
      console.log('⚠️  跳过图片编辑测试：未设置 TEST_IMAGE_PATH 环境变量');
    } else {
      try {
        const fs = await import('fs/promises');
        await fs.access(testImagePath);
        console.log(`✅ 找到测试图片: ${testImagePath}`);

        const editPrompt = 'Transform this into a fantasy style with magical elements';
        console.log(`编辑提示词: ${editPrompt}`);
        console.log('正在编辑图片...');

        const result2 = await seedream4EditImage(editPrompt, testImagePath, {
          size: '2K',
          aspect_ratio: '16:9',
        });

        console.log(`✅ 编辑成功！`);
        console.log(`生成图片数量: ${result2.image_urls.length}`);
        await saveImages(result2.image_urls, 'seedream-4', 'edit');
      } catch (error) {
        console.log(`⚠️  图片编辑测试失败: ${error instanceof Error ? error.message : String(error)}`);
      }
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
  console.log('🚀 开始测试 Replicate 图片生成模型');
  console.log('='.repeat(50));

  // 检查环境变量
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('❌ 错误: 未找到 REPLICATE_API_TOKEN 环境变量');
    console.log('请在 .env 文件中设置 REPLICATE_API_TOKEN');
    process.exit(1);
  }

  console.log(`✅ 已找到 REPLICATE_API_TOKEN (长度: ${process.env.REPLICATE_API_TOKEN.length})`);

  try {
    // 运行测试
     await testNanoBanana();
    // await testFluxKontextFast();
    // await testIdeogramV2A();
    // await testRecraftCrispUpscale();
    //await testFluxFast();
    // await testSeedream4();

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
