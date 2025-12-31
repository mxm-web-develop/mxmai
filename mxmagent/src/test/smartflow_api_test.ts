/**
 * Smartflow API 测试
 * 测试 Smartflow 的创建、执行和查询功能
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../../.env') });

// 优先使用 Gateway URL，如果没有则直接使用 mxmagent
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const MXMAGENT_URL = process.env.MXMAGENT_URL || 'http://localhost:4004';
// 如果设置了 GATEWAY_URL，使用 Gateway；否则直接使用 mxmagent
const BASE_URL = process.env.GATEWAY_URL ? GATEWAY_URL : MXMAGENT_URL;
const API_BASE = `${BASE_URL}/api/v1`;

/**
 * 测试辅助函数：发送 HTTP 请求
 */
async function request(
  method: string,
  path: string,
  body?: any
): Promise<any> {
  const url = `${API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * 测试 1: 创建 Smartflow
 */
async function testCreateSmartflow() {
  console.log('\n=== 测试 1: 创建 Smartflow ===\n');

  const smartflowData = {
    name: '简单文本生成工作流',
    description: '一个简单的文本生成工作流示例',
    schema: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          input: [
            {
              content: '',
              type: 'text',
              name: 'user_input',
            },
          ],
          expected_outputs: [
            {
              type: 'text',
              name: 'result',
              required: true,
            },
          ],
          smartflow_name: '简单文本生成工作流',
        },
        {
          id: 'text_gen',
          type: 'model',
          name: '文本生成',
          model_type: 'text',
          model: 'gpt-5-nano',
          prompt: '{{input.user_input}}',
        },
        {
          id: 'end',
          type: 'end',
          output_mapping: {
            result: '{{text_gen.response}}',
          },
        },
      ],
      edges: [
        { from: 'start', to: 'text_gen' },
        { from: 'text_gen', to: 'end' },
      ],
    },
    status: 'active',
    author_id: 'test-user-123',
  };

  try {
    const result = await request('POST', '/smartflows', smartflowData);
    console.log('✅ Smartflow 创建成功');
    console.log('Smartflow ID:', result.data.id);
    console.log('名称:', result.data.name);
    return result.data.id;
  } catch (error) {
    console.error('❌ Smartflow 创建失败:', error);
    throw error;
  }
}

/**
 * 测试 2: 获取 Smartflow
 */
async function testGetSmartflow(smartflowId: string) {
  console.log('\n=== 测试 2: 获取 Smartflow ===\n');

  try {
    const result = await request('GET', `/smartflows/${smartflowId}`);
    console.log('✅ Smartflow 获取成功');
    console.log('名称:', result.data.name);
    console.log('节点数:', result.data.schema.nodes.length);
    return result.data;
  } catch (error) {
    console.error('❌ Smartflow 获取失败:', error);
    throw error;
  }
}

/**
 * 测试 3: 执行 Smartflow（创建 Task）
 */
async function testExecuteSmartflow(smartflowId: string) {
  console.log('\n=== 测试 3: 执行 Smartflow（创建 Task）===\n');

  const executeData = {
    userId: 'test-user-123',
    input: [
      {
        content: '你好，请介绍一下自己',
        type: 'text',
        name: 'user_input',
      },
    ],
  };

  try {
    const result = await request(
      'POST',
      `/smartflows/${smartflowId}/execute`,
      executeData
    );
    console.log('✅ Task 创建成功');
    console.log('Task ID:', result.data.id);
    console.log('状态:', result.data.status);
    console.log('进度:', result.data.progress + '%');
    return result.data.id;
  } catch (error) {
    console.error('❌ Task 创建失败:', error);
    throw error;
  }
}

/**
 * 测试 4: 查询 Task 状态（轮询）
 */
async function testGetTaskStatus(taskId: string) {
  console.log('\n=== 测试 4: 查询 Task 状态（轮询）===\n');

  let attempts = 0;
  const maxAttempts = 30; // 最多轮询 30 次
  const interval = 2000; // 每 2 秒查询一次

  // 如果使用 Gateway，使用 /smartflow-tasks；否则使用 /tasks
  const path = process.env.GATEWAY_URL ? '/smartflow-tasks' : '/tasks';

  while (attempts < maxAttempts) {
    try {
      const result = await request('GET', `${path}/${taskId}`);
      const task = result.data;

      console.log(
        `[${attempts + 1}/${maxAttempts}] 状态: ${task.status}, 进度: ${task.progress}%`
      );

      if (task.status === 'completed') {
        console.log('\n✅ Task 执行完成！');
        console.log('最终输出:', JSON.stringify(task.output_data, null, 2));
        console.log('\n执行链 (flow_chain):');
        task.flow_chain.forEach((node: any, index: number) => {
          console.log(
            `  ${index + 1}. ${node.node_name} (${node.node_id}): ${node.state}`
          );
          if (node.duration) {
            console.log(`     耗时: ${node.duration}ms`);
          }
        });
        return task;
      } else if (task.status === 'failed') {
        console.log('\n❌ Task 执行失败！');
        console.log('错误信息:', task.error_message);
        return task;
      }

      // 等待后继续轮询
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
    } catch (error) {
      console.error('❌ 查询 Task 状态失败:', error);
      throw error;
    }
  }

  throw new Error('Task 执行超时');
}

/**
 * 测试 5: 获取用户的 Task 列表
 */
async function testGetUserTasks() {
  console.log('\n=== 测试 5: 获取用户的 Task 列表 ===\n');

  try {
    // 如果使用 Gateway，使用 /smartflow-tasks；否则使用 /tasks
    const path = process.env.GATEWAY_URL ? '/smartflow-tasks' : '/tasks';
    const result = await request('GET', `${path}?userId=test-user-123&limit=10`);
    console.log('✅ Task 列表获取成功');
    console.log('Task 数量:', result.count);
    console.log('\nTask 列表:');
    result.data.forEach((task: any, index: number) => {
      console.log(
        `  ${index + 1}. ${task.id}: ${task.status} (${task.progress}%)`
      );
    });
    return result.data;
  } catch (error) {
    console.error('❌ Task 列表获取失败:', error);
    throw error;
  }
}

/**
 * 测试 6: 获取用户的 Smartflow 列表
 */
async function testGetUserSmartflows() {
  console.log('\n=== 测试 6: 获取用户的 Smartflow 列表 ===\n');

  try {
    const result = await request(
      'GET',
      '/smartflows?userId=test-user-123&limit=10'
    );
    console.log('✅ Smartflow 列表获取成功');
    console.log('Smartflow 数量:', result.count);
    console.log('\nSmartflow 列表:');
    result.data.forEach((sf: any, index: number) => {
      console.log(`  ${index + 1}. ${sf.name} (${sf.id}): ${sf.status}`);
    });
    return result.data;
  } catch (error) {
    console.error('❌ Smartflow 列表获取失败:', error);
    throw error;
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('🚀 开始 Smartflow API 测试\n');
  console.log('API 地址:', API_BASE);
  if (process.env.GATEWAY_URL) {
    console.log('✅ 使用 Gateway 代理');
  } else {
    console.log('ℹ️  直接连接 mxmagent 服务');
  }
  console.log('');

  try {
    // 测试 1: 创建 Smartflow
    const smartflowId = await testCreateSmartflow();

    // 测试 2: 获取 Smartflow
    await testGetSmartflow(smartflowId);

    // 测试 3: 执行 Smartflow
    const taskId = await testExecuteSmartflow(smartflowId);

    // 测试 4: 查询 Task 状态（轮询直到完成）
    await testGetTaskStatus(taskId);

    // 测试 5: 获取用户的 Task 列表
    await testGetUserTasks();

    // 测试 6: 获取用户的 Smartflow 列表
    await testGetUserSmartflows();

    console.log('\n✅ 所有测试完成！\n');
  } catch (error) {
    console.error('\n❌ 测试过程中出现错误:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}
