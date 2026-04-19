/**
 * Agent Chat API - Chat Processing Logic
 * 支持 SSE 流式响应 + 业务节点识别 + 参数补问 + 任务触发
 */

import type { Request, Response } from 'express';
import type { ProviderType } from '../models/providers';
import type { AgentChatRequest, AgentChatEvent, SessionContext } from './types';
import { detectIntent, getBusinessNode, getNextFieldToAsk, businessNodes } from './intent-detector';
import { runByModelKey } from '../models/run';
import { listEnabledModelKeysByScope } from '../models/provider-model-catalog';
import { mxmCGIHttpClient } from '../smartflow/services/httpClient';
import { taskExecutor } from '../task/task-executor';
import crypto from 'crypto';

// ==================== Admin Model Config ====================

interface AdminModelConfig {
  model_key: string;
  temperature: number;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
}

/**
 * 从 DB 读取 Admin 模型配置（带内存缓存，避免每次请求都查 DB）
 * 缓存 TTL: 30 秒
 */
let _cachedAdminConfig: AdminModelConfig | null = null;
let _cacheTimestamp = 0;
const ADMIN_CONFIG_CACHE_TTL_MS = 30_000;

async function getAdminModelConfig(): Promise<AdminModelConfig> {
  const now = Date.now();
  if (_cachedAdminConfig && now - _cacheTimestamp < ADMIN_CONFIG_CACHE_TTL_MS) {
    return _cachedAdminConfig;
  }

  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createModelConfigRepository();
    const cfg = await repo.getConfig();

    _cachedAdminConfig = {
      model_key: cfg.model_key,
      temperature: cfg.temperature,
      max_tokens: cfg.max_tokens ?? null,
      top_p: cfg.top_p ?? null,
      frequency_penalty: cfg.frequency_penalty ?? null,
      presence_penalty: cfg.presence_penalty ?? null,
    };
    _cacheTimestamp = now;
    return _cachedAdminConfig;
  } catch (err) {
    console.error('[AgentChat] Failed to load admin model config, using defaults:', err);
    // Fallback to defaults
    if (!_cachedAdminConfig) {
      _cachedAdminConfig = {
        model_key: getDefaultTextModel(),
        temperature: 0.7,
        max_tokens: null,
        top_p: null,
        frequency_penalty: null,
        presence_penalty: null,
      };
      _cacheTimestamp = now;
    }
    return _cachedAdminConfig;
  }
}

/**
 * 清除 Admin 模型配置缓存（配置更新后调用）
 */
export function clearAdminModelConfigCache(): void {
  _cachedAdminConfig = null;
  _cacheTimestamp = 0;
}

// ==================== Session Store ====================

const sessions: Map<string, SessionContext> = new Map();
const SESSION_MAX_MESSAGES = 20;
const SESSION_TTL_MS = 30 * 60 * 1000;

function getOrCreateSession(sessionId?: string): SessionContext {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActiveAt = Date.now();
    return session;
  }
  const id = sessionId || crypto.randomUUID();
  const session: SessionContext = { id, messages: [], createdAt: Date.now(), lastActiveAt: Date.now() };
  sessions.set(id, session);
  return session;
}

function addMessageToSession(session: SessionContext, role: 'user' | 'assistant', content: string): void {
  session.messages.push({ role, content, timestamp: Date.now() });
  if (session.messages.length > SESSION_MAX_MESSAGES) {
    session.messages = session.messages.slice(-SESSION_MAX_MESSAGES);
  }
}

function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActiveAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

if (typeof setInterval !== 'undefined') {
  setInterval(cleanExpiredSessions, 5 * 60 * 1000);
}

// ==================== Helpers ====================

function getDefaultTextModel(): string {
  const models = listEnabledModelKeysByScope('text');
  const fastModel = models.find(m =>
    m.toLowerCase().includes('mini') ||
    m.toLowerCase().includes('fast') ||
    m.toLowerCase().includes('quick')
  );
  // Fallback to GLM-5-Turbo (a known available model) to avoid gemini-2-5-flash pricing error
  return fastModel || models[0] || 'GLM-5-Turbo';
}

/**
 * 获取可用的 text 模型列表（供外部调用）
 */
export function getAvailableTextModels(): string[] {
  return listEnabledModelKeysByScope('text');
}

// ==================== 任务修改意图检测 ====================

interface TaskModifyIntent {
  targetIndex?: number;
  field?: string;
  value?: string;
  rawMessage: string;
}

/**
 * 检测用户消息是否包含任务修改意图
 * 匹配模式："第X张..." + 修改动词（换/改/调整） + 属性词
 */
function detectTaskModifyIntent(message: string): TaskModifyIntent | null {
  const lowerMsg = message.toLowerCase();

  // 匹配"第X张"模式
  const indexMatch = message.match(/第(\d+)[张条个幅份]/);
  const targetIndex = indexMatch ? parseInt(indexMatch[1], 10) : undefined;

  // 修改动词
  const modifyVerbs = ['换', '改', '调整', '调', '变', '改下', '换下', '调下', '改一下', '换一下', '调一下'];
  const hasModifyVerb = modifyVerbs.some(v => lowerMsg.includes(v));

  // 属性词
  const fieldMap: Array<{ pattern: RegExp; field: string; valueExtractor: (msg: string) => string | undefined }> = [
    { pattern: /色[调温]?/i, field: 'color', valueExtractor: (msg) => {
      const warmMatch = msg.match(/暖色/i);
      const coolMatch = msg.match(/冷色/i);
      const colorMatch = msg.match(/(#[0-9a-fA-F]{6}|rgb\([^)]+\)|\w+色)/);
      if (warmMatch) return '暖色调';
      if (coolMatch) return '冷色调';
      return colorMatch ? colorMatch[1] : undefined;
    }},
    { pattern: /风格|风/i, field: 'style', valueExtractor: (msg) => {
      const styles = ['韩系清冷', '日系甜美', '欧美元素', '复古', '现代', '简约', 'ins风', '小清新'];
      for (const s of styles) { if (msg.includes(s)) return s; }
      return undefined;
    }},
    { pattern: /数量|张/i, field: 'count', valueExtractor: (msg) => {
      const countMatch = msg.match(/(\d+)[张条个幅份]/);
      return countMatch ? countMatch[1] : undefined;
    }},
    { pattern: /比例|横竖|宽高/i, field: 'aspectRatio', valueExtractor: (msg) => {
      if (msg.includes('3:4') || msg.includes('竖')) return '3:4';
      if (msg.includes('4:3') || msg.includes('横')) return '4:3';
      if (msg.includes('1:1') || msg.includes('方形')) return '1:1';
      if (msg.includes('16:9')) return '16:9';
      return undefined;
    }},
    { pattern: /尺寸|大[小片图]|分?辨率/i, field: 'size', valueExtractor: () => undefined },
  ];

  // 如果有修改动词，认为是修改意图
  if (hasModifyVerb || targetIndex !== undefined) {
    let field: string | undefined;
    let value: string | undefined;

    for (const { pattern, field: f, valueExtractor } of fieldMap) {
      if (pattern.test(message)) {
        field = f;
        value = valueExtractor(message);
        break;
      }
    }

    // 如果没有匹配到具体字段，但有修改动词，也认为是修改
    if (field === undefined && hasModifyVerb) {
      // 通用修改意图
      field = 'general';
      value = message;
    }

    return { targetIndex, field, value, rawMessage: message };
  }

  return null;
}

function buildChatPrompt(session: SessionContext, currentMessage: string, systemPrompt: string): string {
  const parts: string[] = [];
  if (systemPrompt) parts.push(`[系统设定] ${systemPrompt}`);
  if (session.messages.length > 0) {
    const recent = session.messages.slice(-6);
    parts.push(`[对话历史]\n${recent.map(m => `[${m.role === 'user' ? '用户' : '助手'}] ${m.content}`).join('\n')}`);
  }
  parts.push(`[当前消息] ${currentMessage}`);
  parts.push('[助手] ');
  return parts.join('\n\n');
}

/** 发送 SSE 事件 */
function emit(res: Response, event: AgentChatEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** 生成模拟任务 ID */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== 任务执行 ====================

/**
 * 执行生成任务（调用真实 API）
 * nodeType 格式: 'graph/photograph' | 'writing/article' | etc.
 * 解析为 scope 和 taskKey
 */
async function* simulateTaskExecution(
  nodeType: string,
  params: Record<string, string | number | boolean>,
  taskId: string,
  userId: string
): AsyncGenerator<AgentChatEvent> {
  // 解析 nodeType: 'graph/photograph' -> scope='graph', taskKey='photograph'
  const parts = nodeType.split('/');
  const scope = parts[0] as 'graph' | 'writing' | 'audio' | 'video' | 'text' | 'outline';
  const taskKey = parts[1] || nodeType;

  const nodeName = businessNodes[nodeType]?.name || nodeType;

  // 步骤 1: 调用 runTask 创建任务
  yield {
    type: 'task_progress',
    task: { taskId, nodeType, nodeName, status: 'progress', progress: 10, text: '正在创建任务…' },
  };

  let runResult: any;
  try {
    runResult = await mxmCGIHttpClient.runTask(scope, taskKey, params as Record<string, any>, userId);
  } catch (err: any) {
    yield {
      type: 'task_done',
      task: {
        taskId,
        nodeType,
        nodeName,
        status: 'error',
        progress: 0,
        resultUrls: [],
        text: `任务创建失败: ${err.message}`,
      },
    };
    return;
  }

  // 同步类型 (text) 直接返回结果
  if (runResult.syncResult) {
    yield {
      type: 'task_progress',
      task: { taskId, nodeType, nodeName, status: 'progress', progress: 90, text: '正在处理结果…' },
    };
    const text = runResult.syncResult.text || '';
    yield {
      type: 'task_done',
      task: {
        taskId,
        nodeType,
        nodeName,
        status: 'done',
        progress: 100,
        resultUrls: [],
        text: text || '生成完成！',
      },
    };
    return;
  }

  // 异步类型: 轮询任务状态直到完成
  const realTaskId = runResult.taskId;
  const maxPolls = 60; // 最多等 60 * 2s = 120s
  let pollCount = 0;

  yield {
    type: 'task_progress',
    task: { taskId: realTaskId, nodeType, nodeName, status: 'progress', progress: 20, text: '任务已创建，正在排队…' },
  };

  while (pollCount < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    pollCount++;

    const taskManager = taskExecutor.getTaskManager();
    const { task } = await taskManager.getTask(realTaskId);

    if (!task) {
      yield {
        type: 'task_done',
        task: { taskId: realTaskId, nodeType, nodeName, status: 'error', progress: 0, resultUrls: [], text: '任务不存在' },
      };
      return;
    }

    const progress = Math.min(90, 20 + Math.floor((pollCount / maxPolls) * 70));
    const statusText =
      task.status === 'queued' ? '任务排队中…' :
      task.status === 'processing' ? '正在生成内容…' :
      task.status === 'completed' ? '生成完成！' :
      task.status === 'failed' ? '生成失败' :
      `处理中 (${task.status})`;

    yield {
      type: 'task_progress',
      task: { taskId: realTaskId, nodeType, nodeName, status: task.status === 'completed' ? 'done' : 'progress', progress, text: statusText },
    };

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      const resultUrls = task.result?.mediaUrls || [];
      yield {
        type: 'task_done',
        task: {
          taskId: realTaskId,
          nodeType,
          nodeName,
          status: task.status === 'completed' ? 'done' : task.status === 'failed' ? 'error' : task.status === 'cancelled' ? 'cancelled' : 'error',
          progress: task.status === 'completed' ? 100 : progress,
          resultUrls,
          text: task.status === 'completed' ? (resultUrls.length > 0 ? '生成完成！' : '生成完成（无结果）') : `生成${task.status === 'failed' ? '失败' : '取消'}`,
        },
      };
      return;
    }
  }

  // 超时
  yield {
    type: 'task_done',
    task: { taskId: realTaskId, nodeType, nodeName, status: 'error', progress: 0, resultUrls: [], text: '任务超时，请稍后重试' },
  };
}

// ==================== 主处理逻辑 ====================

export async function handleAgentChat(
  req: Request,
  res: Response,
  providerOverride?: string
): Promise<void> {
  const body = req.body as AgentChatRequest;
  const { message, sessionId } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Missing or invalid field: message' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.write(':\n\n');

  const session = getOrCreateSession(sessionId);

  try {
    addMessageToSession(session, 'user', message);

    // 首次连接：立即发送 sessionId
    emit(res, { type: 'text', sessionId: session.id, content: '' });

    // 所有用户统一使用 Admin 配置（不再接受前端传递的 modelKey/provider）
    const adminConfig = await getAdminModelConfig();
    const modelKey = adminConfig.model_key || getDefaultTextModel();
    const provider = (providerOverride || 'deer') as ProviderType;

    // === 流程状态机 ===
    const pendingNode = session.pendingNode;

    if (pendingNode) {
      // === 补问阶段：用户正在回复参数 ===
      const node = getBusinessNode(pendingNode.nodeType);
      if (!node) {
        session.pendingNode = undefined;
        await handleGeneralChat(res, session, message, modelKey, provider);
        return;
      }

      // 将用户回复解析为参数
      const newParams = parseUserReplyAsParams(message, pendingNode.params, node);

      // 检查下一个缺失字段
      const nextField = getNextFieldToAsk(pendingNode.nodeType, newParams);

      if (nextField) {
        // 继续补问
        session.pendingNode = {
          ...pendingNode,
          params: newParams,
          nextFieldToAsk: nextField.key,
        };
        session.lastActiveAt = Date.now();

        emit(res, {
          type: 'confirm',
          confirm: {
            confirmType: 'params',
            nodeType: pendingNode.nodeType,
            nodeName: pendingNode.nodeName,
            params: newParams,
            askingField: nextField.key,
            options: nextField.type === 'select' ? nextField.options : undefined,
            text: `请问「${nextField.label}」是？（${nextField.type === 'select' && nextField.options ? nextField.options.join('、') : '请描述'})`,
          },
        });
      } else {
        // 所有必填参数已收集 → 最终确认
        session.pendingNode = {
          ...pendingNode,
          params: newParams,
          confirmStep: 'final',
        };
        session.lastActiveAt = Date.now();

        const confirmText = node.confirmTemplate(newParams);
        emit(res, {
          type: 'confirm',
          confirm: {
            confirmType: 'final',
            nodeType: pendingNode.nodeType,
            nodeName: pendingNode.nodeName,
            params: newParams,
            text: confirmText,
          },
        });
      }

      res.end();
      return;
    }

    // === 非补问阶段：意图识别 ===
    const intentResult = detectIntent(message);

    if (intentResult.businessNode) {
      const { nodeType, nodeName, extractedParams, missingFields, confidenceLevel } = intentResult.businessNode;
      const node = getBusinessNode(nodeType)!;

      if (confidenceLevel === 'high' && missingFields.length === 0) {
        // 高置信度 + 参数完整 → 最终确认
        session.pendingNode = {
          nodeType,
          nodeName,
          params: extractedParams,
          confirmStep: 'final',
        };
        session.lastActiveAt = Date.now();

        const confirmText = node.confirmTemplate(extractedParams);
        emit(res, {
          type: 'confirm',
          confirm: {
            confirmType: 'final',
            nodeType,
            nodeName,
            params: extractedParams,
            text: confirmText,
          },
        });
        res.end();
        return;
      }

      if (confidenceLevel === 'high' && missingFields.length > 0) {
        // 高置信度但缺参数 → 节点确认 + 开始补问
        session.pendingNode = {
          nodeType,
          nodeName,
          params: extractedParams,
          confirmStep: 'node',
        };
        session.lastActiveAt = Date.now();

        emit(res, {
          type: 'confirm',
          confirm: {
            confirmType: 'node',
            nodeType,
            nodeName,
            params: extractedParams,
            text: `我理解你想做「${nodeName}」，对吗？`,
          },
        });

        // 用户确认后将进入补问阶段，这里先等用户回复
        res.end();
        return;
      }

      // 中/低置信度 → 先确认节点
      session.pendingNode = {
        nodeType,
        nodeName,
        params: extractedParams,
        confirmStep: 'node',
      };
      session.lastActiveAt = Date.now();

      emit(res, {
        type: 'confirm',
        confirm: {
          confirmType: 'node',
          nodeType,
          nodeName,
          params: extractedParams,
          text: `你是想做「${nodeName}」吗？（${intentResult.confidence < 0.5 ? '不太确定' : '稍微有点不确定'}，请确认）`,
        },
      });
      res.end();
      return;
    }

    // === P0-B3: 任务修改意图检测 ===
    // 用户说"第二张换暖色一点"等，应识别为修改当前任务
    if (session.currentTaskId) {
      const modifyMatch = detectTaskModifyIntent(message);
      if (modifyMatch) {
        session.pendingNode = {
          nodeType: session.currentNodeType || 'unknown',
          nodeName: '任务修改',
          params: {
            ...modifyMatch,
            taskId: session.currentTaskId,
          },
          confirmStep: 'final',
        };
        session.lastActiveAt = Date.now();
        emit(res, {
          type: 'confirm',
          confirm: {
            confirmType: 'final',
            nodeType: session.currentNodeType || 'unknown',
            nodeName: '任务修改',
            params: { taskId: session.currentTaskId, ...modifyMatch },
            text: `我来帮你修改任务「第${modifyMatch.targetIndex || '?'}张」：将${modifyMatch.field || '属性'}调整为「${modifyMatch.value || modifyMatch.rawMessage}」，可以吗？`,
          },
        });
        res.end();
        return;
      }
    }

    // === 通用问答 ===
    await handleGeneralChat(res, session, message, modelKey, provider);

  } catch (error) {
    console.error('[AgentChat] 处理消息失败:', error);
    emit(res, {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    res.end();
  }
}

/**
 * 处理通用聊天（纯文本模型）
 */
async function handleGeneralChat(
  res: Response,
  session: SessionContext,
  message: string,
  modelKey: string,
  provider: ProviderType
): Promise<void> {
  const { getSystemPromptForIntent } = await import('./intent-detector');
  const intentResult = detectIntent(message);
  const systemPrompt = getSystemPromptForIntent(intentResult.intent);

  addMessageToSession(session, 'user', message);

  const combinedPrompt = buildChatPrompt(session, message, systemPrompt);

  const result = await runByModelKey(
    'text',
    modelKey,
    { prompt: combinedPrompt, outputFormat: 'stream' },
    { providerOverride: provider }
  ) as { stream?: AsyncIterable<any>; streamString?: AsyncIterable<string> };

  let assistantMessage = '';

  if (result.stream) {
    for await (const chunk of result.stream) {
      const text = typeof chunk === 'string' ? chunk : (chunk.content || chunk.text || '');
      if (text) {
        assistantMessage += text;
        emit(res, { type: 'text', content: text });
      }
    }
  } else if (result.streamString) {
    for await (const text of result.streamString) {
      assistantMessage += text;
      emit(res, { type: 'text', content: text });
    }
  }

  if (assistantMessage) {
    addMessageToSession(session, 'assistant', assistantMessage);
  }

  emit(res, { type: 'done' });
  res.end();
}

/**
 * 处理用户确认（确认执行任务）
 * 外部可调用此函数处理 confirm 消息
 */
export async function handleUserConfirmation(
  req: Request,
  res: Response
): Promise<void> {
  const body = req.body as { sessionId: string; confirmed: boolean; params?: Record<string, string | number | boolean> };
  const { sessionId, confirmed, params: userParams } = body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(':\n\n');

  const session = sessions.get(sessionId);
  if (!session || !session.pendingNode) {
    emit(res, { type: 'error', error: '会话不存在或无待确认任务' });
    res.end();
    return;
  }

  const pending = session.pendingNode;

  if (!confirmed) {
    // 用户拒绝
    session.pendingNode = undefined;
    session.lastActiveAt = Date.now();
    emit(res, { type: 'text', content: '好的，已取消。有其他需要帮助的吗？' });
    emit(res, { type: 'done' });
    res.end();
    return;
  }

  // 用户确认
  if (pending.confirmStep === 'node') {
    // 节点确认后，开始补问参数
    const node = getBusinessNode(pending.nodeType);
    if (!node) {
      emit(res, { type: 'error', error: '未知节点类型' });
      res.end();
      return;
    }

    // 合并用户可能提供的参数
    const mergedParams = { ...pending.params, ...(userParams || {}) };
    const nextField = getNextFieldToAsk(pending.nodeType, mergedParams);

    if (nextField) {
      session.pendingNode = {
        ...pending,
        params: mergedParams,
        confirmStep: 'params',
        nextFieldToAsk: nextField.key,
      };
      session.lastActiveAt = Date.now();

      emit(res, {
        type: 'confirm',
        confirm: {
          confirmType: 'params',
          nodeType: pending.nodeType,
          nodeName: pending.nodeName,
          params: mergedParams,
          askingField: nextField.key,
          options: nextField.type === 'select' ? nextField.options : undefined,
          text: `请问「${nextField.label}」是？（${nextField.type === 'select' && nextField.options ? nextField.options.join('、') : '请描述'}）`,
        },
      });
    } else {
      // 无需补问，直接最终确认
      session.pendingNode = { ...pending, params: mergedParams, confirmStep: 'final' };
      session.lastActiveAt = Date.now();

      const confirmText = node.confirmTemplate(mergedParams);
      emit(res, {
        type: 'confirm',
        confirm: {
          confirmType: 'final',
          nodeType: pending.nodeType,
          nodeName: pending.nodeName,
          params: mergedParams,
          text: confirmText,
        },
      });
    }

    res.end();
    return;
  }

  if (pending.confirmStep === 'final') {
    // 最终确认 → 创建任务
    const taskId = generateTaskId();
    const nodeType = pending.nodeType;
    const nodeParams = { ...pending.params, ...(userParams || {}) };

    session.pendingNode = undefined;
    session.currentTaskId = taskId;
    session.currentNodeType = nodeType;
    session.lastActiveAt = Date.now();

    // 发送任务创建事件
    emit(res, {
      type: 'task_created',
      task: {
        taskId,
        nodeType,
        nodeName: pending.nodeName,
        status: 'created',
        progress: 0,
        text: `任务已提交，正在准备生成…`,
      },
    });

    // 执行任务
    const userId = (req.headers['x-user-id'] as string | undefined) || 'anonymous';
    for await (const event of simulateTaskExecution(nodeType, nodeParams, taskId, userId)) {
      emit(res, event);
    }

    emit(res, { type: 'done' });
    res.end();
    return;
  }

  // params 阶段的确认（用户回复了补问参数）
  if (pending.confirmStep === 'params' && userParams) {
    const node = getBusinessNode(pending.nodeType);
    if (!node) {
      emit(res, { type: 'error', error: '未知节点类型' });
      res.end();
      return;
    }

    const mergedParams = { ...pending.params, ...userParams };
    const nextField = getNextFieldToAsk(pending.nodeType, mergedParams);

    if (nextField) {
      session.pendingNode = {
        ...pending,
        params: mergedParams,
        nextFieldToAsk: nextField.key,
      };
      session.lastActiveAt = Date.now();

      emit(res, {
        type: 'confirm',
        confirm: {
          confirmType: 'params',
          nodeType: pending.nodeType,
          nodeName: pending.nodeName,
          params: mergedParams,
          askingField: nextField.key,
          options: nextField.type === 'select' ? nextField.options : undefined,
          text: `请问「${nextField.label}」是？（${nextField.type === 'select' && nextField.options ? nextField.options.join('、') : '请描述'}）`,
        },
      });
    } else {
      session.pendingNode = { ...pending, params: mergedParams, confirmStep: 'final' };
      session.lastActiveAt = Date.now();

      const confirmText = node.confirmTemplate(mergedParams);
      emit(res, {
        type: 'confirm',
        confirm: {
          confirmType: 'final',
          nodeType: pending.nodeType,
          nodeName: pending.nodeName,
          params: mergedParams,
          text: confirmText,
        },
      });
    }

    res.end();
    return;
  }

  emit(res, { type: 'done' });
  res.end();
}

/**
 * 将用户回复解析为参数字典
 * 简单实现：检测用户是否提供了特定参数值
 */
function parseUserReplyAsParams(
  message: string,
  currentParams: Record<string, string | number | boolean>,
  node: ReturnType<typeof getBusinessNode>
): Record<string, string | number | boolean> {
  if (!node) return currentParams;

  const params = { ...currentParams };
  const lowerMsg = message.toLowerCase();

  for (const field of node.fields) {
    if (params[field.key] !== undefined) continue; // 已填写则跳过

    if (field.type === 'boolean') {
      // 检测是否表示"是"或"否"
      if (['是', '有', '要', 'yes', 'true', '对', '好', '没错'].some(w => lowerMsg.includes(w))) {
        params[field.key] = true;
      } else if (['没有', '无', '否', '不', 'no', 'false', '不用'].some(w => lowerMsg.includes(w))) {
        params[field.key] = false;
      }
    } else if (field.type === 'select' && field.options) {
      // 匹配选项
      for (const opt of field.options) {
        if (lowerMsg.includes(opt.toLowerCase())) {
          params[field.key] = opt;
          break;
        }
      }
      // 如果没匹配到但用户只说了一个词，当作直接输入值
      if (params[field.key] === undefined && message.trim() && !['是', '有', '要', '对', '好', '没有', '无', '不', '不用', '确认', '开始', '取消'].includes(message.trim())) {
        // 检查是否是对话式回复（比如"韩系清冷风"）
        const matchedOpt = field.options.find(opt =>
          lowerMsg.includes(opt.toLowerCase()) ||
          opt.toLowerCase().includes(lowerMsg.trim())
        );
        if (matchedOpt) {
          params[field.key] = matchedOpt;
        }
      }
    } else if (field.type === 'string' || field.type === 'number') {
      // 尝试从消息中提取
      for (const extractor of node.extractors || []) {
        if (extractor.field !== field.key) continue;
        for (const pattern of extractor.patterns) {
          const match = message.match(pattern);
          if (match && match[1]) {
            params[field.key] = field.type === 'number' ? Number(match[1]) : match[1].trim();
            break;
          }
        }
      }
    }
  }

  return params;
}
