/**
 * Nano Banana 异步任务系统测试
 * 
 * 测试新的异步任务系统（cgi-task）：
 * 1. 创建异步任务
 * 2. 查询任务状态和进度
 * 3. 获取任务结果（base64 和 minio URL）
 * 4. 测试同步和异步任务统一处理
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { uid } from 'uid';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskExecutor } from '../task/task-executor';
import type { ProviderType } from '../core/providers/types';

// ⚠️ 重要：必须在导入任何模块之前加载 .env 文件
const currentDir = process.cwd();
const testDir = __dirname;
// testDir 是 src/test，所以 mxmcgi 根目录是 ../..
const mxmcgiRoot = path.resolve(testDir, '../..');
// 项目根目录是 ../../..
const projectRoot = path.resolve(testDir, '../../..');

const envPaths = [
  path.join(mxmcgiRoot, '.env'),        // mxmcgi/.env (优先)
  path.join(projectRoot, '.env'),       // 项目根目录/.env
  path.join(currentDir, '.env'),        // 当前工作目录/.env
  path.join(testDir, '../../.env'),     // 相对路径
  path.join(testDir, '../../../.env'),  // 相对路径
];

const uniqueEnvPaths = [...new Set(envPaths)];

console.log(`[DEBUG] 当前工作目录: ${currentDir}`);
console.log(`[DEBUG] 测试文件目录: ${testDir}`);
console.log(`[DEBUG] mxmcgi 根目录: ${mxmcgiRoot}`);
console.log(`[DEBUG] 尝试加载 .env 文件路径:`, uniqueEnvPaths);

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
      } else {
        console.warn(`⚠️  加载 .env 文件失败 (${envPath}):`, result.error);
      }
    }
  } catch (error) {
    console.warn(`⚠️  检查 .env 文件时出错 (${envPath}):`, error);
  }
}

if (!envLoaded) {
  console.warn('⚠️  未找到 .env 文件，尝试默认加载');
  const result = dotenv.config();
  if (result.error) {
    console.error('❌ 默认加载 .env 失败:', result.error);
  } else {
    console.log('✅ 默认加载 .env 成功');
    envLoaded = true;
  }
}

// 调试：检查 Supabase 环境变量
console.log(`[DEBUG] SUPABASE_URL: ${process.env.SUPABASE_URL ? '已设置' : '未设置'}`);
console.log(`[DEBUG] SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '已设置' : '未设置'}`);

// 初始化 RepositoryFactory（必须在创建任务之前）
// 如果 Supabase 配置不存在，会在后续使用内存存储时处理
try {
  RepositoryFactory.init();
  console.log('✅ RepositoryFactory 初始化成功');
} catch (error) {
  console.warn('⚠️  RepositoryFactory 初始化失败，将使用内存存储:', error instanceof Error ? error.message : String(error));
  console.warn('提示: 请确保设置了 SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量');
}

// 生成唯一 ID 的辅助函数
function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// 测试用的固定用户 ID（使用 uid 格式）
const TEST_USER_ID = uid(21); // 生成 21 字符长度的唯一 ID

/**
 * 获取输出目录路径
 */
function getOutputDir(): string {
  return path.join(__dirname, 'generated_images', 'nano-banana');
}

/**
 * 保存图片（支持 URL 和 Base64）
 */
async function saveImage(urlOrData: string, filename: string): Promise<string> {
  try {
    const outputDir = getOutputDir();
    await fs.mkdir(outputDir, { recursive: true });
    
    if (urlOrData.startsWith('data:')) {
      // Base64 data URL
      let imageData = urlOrData;
      if (imageData.includes(',')) {
        imageData = imageData.split(',')[1];
      }
      const buffer = Buffer.from(imageData, 'base64');
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, buffer);
      return filePath;
    } else if (urlOrData.startsWith('http')) {
      // HTTP URL
      const response = await fetch(urlOrData);
      if (!response.ok) {
        throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, Buffer.from(buffer));
      return filePath;
    } else {
      // 纯 Base64 数据
      const buffer = Buffer.from(urlOrData, 'base64');
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, buffer);
      return filePath;
    }
  } catch (error) {
    throw new Error(`保存图片失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 等待任务完成（轮询）
 */
async function waitForTaskCompletion(
  taskId: string,
  timeout: number = 7200000, // 2 小时（7200000ms = 2 * 60 * 60 * 1000）
  pollInterval: number = 8000 // 8 秒
): Promise<void> {
  const startTime = Date.now();
  const taskManager = taskExecutor.getTaskManager();

  while (Date.now() - startTime < timeout) {
    const response = await taskManager.getTask(taskId);
    const task = response.task;

    console.log(`  📊 任务状态: ${task.status}, 进度: ${task.progress.progress}%`);

    if (task.status === 'completed') {
      console.log(`  ✅ 任务完成！`);
      return;
    }

    if (task.status === 'failed' || task.status === 'cancelled') {
      throw new Error(`任务失败: ${task.progress.error || task.status}`);
    }

    // 等待后继续轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // 超时后，检查任务状态并标记为失败
  const response = await taskManager.getTask(taskId);
  const task = response.task;
  
  // 如果任务仍在处理中，标记为失败
  if (task.status === 'processing' || task.status === 'queued' || task.status === 'pending') {
    await taskManager.setTaskError(taskId, `任务超时: 超过 ${timeout / 1000 / 60} 分钟未完成`);
  }
  
  throw new Error(`任务超时: ${timeout}ms (${timeout / 1000 / 60} 分钟)`);
}

/**
 * 测试 1: 创建异步任务（base64 格式）
 */
async function test1_CreateAsyncTaskBase64() {
  console.log('\n📸 测试 1: 创建异步任务（返回 base64）');
  console.log('='.repeat(60));
  
  try {
    const userId = TEST_USER_ID;
    const prompt = 'A beautiful sunset over the ocean with birds flying';
    
    console.log(`📝 提示词: "${prompt}"`);
    console.log(`👤 用户 ID: ${userId}`);
    console.log('正在创建任务...');
    
    // 创建任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'image',
      model: 'nano-banana',
      provider: 'deer', // 使用 deer（默认）
      params: {
        prompt,
        aspect_ratio: '16:9',
        image_size: '2K',
      },
      userId,
      storeToMinio: false, // 返回 base64
    });

    console.log(`✅ 任务已创建！`);
    console.log(`  Task ID: ${createResponse.taskId}`);
    console.log(`  状态: ${createResponse.status}`);
    
    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'nano-banana',
      provider: 'deer',
      params: {
        prompt,
        aspect_ratio: '16:9',
        image_size: '2K',
      },
      userId,
      storeToMinio: false,
    }).catch((error) => {
      console.error(`❌ 任务执行失败:`, error);
    });

    // 等待任务完成
    console.log('\n⏳ 等待任务完成...');
    await waitForTaskCompletion(createResponse.taskId);

    // 获取任务结果
    const taskResponse = await taskManager.getTask(createResponse.taskId);
    const task = taskResponse.task;

    console.log(`\n📊 任务结果:`);
    console.log(`  状态: ${task.status}`);
    console.log(`  进度: ${task.progress.progress}%`);
    
    if (task.result && task.result.mediaUrls.length > 0) {
      console.log(`  生成图片数量: ${task.result.mediaUrls.length}`);
      console.log(`  结果格式: ${task.metadata.storeToMinio ? 'MinIO URL' : 'Base64'}`);
      
      const filename = `test1-task-base64-${generateUniqueId()}.png`;
      const savedPath = await saveImage(task.result.mediaUrls[0], filename);
      console.log(`  ✅ 图片已保存: ${savedPath}`);
    } else {
      console.warn('⚠️  未生成任何图片');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 2: 创建异步任务（MinIO 存储）
 */
async function test2_CreateAsyncTaskMinIO() {
  console.log('\n📸 测试 2: 创建异步任务（存储到 MinIO）');
  console.log('='.repeat(60));
  
  try {
    const userId = TEST_USER_ID;
    const prompt = 'A futuristic cityscape at night with neon lights';
    
    console.log(`📝 提示词: "${prompt}"`);
    console.log(`👤 用户 ID: ${userId}`);
    console.log('正在创建任务...');
    
    // 创建任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'image',
      model: 'nano-banana',
      provider: 'deer',
      params: {
        prompt,
        aspect_ratio: '16:9',
        image_size: '2K',
      },
      userId,
      storeToMinio: true, // 存储到 MinIO
      storageConfig: {
        bucket: 'user-media',
        pathTemplate: 'generated/{userId}/{date}/{timestamp}-{randomId}.{ext}',
      },
    });

    console.log(`✅ 任务已创建！`);
    console.log(`  Task ID: ${createResponse.taskId}`);
    
    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'nano-banana',
      provider: 'deer',
      params: {
        prompt,
        aspect_ratio: '16:9',
        image_size: '2K',
      },
      userId,
      storeToMinio: true,
      storageConfig: {
        bucket: 'user-media',
        pathTemplate: 'generated/{userId}/{date}/{timestamp}-{randomId}.{ext}',
      },
    }).catch((error) => {
      console.error(`❌ 任务执行失败:`, error);
    });

    // 等待任务完成
    console.log('\n⏳ 等待任务完成...');
    await waitForTaskCompletion(createResponse.taskId);

    // 获取任务结果
    const taskResponse = await taskManager.getTask(createResponse.taskId);
    const task = taskResponse.task;

    console.log(`\n📊 任务结果:`);
    console.log(`  状态: ${task.status}`);
    
    if (task.result && task.result.mediaUrls.length > 0) {
      console.log(`  生成图片数量: ${task.result.mediaUrls.length}`);
      console.log(`  结果格式: MinIO URL`);
      
      if (task.result.storageInfo) {
        console.log(`  存储信息:`);
        console.log(`    存储桶: ${task.result.storageInfo.bucket}`);
        console.log(`    文件数量: ${task.result.storageInfo.keys.length}`);
        console.log(`    URL: ${task.result.storageInfo.urls[0]}`);
      }
      
      const filename = `test2-task-minio-${generateUniqueId()}.png`;
      const savedPath = await saveImage(task.result.mediaUrls[0], filename);
      console.log(`  ✅ 图片已保存: ${savedPath}`);
    } else {
      console.warn('⚠️  未生成任何图片');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 3: 查询任务列表
 */
async function test3_ListTasks() {
  console.log('\n📸 测试 3: 查询任务列表');
  console.log('='.repeat(60));
  
  try {
    const userId = TEST_USER_ID;
    const taskManager = taskExecutor.getTaskManager();
    
    console.log(`👤 查询用户 ID: ${userId} 的任务列表`);
    
    const response = await taskManager.listTasks({
      userId,
      type: 'image',
      limit: 10,
      offset: 0,
    });

    console.log(`\n📊 查询结果:`);
    console.log(`  总任务数: ${response.total}`);
    console.log(`  返回任务数: ${response.tasks.length}`);
    
    if (response.tasks.length > 0) {
      console.log(`\n任务列表:`);
      response.tasks.forEach((task, index) => {
        console.log(`  ${index + 1}. Task ID: ${task.id}`);
        console.log(`     状态: ${task.status}`);
        console.log(`     进度: ${task.progress.progress}%`);
        console.log(`     模型: ${task.metadata.model}`);
        console.log(`     创建时间: ${task.createdAt.toISOString()}`);
        console.log('');
      });
    } else {
      console.log('  暂无任务');
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

/**
 * 测试 4: 测试不同 Provider（deer vs replicate）
 */
async function test4_DifferentProviders() {
  console.log('\n📸 测试 4: 测试不同 Provider');
  console.log('='.repeat(60));
  
  const userId = TEST_USER_ID;
  const prompt = 'A cute baby setting on a chair';
  const providers: Array<{ name: string; provider?: ProviderType }> = [
    // { name: 'replicate (默认)', provider: 'replicate' },
    { name: 'ppio', provider: 'ppio' },
    // { name: 'replicate', provider: 'replicate' }, // 可以取消注释测试
  ];

  for (const { name, provider } of providers) {
    try {
      console.log(`\n🖼️  测试 Provider: ${name}`);
      console.log(`📝 提示词: "${prompt}"`);
      
      const taskManager = taskExecutor.getTaskManager();
      const createResponse = await taskManager.createTask({
        type: 'image',
        model: 'nano-banana',
        provider,
        params: {
          prompt,
          aspect_ratio: '1:1',
        },
        userId,
        storeToMinio: false,
      });

      console.log(`  ✅ 任务已创建: ${createResponse.taskId}`);
      
      // 异步执行任务
      taskExecutor.executeTask({
        taskId: createResponse.taskId,
        modelName: 'nano-banana',
        provider,
        params: {
          prompt,
          aspect_ratio: '1:1',
        },
        userId,
        storeToMinio: false,
      }).catch((error) => {
        console.error(`  ❌ 任务执行失败:`, error);
      });

      // 等待任务完成（replicate 可能需要较长时间，设置为 2 小时）
      const timeout = provider === 'replicate' ? 7200000 : 300000; // replicate: 2小时，其他: 5分钟
      await waitForTaskCompletion(createResponse.taskId, timeout, 2000);

      // 获取结果
      const taskResponse = await taskManager.getTask(createResponse.taskId);
      const task = taskResponse.task;

      console.log(`  ✅ Provider: ${task.metadata.provider}`);
      console.log(`  状态: ${task.status}`);
      
      if (task.result && task.result.mediaUrls.length > 0) {
        const providerName = provider || 'default';
        const filename = `test4-${providerName}-${generateUniqueId()}.png`;
        const savedPath = await saveImage(task.result.mediaUrls[0], filename);
        console.log(`  ✅ 图片已保存: ${savedPath}`);
      }
    } catch (error) {
      console.error(`  ❌ ${name} 测试失败:`, error);
    }
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 开始测试 Nano Banana 异步任务系统');
  console.log('='.repeat(60));
  console.log('📋 测试内容:');
  console.log('  1. 创建异步任务（base64 格式）');
  console.log('  2. 创建异步任务（MinIO 存储）');
  console.log('  3. 查询任务列表');
  console.log('  4. 测试不同 Provider');
  console.log('='.repeat(60));
  
  const tests = [
    // { name: '创建异步任务（base64）', fn: test1_CreateAsyncTaskBase64 },
    // // { name: '创建异步任务（MinIO）', fn: test2_CreateAsyncTaskMinIO }, // 需要 MinIO 配置
    // { name: '查询任务列表', fn: test3_ListTasks },
    { name: '测试不同 Provider', fn: test4_DifferentProviders },
  ];
  
  const results: Array<{ name: string; success: boolean; error?: string }> = [];
  
  for (const test of tests) {
    try {
      await test.fn();
      results.push({ name: test.name, success: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ name: test.name, success: false, error: errorMsg });
      console.error(`\n❌ 测试 "${test.name}" 失败:`, errorMsg);
    }
  }
  
  // 输出测试总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试总结');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`✅ 成功: ${successCount}/${results.length}`);
  console.log(`❌ 失败: ${failCount}/${results.length}`);
  
  if (failCount > 0) {
    console.log('\n失败的测试:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log(`\n📁 输出目录: ${getOutputDir()}`);
  console.log(`\n💡 提示: 确保已创建 cgi_tasks 表（参考 SETUP_DATABASE.md）`);
}

// 运行测试
main().catch(error => {
  console.error('❌ 测试过程中出现错误:', error);
  process.exit(1);
});
