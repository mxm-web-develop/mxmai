/**
 * DeerAPI Sora 视频下载脚本
 * 
 * 用于下载已生成的视频
 * 功能：
 * 1. 查询视频状态
 * 2. 等待视频生成完成
 * 3. 下载视频内容并保存到本地
 * 
 * 使用方法：
 * tsx download_sora.ts <video_id> [output_dir]
 * 
 * 示例：
 * tsx download_sora.ts video_6948e53e044c8191bb5ac916235c357a049acb9d8d7053d1
 * tsx download_sora.ts video_6948e53e044c8191bb5ac916235c357a049acb9d8d7053d1 ./output
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// 加载 .env 文件
const currentDir = process.cwd();
const testDir = __dirname;
const rootDir = path.resolve(testDir, '../..');

const envPaths = [
  path.join(currentDir, '.env'),
  path.join(rootDir, '.env'),
  path.join(testDir, '../../.env'),
  path.join(testDir, '../../../.env'),
];

const uniqueEnvPaths = [...new Set(envPaths)];

let envLoaded = false;
for (const envPath of uniqueEnvPaths) {
  try {
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath });
      if (!result.error) {
        console.log(`✅ 已加载 .env 文件: ${envPath}`);
        envLoaded = true;
        break;
      }
    }
  } catch (error) {
    // 继续尝试下一个路径
  }
}

if (!envLoaded) {
  dotenv.config(); // 尝试默认加载
}

// 获取环境变量
const DEERAPI_API_KEY = process.env.DEERAPI_API_KEY;
const DEERAPI_BASE_URL = process.env.DEERAPI_BASE_URL || 'https://api.deerapi.com';

if (!DEERAPI_API_KEY) {
  console.error('❌ 错误: DEERAPI_API_KEY 环境变量未设置');
  process.exit(1);
}

console.log(`📝 配置信息:`);
console.log(`   Base URL: ${DEERAPI_BASE_URL}`);
console.log(`   API Key: ${DEERAPI_API_KEY.substring(0, 10)}...`);
console.log('');

/**
 * 查询视频状态
 */
async function getVideoStatus(videoId: string): Promise<any> {
  const url = `${DEERAPI_BASE_URL}/v1/videos/${videoId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': DEERAPI_API_KEY!,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeerAPI 查询视频状态失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * 下载视频内容
 */
async function downloadVideo(videoId: string, savePath: string): Promise<void> {
  const url = `${DEERAPI_BASE_URL}/v1/videos/${videoId}/content`;

  console.log(`📥 开始下载视频...`);
  console.log(`   URL: ${url}`);
  console.log(`   Video ID: ${videoId}`);
  console.log(`   保存路径: ${savePath}`);
  console.log('');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': DEERAPI_API_KEY!,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeerAPI 获取视频内容失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  // 检查响应类型
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    // 可能是错误响应
    const errorData = await response.json();
    throw new Error(`DeerAPI 返回错误: ${JSON.stringify(errorData)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`✅ 视频下载成功，大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  // 确保目录存在
  const dir = path.dirname(savePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(savePath, buffer);
  console.log(`✅ 视频已保存到: ${savePath}`);
  console.log('');
}

/**
 * 等待视频生成完成
 */
async function waitForVideoCompletion(
  videoId: string,
  options: {
    maxWaitTime?: number; // 最大等待时间（毫秒），默认 30 分钟
    pollInterval?: number; // 轮询间隔（毫秒），默认 5 秒
  } = {}
): Promise<any> {
  const maxWaitTime = options.maxWaitTime || 30 * 60 * 1000; // 30 分钟
  const pollInterval = options.pollInterval || 5 * 1000; // 5 秒
  const startTime = Date.now();

  console.log(`⏳ 等待视频生成完成...`);
  console.log(`   最大等待时间: ${maxWaitTime / 1000 / 60} 分钟`);
  console.log(`   轮询间隔: ${pollInterval / 1000} 秒`);
  console.log('');

  while (true) {
    const status = await getVideoStatus(videoId);

    console.log(`📊 当前状态:`);
    console.log(`   状态: ${status.status}`);
    console.log(`   进度: ${status.progress || 0}%`);
    if (status.prompt) {
      console.log(`   提示词: ${status.prompt}`);
    }
    if (status.model) {
      console.log(`   模型: ${status.model}`);
    }
    if (status.size) {
      console.log(`   分辨率: ${status.size}`);
    }
    if (status.seconds) {
      console.log(`   时长: ${status.seconds} 秒`);
    }
    console.log('');

    if (status.status === 'completed') {
      console.log(`✅ 视频生成完成！`);
      return status;
    }

    if (status.status === 'failed') {
      console.log('');
      console.log('❌ 视频生成失败！');
      if (status.error) {
        const errorCode = status.error.code || '未知错误代码';
        const errorMessage = status.error.message || JSON.stringify(status.error);
        console.log(`   错误代码: ${errorCode}`);
        console.log(`   错误信息: ${errorMessage}`);
      } else {
        console.log(`   错误信息: ${JSON.stringify(status.error || '未知错误')}`);
      }
      console.log('');
      throw new Error(`视频生成失败: ${status.error?.message || JSON.stringify(status.error || '未知错误')}`);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTime) {
      throw new Error(`等待超时: 超过 ${maxWaitTime / 1000 / 60} 分钟`);
    }

    const elapsedSeconds = Math.round(elapsed / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    console.log(`   已等待: ${elapsedMinutes} 分 ${elapsedSeconds % 60} 秒`);
    console.log('');

    // 等待后继续轮询
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

/**
 * 主函数
 */
async function main() {
  // 从命令行参数获取 video_id
  const videoId = process.argv[2];
  const outputDir = process.argv[3] || path.join(__dirname, 'output');

  if (!videoId) {
    console.error('❌ 错误: 请提供视频 ID');
    console.log('');
    console.log('使用方法:');
    console.log('  tsx download_sora.ts <video_id> [output_dir]');
    console.log('');
    console.log('示例:');
    console.log('  tsx download_sora.ts video_6948e53e044c8191bb5ac916235c357a049acb9d8d7053d1');
    console.log('  tsx download_sora.ts video_6948e53e044c8191bb5ac916235c357a049acb9d8d7053d1 ./output');
    console.log('');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('DeerAPI Sora 视频下载');
  console.log('='.repeat(60));
  console.log('');
  console.log(`📹 Video ID: ${videoId}`);
  console.log(`📁 输出目录: ${outputDir}`);
  console.log('');

  try {
    // 1. 查询当前状态
    console.log('📊 步骤 1: 查询视频状态');
    console.log('-'.repeat(60));
    const initialStatus = await getVideoStatus(videoId);
    console.log(`   当前状态: ${initialStatus.status}`);
    console.log(`   当前进度: ${initialStatus.progress || 0}%`);
    
    // 显示详细信息
    if (initialStatus.prompt) {
      console.log(`   提示词: ${initialStatus.prompt}`);
    }
    if (initialStatus.model) {
      console.log(`   模型: ${initialStatus.model}`);
    }
    if (initialStatus.size) {
      console.log(`   分辨率: ${initialStatus.size}`);
    }
    if (initialStatus.seconds) {
      console.log(`   时长: ${initialStatus.seconds} 秒`);
    }
    
    // 检查是否失败
    if (initialStatus.status === 'failed') {
      console.log('');
      console.log('❌ 视频生成失败！');
      if (initialStatus.error) {
        console.log(`   错误代码: ${initialStatus.error.code || '未知'}`);
        console.log(`   错误信息: ${initialStatus.error.message || JSON.stringify(initialStatus.error)}`);
      }
      console.log('');
      console.log('💡 可能的原因:');
      console.log('   - 提示词内容违反了内容政策');
      console.log('   - 服务器内部错误');
      console.log('   - 网络问题导致生成中断');
      console.log('   - 模型资源不足');
      console.log('');
      console.log('💡 建议:');
      console.log('   - 尝试使用不同的提示词重新生成');
      console.log('   - 检查提示词是否符合内容政策');
      console.log('   - 稍后重试');
      console.log('');
      process.exit(1);
    }
    
    console.log('');

    // 2. 如果未完成，等待完成
    if (initialStatus.status !== 'completed') {
      console.log('⏳ 步骤 2: 等待视频生成完成');
      console.log('-'.repeat(60));
      await waitForVideoCompletion(videoId);
    } else {
      console.log('✅ 视频已经完成，跳过等待步骤');
      console.log('');
    }

    // 3. 下载视频
    console.log('📥 步骤 3: 下载视频');
    console.log('-'.repeat(60));
    const fileName = `${videoId}.mp4`;
    const savePath = path.join(outputDir, fileName);
    await downloadVideo(videoId, savePath);

    console.log('='.repeat(60));
    console.log('✅ 下载完成！');
    console.log('='.repeat(60));
    console.log(`📹 视频文件: ${savePath}`);
    console.log('');

  } catch (error: any) {
    console.error('❌ 下载失败:', error.message);
    console.error('');
    process.exit(1);
  }
}

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
export {
  getVideoStatus,
  downloadVideo,
  waitForVideoCompletion,
};
