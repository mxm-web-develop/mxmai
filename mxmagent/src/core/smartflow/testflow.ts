/**
 * 三步简单工作流测试
 * 使用 LangGraph 实现一个简单的三步工作流
 */

import { StateGraph, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { MXMCGIChatModel } from '../../utils/mxmcgi-llm';
import { SmartflowChunk } from '../../types/stream';

/**
 * 工作流状态定义
 */
interface TestFlowState {
  messages: BaseMessage[];
  step1Result?: string;
  step2Result?: string;
  step3Result?: string;
  [key: string]: any; // 索引签名，满足 LangGraph 的类型要求
}

/**
 * 步骤1：理解用户输入
 */
async function step1Understand(state: TestFlowState): Promise<Partial<TestFlowState>> {
  console.log('📝 步骤1: 理解用户输入');
  
  const llm = MXMCGIChatModel.fromEnv('gpt-5-nano');
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage) {
    throw new Error('没有用户消息');
  }
  
  const userContent = typeof lastMessage.content === 'string' 
    ? lastMessage.content 
    : String(lastMessage.content);
  
  const prompt = `请分析以下用户输入，提取关键信息：
  
用户输入：${userContent}

请用一句话总结用户想要什么。`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const result = typeof response.content === 'string' ? response.content : String(response.content);
  
  console.log('✅ 步骤1完成:', result);
  
  return {
    step1Result: result,
  };
}

/**
 * 步骤2：处理信息
 */
async function step2Process(state: TestFlowState): Promise<Partial<TestFlowState>> {
  console.log('⚙️ 步骤2: 处理信息');
  
  const llm = MXMCGIChatModel.fromEnv('gpt-5-nano');
  
  const prompt = `基于以下理解，生成一个处理方案：
  
理解结果：${state.step1Result}

请生成一个简洁的处理方案（2-3句话）。`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const result = typeof response.content === 'string' ? response.content : String(response.content);
  
  console.log('✅ 步骤2完成:', result);
  
  return {
    step2Result: result,
  };
}

/**
 * 步骤3：生成回复
 */
async function step3Respond(state: TestFlowState): Promise<Partial<TestFlowState>> {
  console.log('💬 步骤3: 生成回复');
  
  const llm = MXMCGIChatModel.fromEnv('gpt-5-nano');
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage) {
    throw new Error('没有用户消息');
  }
  
  const userContent = typeof lastMessage.content === 'string' 
    ? lastMessage.content 
    : String(lastMessage.content);
  
  const prompt = `基于以下信息，生成一个友好的回复：
  
用户输入：${userContent}
理解结果：${state.step1Result}
处理方案：${state.step2Result}

请生成一个自然、友好的回复。`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const result = typeof response.content === 'string' ? response.content : String(response.content);
  
  console.log('✅ 步骤3完成:', result);
  
  return {
    step3Result: result,
    messages: [new AIMessage(result)],
  };
}

/**
 * 构建工作流图
 */
function createTestFlow() {
  const workflow = new StateGraph<TestFlowState>({
    channels: {
      messages: {
        reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
      step1Result: {
        reducer: (x: string | undefined, y: string | undefined) => y ?? x,
      },
      step2Result: {
        reducer: (x: string | undefined, y: string | undefined) => y ?? x,
      },
      step3Result: {
        reducer: (x: string | undefined, y: string | undefined) => y ?? x,
      },
    },
  } as any)
    .addNode('step1', step1Understand as any)
    .addNode('step2', step2Process as any)
    .addNode('step3', step3Respond as any)
    .setEntryPoint('step1')
    .addEdge('step1', 'step2')
    .addEdge('step2', 'step3')
    .addEdge('step3', END);

  return workflow.compile();
}

/**
 * 执行测试工作流
 */
export async function runTestFlow(userInput: string): Promise<string> {
  console.log('🚀 开始执行测试工作流');
  console.log('用户输入:', userInput);
  console.log('---');

  const app = createTestFlow();

  const initialState: TestFlowState = {
    messages: [new HumanMessage(userInput)],
  };

  const result = await app.invoke(initialState as any) as TestFlowState;

  console.log('---');
  console.log('✨ 工作流执行完成');
  console.log('最终回复:', result.step3Result);

  return result.step3Result || '';
}

/**
 * 流式执行测试工作流
 * 返回 SmartflowChunk 格式的数据
 */
export async function* runTestFlowStream(
  userInput: string,
  taskId?: string
): AsyncGenerator<SmartflowChunk, void, unknown> {
  console.log('🚀 开始流式执行测试工作流');
  console.log('用户输入:', userInput);
  console.log('---');

  const app = createTestFlow();
  const flowTaskId = taskId || `task-${Date.now()}`;
  const flowChain: any[] = []; // 收集思维链数据

  const initialState = {
    messages: [new HumanMessage(userInput)],
  };

  // 步骤1：理解用户输入 - 开始
  const step1StartTime = Date.now();
  yield {
    task_id: flowTaskId,
    flow_name: 'testflow',
    node_name: 'thinking', // 使用 'thinking' 作为节点名，符合用户示例
    node_state: 'processing',
    reply: {
      content: '',
      type: 'markdown',
    },
    tokens: 0,
  };

  // 执行步骤1
  const step1State = await step1Understand(initialState as TestFlowState);
  const step1Result = step1State.step1Result || '';

  // 步骤1完成
  yield {
    task_id: flowTaskId,
    flow_name: 'testflow',
    node_name: 'thinking',
    node_state: 'completed',
    reply: {
      content: step1Result,
      type: 'markdown',
    },
    tokens: 0,
  };

  // 添加到思维链
  flowChain.push({
    type: 'thinking',
    timestamp: step1StartTime,
    state: 'completed',
    error_msg: '',
    content: step1Result,
  });

  // 步骤2：处理信息 - 开始
  const step2StartTime = Date.now();
  yield {
    task_id: flowTaskId,
    flow_name: 'testflow',
    node_name: 'processing',
    node_state: 'processing',
    reply: {
      content: '',
      type: 'markdown',
    },
    tokens: 0,
  };

  // 执行步骤2
  const step2State = await step2Process({
    ...initialState,
    ...step1State,
  } as TestFlowState);
  const step2Result = step2State.step2Result || '';

  // 步骤2完成
  yield {
    task_id: flowTaskId,
    flow_name: 'testflow',
    node_name: 'processing',
    node_state: 'completed',
    reply: {
      content: step2Result,
      type: 'markdown',
    },
    tokens: 0,
  };

  // 添加到思维链
  flowChain.push({
    type: 'processing',
    timestamp: step2StartTime,
    state: 'completed',
    error_msg: '',
    content: step2Result,
  });

  // 步骤3：生成回复 - 开始
  const step3StartTime = Date.now();
  yield {
    task_id: flowTaskId,
    flow_name: 'testflow',
    node_name: 'content_output',
    node_state: 'processing',
    reply: {
      content: '',
      type: 'markdown',
    },
    tokens: 0,
  };

  // 执行步骤3
  const step3State = await step3Respond({
    ...initialState,
    ...step1State,
    ...step2State,
  } as TestFlowState);
  const step3Result = step3State.step3Result || '';

  // 流式输出最终回复内容
  if (step3Result && typeof step3Result === 'string') {
    const words = step3Result.split('');
    for (let i = 0; i < words.length; i++) {
      yield {
        task_id: flowTaskId,
        flow_name: 'testflow',
        node_name: 'content_output',
        node_state: 'processing',
        reply: {
          content: words.slice(0, i + 1).join(''),
          type: 'markdown',
        },
        tokens: 0,
      };
      // 添加小延迟以模拟流式效果
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  // 步骤3完成
  yield {
    task_id: flowTaskId,
    flow_name: 'testflow',
    node_name: 'content_output',
    node_state: 'completed',
    reply: {
      content: step3Result,
      type: 'markdown',
    },
    tokens: 0,
    flow_chain: flowChain, // 在最后一个 chunk 中包含完整的 flow_chain
  };
}

/**
 * 获取工作流的思维链数据（用于存储）
 */
export function getFlowChainFromStream(chunks: SmartflowChunk[]): any[] {
  const flowChain: any[] = [];
  const nodeMap = new Map<string, any>();

  for (const chunk of chunks) {
    const nodeName = chunk.node_name;
    const existing = nodeMap.get(nodeName);

    if (chunk.node_state === 'processing' && !existing) {
      // 节点开始
      nodeMap.set(nodeName, {
        type: nodeName,
        timestamp: Date.now(),
        state: 'processing',
        error_msg: '',
        content: chunk.reply.content || '',
      });
    } else if (chunk.node_state === 'completed') {
      // 节点完成
      const node = nodeMap.get(nodeName) || {
        type: nodeName,
        timestamp: Date.now(),
        state: 'completed',
        error_msg: '',
        content: '',
      };
      node.state = 'completed';
      node.content = chunk.reply.content || node.content;
      nodeMap.set(nodeName, node);
    } else if (chunk.node_state === 'failed' || chunk.node_state === 'error') {
      // 节点失败
      const node = nodeMap.get(nodeName) || {
        type: nodeName,
        timestamp: Date.now(),
        state: 'failed' as const,
        error_msg: '',
        content: '',
      };
      node.state = 'failed';
      node.error_msg = (chunk as any).error_msg || '';
      nodeMap.set(nodeName, node);
    }
  }

  // 转换为数组
  for (const [_, node] of nodeMap) {
    flowChain.push(node);
  }

  return flowChain;
}

export { createTestFlow };
