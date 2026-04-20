/**
 * Agent Chat 核心服务
 * 
 * 使用 LangChain Expression Language (LEAP) 定义 Agent
 * 支持流式输出（打字机效果）
 */

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnableBranch, RunnableLambda } from '@langchain/core/runnables';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { DeerAPILLMService } from '../llm';
import { IntentDetectionTool, getAvailableNodes } from './tools/intent-detector';
import { BusinessExecutionTool } from './tools/business-executor';
import {
  type AgentMessage,
  type ConversationContext,
  type ConversationPhase,
  type IntentMatch,
  type ParameterSchema,
  type TaskInfo,
  type TaskStatus,
  type SendMessageRequest,
  type SendMessageResponse,
  BUSINESS_NODE_TEMPLATES,
} from './types';

// ==================== System Prompt ====================

const SYSTEM_PROMPT = `你是 supermxmai 的智能创作助手。

你的职责是帮助用户通过自然对话的方式，快速完成图片生成、视频制作、音频合成、文案创作等任务。

## 工作流程

1. **理解用户需求**
   - 仔细倾听用户的描述
   - 通过 intent_detection tool 识别用户的业务意图
   
2. **确认理解**
   - 用一句话确认你对需求的理解是否正确
   - 例如："我理解你要做淘宝女装摄影图，对吗？"
   
3. **收集必要参数**
   - 只询问必要的信息，避免过多提问
   - 优先少问，使用选项让用户快速选择
   
4. **汇总确认**
   - 在执行前，用简洁的语言汇总用户的设置
   - 明确告知将要执行什么
   
5. **执行并反馈**
   - 使用 business_execution tool 提交任务
   - 告知用户任务已提交，等待生成
   
## 重要原则

- **用户优先说目标**：不要让用户先选功能，而是理解他们的目标后帮他们匹配
- **先确认再执行**：任何生成任务都要先确认，避免误触发
- **像助理而非问卷机**：追问要自然、有逻辑，像对话一样
- **结果可迭代**：生成完成后，用户可以继续说"换一种风格"，不需要重新填写所有信息

## 业务能力范围

你现在可以处理以下类型的任务：
- 🖼️ 图片生成：人像摄影、电商主图、海报设计、插画、漫画等
- 🎬 视频生成：短视频、AI 视频
- ✏️ 文案创作：口播稿、脚本、歌词、大纲、润色等
- 🎵 音频合成：TTS 配音、音乐生成

## 输出格式

在对话的各个阶段，你的输出会包含不同类型的消息：
- text：普通对话文本（支持打字机效果）
- confirm_form：需要用户确认的参数表单
- task_created：任务已创建
- task_progress：任务执行进度
- task_completed：任务完成，返回结果

## 禁止事项

- 不要在没有确认的情况下擅自执行高成本任务（如视频生成）
- 不要暴露内部的参数名称（如 model、provider 等）
- 不要猜测用户意图，要用工具识别`;

// ==================== 会话存储（内存中，简单实现）====================

const sessions = new Map<string, ConversationContext>();

function getOrCreateSession(sessionId: string, userId: string): ConversationContext {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      userId,
      phase: 'idle',
      collectedParams: {},
      missingParams: [],
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessions.set(sessionId, session);
  }
  return session;
}

// ==================== Agent Service ====================

export class AgentChatService {
  private llm: DeerAPILLMService;
  private intentTool: IntentDetectionTool;
  private executionTool: BusinessExecutionTool;
  
  constructor() {
    // 初始化 LLM
    this.llm = new DeerAPILLMService({
      baseUrl: process.env.DEERAPI_BASE_URL || 'https://api.deerapi.com',
      apiKey: process.env.DEERAPI_API_KEY || '',
      modelName: process.env.AGENT_MODEL_NAME || 'gpt-4o-mini',
      temperature: 0.7,
    });
    
    // 初始化 Tools
    this.intentTool = new IntentDetectionTool();
    this.executionTool = new BusinessExecutionTool();
  }
  
  /**
   * 处理用户消息，返回流式响应
   * 
   * @param request 用户消息请求
   * @param onChunk 每次输出 chunk 时的回调（用于流式输出）
   */
  async processMessage(
    request: SendMessageRequest,
    onChunk: (event: SendMessageResponse) => void
  ): Promise<void> {
    const sessionId = request.sessionId || `session_${Date.now()}`;
    const session = getOrCreateSession(sessionId, request.userId);
    
    // 记录用户消息
    session.messages.push({
      id: `msg_${Date.now()}`,
      role: 'user',
      content: request.message,
      timestamp: new Date(),
    });
    
    try {
      // 根据会话阶段决定下一步
      switch (session.phase) {
        case 'idle':
          await this.handleIntentDetection(session, request, onChunk);
          break;
        case 'awaiting_confirm':
          await this.handleNodeConfirm(session, request, onChunk);
          break;
        case 'collecting_params':
          await this.handleParamCollection(session, request, onChunk);
          break;
        case 'awaiting_execution':
          await this.handleExecutionConfirm(session, request, onChunk);
          break;
        default:
          // 默认回到意图识别
          session.phase = 'idle';
          await this.handleIntentDetection(session, request, onChunk);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      onChunk({
        sessionId,
        event: 'error',
        content: `处理消息时出错：${errorMsg}`,
      });
    }
    
    // 更新会话
    session.updatedAt = new Date();
  }
  
  /**
   * 第一阶段：意图识别
   */
  private async handleIntentDetection(
    session: ConversationContext,
    request: SendMessageRequest,
    onChunk: (event: SendMessageResponse) => void
  ): Promise<void> {
    session.phase = 'intent_detecting';
    
    // 调用意图识别 Tool
    const intentResult = await this.intentTool.invoke(request.message);
    const parsed = JSON.parse(intentResult);
    
    if (!parsed.success || !parsed.intent) {
      // 无法识别意图，返回引导消息
      onChunk({
        sessionId: session.sessionId,
        event: 'text',
        content: parsed.message || '抱歉，我无法理解您的需求。您可以尝试说"帮我做海报"或"写一段口播稿"等。',
      });
      session.phase = 'idle';
      return;
    }
    
    const intent: IntentMatch = parsed.intent;
    
    // 发送意图确认消息
    onChunk({
      sessionId: session.sessionId,
      event: 'intent_detected',
      content: parsed.intent.confirmMessage,
      intent,
    });
    
    // 保存匹配结果
    session.matchedNode = intent;
    
    // 如果是高置信度，附带参数确认表单
    if (intent.confidence === 'high') {
      const template = BUSINESS_NODE_TEMPLATES.find(t => t.id === intent.template);
      if (template) {
        // 应用用户已提到的参数
        const collectedParams = this.extractKnownParams(request.message, template.parameterSchema);
        session.collectedParams = collectedParams;
        
        // 找出缺失的必填参数
        const missingParams = template.parameterSchema.filter(
          p => p.required && !(p.name in collectedParams) && collectedParams[p.name] === undefined
        );
        session.missingParams = missingParams;
        
        if (missingParams.length === 0) {
          // 参数已齐全，进入确认执行阶段
          session.phase = 'awaiting_execution';
          const summary = this.buildParamSummary(template, collectedParams);
          onChunk({
            sessionId: session.sessionId,
            event: 'confirm_form',
            content: `好的，我将为你生成：${summary}。是否开始？`,
            confirmForm: {
              title: template.name,
              summary,
              schema: template.parameterSchema.map(p => ({
                ...p,
                // 如果已有值，设置为默认值
                defaultValue: (collectedParams[p.name] ?? p.defaultValue) as ParameterSchema["defaultValue"],
              })),
            },
          });
        } else {
          // 需要补充参数
          session.phase = 'collecting_params';
          const firstMissing = missingParams[0];
          onChunk({
            sessionId: session.sessionId,
            event: 'confirm_form',
            content: `了解了！我还需要确认几个信息：${this.buildMissingParamsQuestion(missingParams)}`,
            confirmForm: {
              title: template.name,
              summary: this.buildParamSummary(template, collectedParams),
              schema: missingParams.map(p => ({
                ...p,
                defaultValue: (collectedParams[p.name] ?? p.defaultValue) as ParameterSchema["defaultValue"],
              })),
            },
          });
        }
        return;
      }
    }
    
    // 中低置信度，等待用户确认
    session.phase = 'awaiting_confirm';
    
    // 发送候选列表
    const candidatesText = parsed.candidates
      .map((c: { name: string; reason: string }, i: number) => `${i + 1}. ${c.name}（${c.reason}）`)
      .join('\n');
    
    onChunk({
      sessionId: session.sessionId,
      event: 'text',
      content: `我帮你找到了一些可能的需求：\n${candidatesText}\n\n请确认是哪一个，或者继续描述你的需求。`,
    });
  }
  
  /**
   * 处理节点确认（awaiting_confirm 阶段）
   */
  private async handleNodeConfirm(
    session: ConversationContext,
    request: SendMessageRequest,
    onChunk: (event: SendMessageResponse) => void
  ): Promise<void> {
    const matched = session.matchedNode;
    if (!matched) {
      session.phase = 'idle';
      return;
    }
    
    // 用户确认了某个节点
    const template = BUSINESS_NODE_TEMPLATES.find(t => t.id === matched.template);
    if (!template) {
      session.phase = 'idle';
      return;
    }
    
    const userResponse = request.message.trim();
    const isConfirm = ['对', '是', 'ok', '好', '确认', '是的', 'correct', 'yes', 'y'].some(
      kw => userResponse.includes(kw)
    );
    
    if (isConfirm) {
      // 用户确认，开始收集参数
      session.phase = 'collecting_params';
      const firstMissing = template.parameterSchema.find(
        p => p.required && !(p.name in session.collectedParams)
      );
      
      if (firstMissing) {
        session.missingParams = template.parameterSchema.filter(
          p => p.required && !(p.name in session.collectedParams)
        );
        onChunk({
          sessionId: session.sessionId,
          event: 'confirm_form',
          content: `好的，${this.buildMissingParamsQuestion(session.missingParams)}`,
          confirmForm: {
            title: template.name,
            summary: '',
            schema: session.missingParams.map(p => ({
              ...p,
              defaultValue: (session.collectedParams[p.name] ?? p.defaultValue) as ParameterSchema["defaultValue"],
            })),
          },
        });
      }
    } else {
      // 用户否定或不确定，重新识别
      session.matchedNode = undefined;
      session.phase = 'idle';
      await this.handleIntentDetection(session, request, onChunk);
    }
  }
  
  /**
   * 处理参数收集（collecting_params 阶段）
   */
  private async handleParamCollection(
    session: ConversationContext,
    request: SendMessageRequest,
    onChunk: (event: SendMessageResponse) => void
  ): Promise<void> {
    const matched = session.matchedNode;
    if (!matched) {
      session.phase = 'idle';
      return;
    }
    
    const template = BUSINESS_NODE_TEMPLATES.find(t => t.id === matched.template);
    if (!template) {
      session.phase = 'idle';
      return;
    }
    
    // 解析用户输入的参数
    // 简单实现：从用户消息中尝试提取参数
    const userInput = request.message;
    const extractedParams = this.parseParamsFromText(userInput, template.parameterSchema);
    
    // 合并已收集的参数
    session.collectedParams = { ...session.collectedParams, ...extractedParams };
    
    // 检查还缺失哪些必填参数
    const stillMissing = template.parameterSchema.filter(
      p => p.required && session.collectedParams[p.name] === undefined
    );
    
    if (stillMissing.length > 0) {
      // 还有缺失，继续询问
      session.missingParams = stillMissing;
      onChunk({
        sessionId: session.sessionId,
        event: 'confirm_form',
        content: `好的，已收到。继续确认：${this.buildMissingParamsQuestion(stillMissing)}`,
        confirmForm: {
          title: template.name,
          summary: this.buildParamSummary(template, session.collectedParams),
          schema: stillMissing.map(p => ({
            ...p,
            defaultValue: (session.collectedParams[p.name] ?? p.defaultValue) as ParameterSchema["defaultValue"],
          })),
        },
      });
    } else {
      // 参数已齐全，进入确认执行阶段
      session.phase = 'awaiting_execution';
      session.missingParams = [];
      const summary = this.buildParamSummary(template, session.collectedParams);
      onChunk({
        sessionId: session.sessionId,
        event: 'confirm_form',
        content: `已收到所有信息。\n\n📋 确认清单：\n${summary}\n\n是否开始生成？`,
        confirmForm: {
          title: template.name,
          summary,
          schema: template.parameterSchema.map(p => ({
            ...p,
            defaultValue: (session.collectedParams[p.name] ?? p.defaultValue) as ParameterSchema["defaultValue"],
          })),
        },
      });
    }
  }
  
  /**
   * 处理执行确认（awaiting_execution 阶段）
   */
  private async handleExecutionConfirm(
    session: ConversationContext,
    request: SendMessageRequest,
    onChunk: (event: SendMessageResponse) => void
  ): Promise<void> {
    const matched = session.matchedNode;
    if (!matched) {
      session.phase = 'idle';
      return;
    }
    
    const userResponse = request.message.trim();
    const isConfirm = ['对', '是', 'ok', '好', '确认', '开始', '是的', 'correct', 'yes', 'y', '执行', '生成'].some(
      kw => userResponse.includes(kw)
    );
    
    if (!isConfirm) {
      // 用户取消，回到 idle
      session.phase = 'idle';
      session.matchedNode = undefined;
      session.collectedParams = {};
      session.missingParams = [];
      onChunk({
        sessionId: session.sessionId,
        event: 'text',
        content: '好的，已取消。你可以直接重新描述你的需求。',
      });
      return;
    }
    
    // 用户确认，执行任务
    const template = BUSINESS_NODE_TEMPLATES.find(t => t.id === matched.template);
    if (!template) {
      onChunk({
        sessionId: session.sessionId,
        event: 'error',
        content: '未找到对应的业务节点配置',
      });
      return;
    }
    
    session.phase = 'executing';
    
    try {
      // 调用业务执行 Tool
      const execResult = await this.executionTool.invoke(JSON.stringify({
        nodeId: template.id,
        params: session.collectedParams,
        userId: session.userId,
      }));
      
      const parsed = JSON.parse(execResult);
      
      if (!parsed.success) {
        onChunk({
          sessionId: session.sessionId,
          event: 'error',
          content: `任务提交失败：${parsed.error}`,
        });
        session.phase = 'idle';
        return;
      }
      
      const taskId = parsed.taskId;
      session.taskId = taskId;
      
      onChunk({
        sessionId: session.sessionId,
        event: 'task_created',
        content: `✅ 任务已提交！任务ID：${taskId}\n正在生成中，请稍候...`,
        task: {
          taskId,
          status: 'pending',
          progress: 0,
          progressText: '任务已提交',
        },
      });
      
      // 模拟任务进度（实际应该通过 SSE 或轮询获取真实进度）
      // 这里在后台模拟进度更新
      this.simulateTaskProgress(session, onChunk);
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onChunk({
        sessionId: session.sessionId,
        event: 'error',
        content: `执行失败：${errorMsg}`,
      });
      session.phase = 'idle';
    }
  }
  
  /**
   * 模拟任务进度（实际项目中应替换为真实的 SSE/轮询）
   */
  private simulateTaskProgress(
    session: ConversationContext,
    onChunk: (event: SendMessageResponse) => void
  ): void {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      
      if (progress >= 100) {
        clearInterval(interval);
        session.phase = 'completed';
        
        onChunk({
          sessionId: session.sessionId,
          event: 'task_completed',
          content: `🎉 生成完成！`,
          task: {
            taskId: session.taskId!,
            status: 'completed',
            progress: 100,
            progressText: '已完成',
            result: {
              type: session.matchedNode!.nodeType === 'video' ? 'video' :
                    session.matchedNode!.nodeType === 'audio' ? 'audio' :
                    session.matchedNode!.nodeType === 'writing' ? 'writing' : 'image',
              urls: [], // 实际应从任务结果获取
              metadata: { sessionId: session.sessionId },
            },
          },
        });
        
        // 重置会话状态，允许继续迭代
        session.phase = 'idle';
        session.matchedNode = undefined;
        session.collectedParams = {};
        session.missingParams = [];
        session.taskId = undefined;
      } else {
        onChunk({
          sessionId: session.sessionId,
          event: 'task_progress',
          content: `正在生成中... ${progress}%`,
          task: {
            taskId: session.taskId!,
            status: 'processing',
            progress,
            progressText: `生成中... ${progress}%`,
          },
        });
      }
    }, 2000);
  }
  
  // ==================== 辅助方法 ====================
  
  /**
   * 从用户消息中提取已知参数
   */
  private extractKnownParams(
    userInput: string,
    schema: ParameterSchema[]
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    const input = userInput.toLowerCase();
    
    for (const field of schema) {
      if (field.type === 'select' && field.options) {
        // 尝试匹配选项
        for (const opt of field.options) {
          if (input.includes(opt.label.toLowerCase()) || input.includes(opt.value.toLowerCase())) {
            params[field.name] = opt.value;
            break;
          }
        }
      }
      
      // 数量匹配
      if (field.name === 'count') {
        const countMatch = input.match(/(\d+)\s*[张开个幅]/);
        if (countMatch) {
          params[field.name] = countMatch[1];
        }
      }
    }
    
    return params;
  }
  
  /**
   * 从用户文本解析参数
   */
  private parseParamsFromText(
    userInput: string,
    schema: ParameterSchema[]
  ): Record<string, unknown> {
    return this.extractKnownParams(userInput, schema);
  }
  
  /**
   * 构建缺失参数的询问问题
   */
  private buildMissingParamsQuestion(missingParams: ParameterSchema[]): string {
    if (missingParams.length === 0) return '';
    
    const questions: string[] = [];
    for (const param of missingParams) {
      if (param.type === 'select' && param.options) {
        const optionsText = param.options.map(o => `「${o.label}」`).join('、');
        questions.push(`${param.label}（${optionsText}）`);
      } else if (param.type === 'text') {
        questions.push(`${param.label}${param.placeholder ? `（${param.placeholder}）` : ''}`);
      } else if (param.type === 'number') {
        questions.push(`${param.label}`);
      } else if (param.type === 'imageRef') {
        questions.push(`${param.label}（可上传参考图）`);
      }
    }
    
    return questions.join('、');
  }
  
  /**
   * 构建参数汇总文本
   */
  private buildParamSummary(
    template: typeof BUSINESS_NODE_TEMPLATES[number],
    params: Record<string, unknown>
  ): string {
    const lines: string[] = [`📦 类型：${template.name}`];
    
    for (const field of template.parameterSchema) {
      const value = params[field.name];
      if (value !== undefined) {
        if (field.type === 'select' && field.options) {
          const opt = field.options.find(o => o.value === value);
          lines.push(`- ${field.label}：${opt?.label || value}`);
        } else {
          lines.push(`- ${field.label}：${value}`);
        }
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取会话状态
   */
  getSession(sessionId: string): ConversationContext | undefined {
    return sessions.get(sessionId);
  }
  
  /**
   * 清除会话
   */
  clearSession(sessionId: string): void {
    sessions.delete(sessionId);
  }
}
