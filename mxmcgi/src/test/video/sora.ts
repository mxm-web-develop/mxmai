/**
 * DeerAPI Sora 视频生成 API 测试
 * 
 * 测试所有 DeerAPI Sora 视频接口：
 * 1. 创建视频（官方格式）- POST /v1/videos
 * 2. 创建视频（自研格式）- POST /v1/videos (使用 sora-2-all 或 sora-2-pro-all)
 * 3. 检索视频状态 - GET /v1/videos/{video_id}
 * 4. 下载视频内容 - GET /v1/videos/{video_id}/content
 * 5. 混编视频 - POST /v1/videos/{video_id}/remix
 * 
 * 参考文档：
 * - https://apidoc.deerapi.com/video/sora/official/create
 * - https://apidoc.deerapi.com/video/sora/official/list
 * - https://apidoc.deerapi.com/video/sora/official/content
 * - https://apidoc.deerapi.com/video/sora/official/remix
 * - https://apidoc.deerapi.com/sora/self-developed/create
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Node.js 18+ 支持全局 FormData，但为了兼容性，我们检查一下
// 如果不存在，可能需要使用 form-data 包
let FormData: typeof globalThis.FormData;
let Blob: typeof globalThis.Blob;

if (typeof globalThis.FormData !== 'undefined') {
  FormData = globalThis.FormData;
  Blob = globalThis.Blob;
} else {
  // 尝试从 undici 导入（Node.js 18+）
  try {
    const { FormData: UndiciFormData, Blob: UndiciBlob } = require('undici');
    FormData = UndiciFormData;
    Blob = UndiciBlob;
  } catch {
    throw new Error('FormData 和 Blob 不可用。请使用 Node.js 18+ 或安装 undici 包');
  }
}

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
 * 创建视频（官方格式）
 * 参考文档: https://apidoc.deerapi.com/video/sora/official/create
 */
async function createVideoOfficial(params: {
  prompt: string;
  model?: 'sora-2' | 'sora-2-pro';
  seconds?: '4' | '8' | '12';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  input_reference?: string | Buffer | File; // 图片路径、Buffer 或 File
}): Promise<any> {
  const url = `${DEERAPI_BASE_URL}/v1/videos`;

  const formData = new FormData();
  formData.append('prompt', params.prompt);
  if (params.model) {
    formData.append('model', params.model);
  }
  if (params.seconds) {
    formData.append('seconds', params.seconds);
  }
  if (params.size) {
    formData.append('size', params.size);
  }
  if (params.input_reference) {
    if (typeof params.input_reference === 'string') {
      // 如果是文件路径，读取文件
      if (fs.existsSync(params.input_reference)) {
        const fileBuffer = fs.readFileSync(params.input_reference);
        const blob = new Blob([fileBuffer]);
        formData.append('input_reference', blob, path.basename(params.input_reference));
      } else {
        throw new Error(`文件不存在: ${params.input_reference}`);
      }
    } else if (Buffer.isBuffer(params.input_reference)) {
      const blob = new Blob([params.input_reference]);
      formData.append('input_reference', blob, 'image.jpg');
    } else {
      formData.append('input_reference', params.input_reference);
    }
  }

  console.log(`🚀 创建视频（官方格式）:`);
  console.log(`   URL: ${url}`);
  console.log(`   模型: ${params.model || 'sora-2 (默认)'}`);
  console.log(`   提示词: ${params.prompt}`);
  console.log(`   时长: ${params.seconds || '4 (默认)'} 秒`);
  console.log(`   分辨率: ${params.size || '720x1280 (默认)'}`);
  console.log('');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': DEERAPI_API_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeerAPI 创建视频失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`✅ 视频任务创建成功:`);
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  return data;
}

/**
 * 创建视频（自研格式）
 * 参考文档: https://apidoc.deerapi.com/sora/self-developed/create
 */
async function createVideoSelfDeveloped(params: {
  prompt: string;
  model: 'sora-2-all' | 'sora-2-pro-all';
  seconds: '10' | '15' | '25';
  size: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  input_reference?: string | Buffer | File;
  character_url?: string;
  character_timestamps?: string; // 格式: "1,8"
}): Promise<any> {
  const url = `${DEERAPI_BASE_URL}/v1/videos`;

  const formData = new FormData();
  formData.append('prompt', params.prompt);
  formData.append('model', params.model);
  formData.append('seconds', params.seconds);
  formData.append('size', params.size);
  
  if (params.input_reference) {
    if (typeof params.input_reference === 'string') {
      if (fs.existsSync(params.input_reference)) {
        const fileBuffer = fs.readFileSync(params.input_reference);
        const blob = new Blob([fileBuffer]);
        formData.append('input_reference', blob, path.basename(params.input_reference));
      } else {
        throw new Error(`文件不存在: ${params.input_reference}`);
      }
    } else if (Buffer.isBuffer(params.input_reference)) {
      const blob = new Blob([params.input_reference]);
      formData.append('input_reference', blob, 'image.jpg');
    } else {
      formData.append('input_reference', params.input_reference);
    }
  }
  
  if (params.character_url) {
    formData.append('character_url', params.character_url);
  }
  if (params.character_timestamps) {
    formData.append('character_timestamps', params.character_timestamps);
  }

  console.log(`🚀 创建视频（自研格式）:`);
  console.log(`   URL: ${url}`);
  console.log(`   模型: ${params.model}`);
  console.log(`   提示词: ${params.prompt}`);
  console.log(`   时长: ${params.seconds} 秒`);
  console.log(`   分辨率: ${params.size}`);
  if (params.character_url) {
    console.log(`   角色视频: ${params.character_url}`);
    console.log(`   角色时间范围: ${params.character_timestamps}`);
  }
  console.log('');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': DEERAPI_API_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeerAPI 创建视频失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`✅ 视频任务创建成功:`);
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  return data;
}

/**
 * 检索视频状态
 * 参考文档: https://apidoc.deerapi.com/video/sora/official/list
 */
async function getVideoStatus(videoId: string): Promise<any> {
  const url = `${DEERAPI_BASE_URL}/v1/videos/${videoId}`;

  console.log(`📊 查询视频状态:`);
  console.log(`   URL: ${url}`);
  console.log(`   Video ID: ${videoId}`);
  console.log('');

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

  const data = await response.json();
  console.log(`✅ 视频状态:`);
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  return data;
}

/**
 * 下载视频内容
 * 参考文档: https://apidoc.deerapi.com/video/sora/official/content
 */
async function getVideoContent(videoId: string, savePath?: string): Promise<Buffer> {
  const url = `${DEERAPI_BASE_URL}/v1/videos/${videoId}/content`;

  console.log(`📥 下载视频内容:`);
  console.log(`   URL: ${url}`);
  console.log(`   Video ID: ${videoId}`);
  if (savePath) {
    console.log(`   保存路径: ${savePath}`);
  }
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

  if (savePath) {
    // 确保目录存在
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(savePath, buffer);
    console.log(`✅ 视频已保存到: ${savePath}`);
  }

  console.log('');
  return buffer;
}

/**
 * 混编视频
 * 参考文档: https://apidoc.deerapi.com/video/sora/official/remix
 */
async function remixVideo(videoId: string, newPrompt: string): Promise<any> {
  const url = `${DEERAPI_BASE_URL}/v1/videos/${videoId}/remix`;

  const formData = new FormData();
  formData.append('prompt', newPrompt);

  console.log(`🎬 混编视频:`);
  console.log(`   URL: ${url}`);
  console.log(`   源视频 ID: ${videoId}`);
  console.log(`   新提示词: ${newPrompt}`);
  console.log('');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': DEERAPI_API_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeerAPI 混编视频失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`✅ 混编视频任务创建成功:`);
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  return data;
}

/**
 * 轮询视频状态直到完成
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

    if (status.status === 'completed') {
      console.log(`✅ 视频生成完成！`);
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(`视频生成失败: ${JSON.stringify(status.error || '未知错误')}`);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTime) {
      throw new Error(`等待超时: 超过 ${maxWaitTime / 1000 / 60} 分钟`);
    }

    const progress = status.progress || 0;
    console.log(`   进度: ${progress}%, 状态: ${status.status}, 已等待: ${Math.round(elapsed / 1000)} 秒`);
    console.log('');

    // 等待后继续轮询
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

/**
 * 完整测试流程：创建 -> 等待完成 -> 下载
 */
async function testCompleteFlow(
  createFn: () => Promise<any>,
  saveDir?: string
): Promise<void> {
  try {
    // 1. 创建视频任务
    const createResult = await createFn();
    const videoId = createResult.id;

    if (!videoId) {
      throw new Error('创建视频失败：未返回 video_id');
    }

    // 2. 等待视频生成完成
    const completedStatus = await waitForVideoCompletion(videoId);

    // 3. 下载视频
    const savePath = saveDir
      ? path.join(saveDir, `${videoId}.mp4`)
      : undefined;
    await getVideoContent(videoId, savePath);

    console.log(`✅ 完整流程测试成功！`);
    console.log(`   Video ID: ${videoId}`);
    if (savePath) {
      console.log(`   视频已保存: ${savePath}`);
    }
  } catch (error) {
    console.error(`❌ 测试失败:`, error);
    throw error;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('DeerAPI Sora 视频生成 API 测试');
  console.log('='.repeat(60));
  console.log('');

  // 创建测试输出目录
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 测试 1: 创建视频（官方格式 - sora-2）
    // console.log('📹 测试 1: 创建视频（官方格式 - sora-2）');
    // console.log('-'.repeat(60));
    // const video1 = await createVideoOfficial({
    //   prompt: 'A cute cat playing in a sunny garden, high quality, cinematic',
    //   model: 'sora-2',
    //   seconds: '4',
    //   size: '720x1280',
    // });
    // console.log(`✅ 测试 1 完成，Video ID: ${video1.id}`);
    // console.log('');
    // console.log('💡 提示: 如果视频生成失败，可以尝试:');
    // console.log('   - 使用英文提示词（可能更稳定）');
    // console.log('   - 简化提示词内容');
    // console.log('   - 稍后重试（可能是服务器临时问题）');
    // console.log('   - 使用 download_sora.ts 脚本下载: tsx download_sora.ts <video_id>');
    // console.log('');

    //测试 2: 创建视频（官方格式 - sora-2-pro）
    // console.log('📹 测试 2: 创建视频（官方格式 - sora-2-pro）');
    // console.log('-'.repeat(60));
    // const video2 = await createVideoOfficial({
    //   prompt: 'A cute cat playing in a sunny garden, high quality, cinematic',
    //   model: 'sora-2-pro',
    //   seconds: '4',
    //   size: '1280x720',
    // });
    // console.log(`✅ 测试 2 完成，Video ID: ${video2.id}`);
    // console.log('');

    // 测试 3: 创建视频（自研格式 - sora-2-all）
    // console.log('📹 测试 3: 创建视频（自研格式 - sora-2-all）');
    // console.log('-'.repeat(60));
    // const video3 = await createVideoSelfDeveloped({
    //   prompt: 'Shot 1:\nduration: 1.5sec\nScene: 飞机起飞\n\nShot 2:\nduration: 1.5sec\nScene: 飞机坠落',
    //   model: 'sora-2-all',
    //   seconds: '10',
    //   size: '720x1280',
    // });
    // console.log(`✅ 测试 3 完成，Video ID: ${video3.id}`);
    // console.log('');

    // 测试 4: 创建视频（自研格式 - sora-2-pro-all）
    console.log('📹 测试 4: 创建视频（自研格式 - sora-2-pro-all）');
    console.log('-'.repeat(60));
    const video4 = await createVideoSelfDeveloped({
      prompt: 'Shot 1:\nduration: 3.5sec\nScene: 科幻电影风格，高清，蓝色霓虹灯光，未来城市天际线。高空天台，夜晚俯瞰霓虹城市。未来战士女性（银色短发，穿高科技作战服）与男性AI伙伴（holographic投影，半透明蓝色）站在天台边缘，风吹动她的头发。广角静态镜头，全景显示两人。背景音：低沉电子合成音乐，远处飞行车嗡嗡声，风声。音效：全息投影轻微闪烁的电子音。\n\nShot 2:\nduration: 3sec\nScene: 镜头缓慢推近到中景，两人面对面。女性战士坚定地看着AI伙伴。台词：角色A（坚定语气）：“我们必须关闭核心。” 角色B（电子声，平静）：“风险很高……” 音效：风中金属旗杆碰撞声，投影闪烁加强。背景音：电子音乐渐强，城市低频嗡鸣。\n\nShot 3:\nduration: 3.5sec\nScene: 近景特写女性战士点头下定决心，AI伙伴投影微微闪烁回应。台词：角色B（继续，平静）：“但我是为你而存在的。” 镜头轻微拉远，显示城市天际线。音效：投影稳定闪烁，风声减弱。背景音：电子音乐达到高潮后渐弱，象征决心。',
      model: 'sora-2-pro-all',
      seconds: '10',
      size: '1792x1024',
    });
    console.log(`✅ 测试 4 完成，Video ID: ${video4.id}`);
    console.log('');

    // 测试 5: 查询视频状态（使用测试 1 的 video ID）
    if (video4.id) {
      console.log('📊 测试 5: 查询视频状态');
      console.log('-'.repeat(60));
      await getVideoStatus(video4.id);
      console.log(`✅ 测试 5 完成`);
      console.log('');
    }

    // 测试 6: 混编视频（需要先有一个完成的视频，这里仅演示接口调用）
    // 注意：混编需要源视频已完成，所以这里只演示接口调用，不等待完成
    if (video4.id) {
      console.log('🎬 测试 6: 混编视频（演示）');
      console.log('-'.repeat(60));
      console.log('⚠️  注意：混编需要源视频已完成，这里仅演示接口调用');
      try {
        const remixResult = await remixVideo(video4.id, '一只可爱的小猫在睡觉');
        console.log(`✅ 测试 6 完成，混编 Video ID: ${remixResult.id}`);
      } catch (error: any) {
        console.log(`⚠️  混编测试可能因为源视频未完成而失败，这是正常的`);
        console.log(`   错误信息: ${error.message}`);
      }
      console.log('');
    }

    console.log('='.repeat(60));
    console.log('✅ 所有测试完成！');
    console.log('='.repeat(60));
    console.log('');
    console.log('💡 提示:');
    console.log('   - 视频生成需要较长时间（几分钟到十几分钟）');
    console.log('   - 可以使用 getVideoStatus() 查询视频状态');
    console.log('   - 视频完成后可以使用 getVideoContent() 下载');
    console.log('   - 完整流程可以使用 testCompleteFlow() 函数');
    console.log('');

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
export {
  createVideoOfficial,
  createVideoSelfDeveloped,
  getVideoStatus,
  getVideoContent,
  remixVideo,
  waitForVideoCompletion,
  testCompleteFlow,
};
