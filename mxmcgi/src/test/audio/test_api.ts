/**
 * PPIO 音频 API 测试
 * 
 * 直接调用 PPIO API 测试异步语音合成功能
 * 参考文档：
 * - https://ppio.com/docs/models/reference-minimax-speech-2.5-turbo-async
 * - https://ppio.com/docs/models/reference-get-async-task-result
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
const PPIO_API_KEY = process.env.PPIO_API_KEY;
const PPIO_BASE_URL = process.env.PPIO_BASE_URL || 'https://api.ppinfra.com';

if (!PPIO_API_KEY) {
  console.error('❌ 错误: PPIO_API_KEY 环境变量未设置');
  process.exit(1);
}

console.log(`📝 配置信息:`);
console.log(`   Base URL: ${PPIO_BASE_URL}`);
console.log(`   API Key: ${PPIO_API_KEY.substring(0, 10)}...`);
console.log('');

/**
 * 调用 PPIO 异步语音合成接口
 */
async function createSpeechTask(
  model: 'minimax-speech-02-hd' | 'minimax-speech-2.5-hd-preview' | 'minimax-speech-2.5-turbo-preview' | 'minimax-speech-2.6-hd',
  text: string,
  options?: {
    voice_setting?: any;
    audio_setting?: any;
    language_boost?: string;
    voice_modify?: any;
  }
): Promise<{ task_id: string }> {
  const url = `${PPIO_BASE_URL}/v3/async/${model}`;

  const body: Record<string, any> = {
    text,
  };

  if (options?.voice_setting) {
    body.voice_setting = options.voice_setting;
  }
  if (options?.audio_setting) {
    body.audio_setting = options.audio_setting;
  }
  if (options?.language_boost) {
    body.language_boost = options.language_boost;
  }
  if (options?.voice_modify) {
    body.voice_modify = options.voice_modify;
  }

  console.log(`🚀 创建语音合成任务:`);
  console.log(`   URL: ${url}`);
  console.log(`   模型: ${model}`);
  console.log(`   文本长度: ${text.length} 字符`);
  console.log(`   请求体:`, JSON.stringify(body, null, 2));
  console.log('');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PPIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ 创建任务失败:`);
    console.error(`   状态码: ${response.status} ${response.statusText}`);
    console.error(`   错误信息: ${errorText}`);
    throw new Error(`创建任务失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json() as { task_id: string };
  console.log(`✅ 任务创建成功:`);
  console.log(`   Task ID: ${result.task_id}`);
  console.log('');

  return result;
}

/**
 * 查询任务结果
 */
async function getTaskResult(taskId: string): Promise<{
  task: {
    task_id: string;
    status: 'TASK_STATUS_QUEUED' | 'TASK_STATUS_PROCESSING' | 'TASK_STATUS_SUCCEED' | 'TASK_STATUS_FAILED';
    reason?: string;
    task_type?: string;
    eta?: number;
    progress_percent?: number;
  };
  audios?: Array<{
    audio_url: string;
    audio_url_ttl: number;
    audio_type: string;
    audio_metadata?: {
      text: string;
      start_time: number;
      end_time: number;
    };
  }>;
  images?: Array<any>;
  videos?: Array<any>;
  extra?: any;
}> {
  const url = `${PPIO_BASE_URL}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${PPIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ 查询任务结果失败:`);
    console.error(`   状态码: ${response.status} ${response.statusText}`);
    console.error(`   错误信息: ${errorText}`);
    throw new Error(`查询任务结果失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json() as any;
}

/**
 * 轮询任务直到完成
 */
async function pollTaskUntilComplete(
  taskId: string,
  maxAttempts: number = 60,
  pollInterval: number = 5000
): Promise<void> {
  console.log(`🔄 开始轮询任务状态 (最多 ${maxAttempts} 次，间隔 ${pollInterval}ms)...`);
  console.log('');

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`[${attempts}/${maxAttempts}] 查询任务状态...`);

    try {
      const result = await getTaskResult(taskId);
      const status = result.task?.status;
   
      console.log(`   状态: ${status}` ,result);
      if (result.task?.progress_percent !== undefined) {
        console.log(`   进度: ${result.task.progress_percent}%`);
      }
      if (result.task?.eta) {
        console.log(`   预计完成时间: ${result.task.eta} 秒`);
      }

      if (status === 'TASK_STATUS_SUCCEED') {
        console.log('');
        console.log(`✅ 任务成功完成!`);
        console.log(`   完整响应:`, JSON.stringify(result, null, 2));
        
        if (result.audios && result.audios.length > 0) {
          console.log('');
          console.log(`🎵 音频文件:`);
          for (const audio of result.audios) {
            console.log(`   - URL: ${audio.audio_url}`);
            console.log(`     类型: ${audio.audio_type}`);
            console.log(`     过期时间: ${audio.audio_url_ttl} 秒`);
            if (audio.audio_metadata) {
              console.log(`     元数据:`, audio.audio_metadata);
            }
          }
        }
        return;
      } else if (status === 'TASK_STATUS_FAILED') {
        console.log('');
        console.error(`❌ 任务失败:`);
        console.error(`   失败原因: ${result.task?.reason || '未知'}`);
        console.error(`   完整响应:`, JSON.stringify(result, null, 2));
        throw new Error(`任务失败: ${result.task?.reason || '未知原因'}`);
      } else if (status === 'TASK_STATUS_QUEUED') {
        console.log(`   ⏳ 任务排队中...`);
      } else if (status === 'TASK_STATUS_PROCESSING') {
        console.log(`   ⚙️  任务处理中...`);
      }

      console.log('');
    } catch (error) {
      console.error(`❌ 查询任务状态时出错:`, error);
      throw error;
    }

    // 等待后继续轮询
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`任务轮询超时（已尝试 ${maxAttempts} 次）`);
}

/**
 * 主测试函数
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('PPIO 音频 API 测试');
    console.log('='.repeat(60));
    console.log('');

    // 测试参数
    const testText = '这是一段试听文本，我现在真的很开心呀，哈哈哈哈';
    const model = 'minimax-speech-2.6-hd'; // 测试 Speech-2.6-hd 模型

    console.log('📋 测试方案 1: 仅发送必需参数 (text)');
    console.log('');

    // 方案 1: 仅发送必需参数
    try {
      const { task_id } = await createSpeechTask(model, testText);
      await pollTaskUntilComplete(task_id, 120, 5000);
      console.log('');
      console.log('='.repeat(60));
      console.log('✅ 测试完成 (方案 1)');
      console.log('='.repeat(60));
      return;
    } catch (error: any) {
      console.error('❌ 方案 1 失败:', error.message);
      console.log('');
      console.log('📋 测试方案 2: 添加 voice_setting 和 audio_setting');
      console.log('');
    }

    // 方案 2: 添加 voice_setting 和 audio_setting (包含 voice_id)
    const voiceSetting = {
      voice_id: 'female-shaonv', // 使用系统音色：少女音色
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
      emotion: 'happy' as const,
      text_normalization: false,
    };

    const audioSetting = {
      format: 'mp3' as const,
      sample_rate: 32000,
      bitrate: 128000,
      channel: 1,
    };

    try {
      const { task_id } = await createSpeechTask(model, testText, {
        voice_setting: voiceSetting,
        audio_setting: audioSetting,
      });
      await pollTaskUntilComplete(task_id, 120, 5000);
      console.log('');
      console.log('='.repeat(60));
      console.log('✅ 测试完成 (方案 2)');
      console.log('='.repeat(60));
      return;
    } catch (error: any) {
      console.error('❌ 方案 2 失败:', error.message);
      console.log('');
      console.log('📋 测试方案 3: 添加所有可选参数 (包含 voice_id)');
      console.log('');
    }

    // 方案 3: 添加所有可选参数 (包含 voice_id)
    const voiceSettingWithId = {
      voice_id: 'female-shaonv', // 使用系统音色：少女音色
      speed: 1.0,
      vol: 1.0,
      pitch: 0,
      emotion: 'happy' as const,
      text_normalization: false,
    };

    const voiceModify = {
      pitch: 0,
      intensity: 0,
      timbre: 0,
      sound_effects: 'spacious_echo' as const,
    };

    // 1. 创建任务
    const { task_id } = await createSpeechTask(model, testText, {
      voice_setting: voiceSettingWithId,
      audio_setting: audioSetting,
      language_boost: 'Chinese',
      voice_modify: voiceModify,
    });

    // 2. 轮询任务直到完成
    await pollTaskUntilComplete(task_id, 120, 5000);

    console.log('');
    console.log('='.repeat(60));
    console.log('✅ 测试完成 (方案 3)');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('❌ 测试失败');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
main();
