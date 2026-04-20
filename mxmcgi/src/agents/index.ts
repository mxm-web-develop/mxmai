/**
 * Agent Chat API - Route Registration
 * API 端点：
 *   POST /api/v1/agents/message   — SSE 流式对话
 *   POST /api/v1/agents/confirm  — 确认（节点/参数/执行）
 *   GET  /api/v1/agents/models    — 可用模型
 *   GET  /api/v1/agents/health    — 健康检查
 */

import { Router, Request, Response } from 'express';
import { handleAgentChat, handleUserConfirmation, getAvailableTextModels } from './chat';

const router = Router();

/**
 * POST /api/v1/agents/message
 * Agent Chat SSE 流式接口
 *
 * SSE 事件类型（按 type 字段区分）：
 * - text:          文本流片段 { type: 'text', content: string, sessionId?: string }
 * - confirm:       AI 请求确认 { type: 'confirm', confirm: ConfirmContent }
 * - task_created:  任务已创建 { type: 'task_created', task: TaskContent }
 * - task_progress: 任务进度 { type: 'task_progress', task: TaskContent }
 * - task_done:     任务完成 { type: 'task_done', task: TaskContent }
 * - error:         错误 { type: 'error', error: string }
 * - done:          会话结束 { type: 'done' }
 */
router.post('/message', async (req: Request, res: Response) => {
  const provider = req.query.provider as string | undefined;
  await handleAgentChat(req, res, provider);
});

/**
 * POST /api/v1/agents/confirm
 * 处理用户确认（节点确认、参数回复、执行确认）
 *
 * 请求体：
 * {
 *   sessionId: string;                      // 会话 ID（必需）
 *   confirmed: boolean;                       // 用户是否确认
 *   params?: Record<string, string|number|boolean>; // 参数（可选）
 * }
 */
router.post('/confirm', async (req: Request, res: Response) => {
  await handleUserConfirmation(req, res);
});

/**
 * GET /api/v1/agents/models
 * 获取可用的 Agent 模型列表
 */
router.get('/models', (_req: Request, res: Response) => {
  const models = getAvailableTextModels();
  res.json({ success: true, models: models.map(name => ({ name })) });
});

/**
 * GET /api/v1/agents/health
 * 健康检查
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
