/**
 * Agent Chat API 路由
 * 
 * 提供 Agent Chat 的 HTTP API 接口，支持流式响应
 */

import { Router, Request, Response } from 'express';
import { AgentChatService } from '../services/agent/agent-service';
import { SendMessageRequest, SendMessageResponse } from '../services/agent/types';

const router = Router();

// 单例 Agent 服务
let agentService: AgentChatService | null = null;

function getAgentService(): AgentChatService {
  if (!agentService) {
    agentService = new AgentChatService();
  }
  return agentService;
}

/**
 * POST /api/v1/agent-chat/message
 * 
 * 发送消息到 Agent Chat
 * 
 * 请求体：
 * {
 *   "sessionId": "可选，指定会话 ID",
 *   "userId": "用户 ID",
 *   "message": "用户消息内容",
 *   "attachedImages": ["可选，附带图片 URL"],
 *   "attachedAudio": "可选，附带音频 URL"
 * }
 * 
 * 响应：SSE 流式响应，每个事件格式：
 * event: <event_type>
 * data: <JSON>
 * 
 * 事件类型：
 * - text: 文本输出
 * - intent_detected: 意图识别完成
 * - confirm_form: 确认表单
 * - task_created: 任务已创建
 * - task_progress: 任务进度更新
 * - task_completed: 任务完成
 * - error: 错误
 */
router.post('/message', async (req: Request, res: Response) => {
  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
  
  const userId = req.headers['x-user-id'] as string || req.body?.userId;
  
  if (!userId) {
    res.write('event: error\ndata: {"content":"Missing userId"}\n\n');
    res.end();
    return;
  }
  
  const request: SendMessageRequest = {
    sessionId: req.body?.sessionId,
    userId,
    message: req.body?.message || '',
    attachedImages: req.body?.attachedImages,
    attachedAudio: req.body?.attachedAudio,
  };
  
  if (!request.message?.trim()) {
    res.write('event: error\ndata: {"content":"Message is required"}\n\n');
    res.end();
    return;
  }
  
  const service = getAgentService();
  
  // 发送消息处理回调
  await service.processMessage(request, (event: SendMessageResponse) => {
    // 使用 req.socket 被关闭检查
    if (res.writableEnded) return;
    
    const eventName = event.event;
    const data = JSON.stringify(event);
    
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${data}\n\n`);
  });
  
  // 发送结束信号
  res.write('event: done\n');
  res.write('data: {}\n\n');
  res.end();
});

/**
 * GET /api/v1/agent-chat/nodes
 * 
 * 获取所有可用的业务节点列表
 */
router.get('/nodes', (_req: Request, res: Response) => {
  const { getAvailableNodes } = require('../services/agent/tools/intent-detector');
  const nodes = getAvailableNodes();
  
  res.json({
    success: true,
    nodes: nodes.map((n: { id: string; name: string; nodeType: string; subType?: string; description: string; keywords: string[] }) => ({
      id: n.id,
      name: n.name,
      nodeType: n.nodeType,
      subType: n.subType,
      description: n.description,
      keywords: n.keywords,
    })),
  });
});

/**
 * GET /api/v1/agent-chat/session/:sessionId
 * 
 * 获取会话状态
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  const service = getAgentService();
  const session = service.getSession(req.params.sessionId);
  
  if (!session) {
    res.status(404).json({
      success: false,
      error: 'Session not found',
    });
    return;
  }
  
  res.json({
    success: true,
    session: {
      sessionId: session.sessionId,
      phase: session.phase,
      matchedNode: session.matchedNode,
      collectedParams: session.collectedParams,
      missingParams: session.missingParams,
      taskId: session.taskId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  });
});

/**
 * DELETE /api/v1/agent-chat/session/:sessionId
 * 
 * 清除会话
 */
router.delete('/session/:sessionId', (req: Request, res: Response) => {
  const service = getAgentService();
  service.clearSession(req.params.sessionId);
  
  res.json({ success: true });
});

export default router;
