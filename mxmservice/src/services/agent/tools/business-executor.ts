/**
 * 业务节点执行 Tool
 * 
 * LangChain Tool，用于根据识别的意图和参数，调用对应的业务 API
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BUSINESS_NODE_TEMPLATES } from '../types';

interface ExecuteTaskParams {
  nodeId: string;
  params: Record<string, unknown>;
  userId: string;
}

interface ExecuteTaskResult {
  success: boolean;
  taskId?: string;
  message?: string;
  error?: string;
}

/**
 * 业务节点执行 Tool
 * 
 * 在用户确认参数后，此 Tool 负责：
 * 1. 调用对应的业务 API（图/视频/音频/写作）
 * 2. 创建异步任务
 * 3. 返回任务 ID
 */
export class BusinessExecutionTool extends Tool {
  name = 'business_execution';
  description = `执行业务任务。根据节点类型调用对应的生成 API。

输入格式（JSON 字符串）：
{
  "nodeId": "业务节点ID，如 graph-photograph-portrait",
  "params": { "count": "4", "ratio": "3:4", "style": "韩系清新" },
  "userId": "用户ID"
}

支持的节点：
- graph-photograph-portrait: 人像摄影
- graph-photograph-ecommerce: 电商摄影
- graph-design-poster: 海报设计
- writing-script: 口播稿/脚本
- writing-lyrics: 歌词创作
- video-generate: 视频生成
- audio-tts: 语音合成

输出：JSON，包含 taskId 和状态信息`;

  // Zod schema for tool input
  private static _inputSchema = z.object({
    nodeId: z.string(),
    params: z.record(z.string(), z.unknown()),
    userId: z.string(),
  });

  protected async _call(rawInput: string): Promise<string> {
    let parsed: z.infer<typeof BusinessExecutionTool._inputSchema>;
    
    try {
      parsed = BusinessExecutionTool._inputSchema.parse(JSON.parse(rawInput));
    } catch {
      return JSON.stringify({
        success: false,
        error: '参数格式错误，请确保输入正确的 JSON 格式',
      });
    }
    
    const { nodeId, params, userId } = parsed;
    
    // 查找对应的业务节点模板
    const template = BUSINESS_NODE_TEMPLATES.find(t => t.id === nodeId);
    if (!template) {
      return JSON.stringify({
        success: false,
        error: `未找到节点：${nodeId}，可用节点：${BUSINESS_NODE_TEMPLATES.map(t => t.id).join(', ')}`,
      });
    }
    
    try {
      const result = await this.executeNode(template, params, userId);
      return JSON.stringify(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({
        success: false,
        error: `执行失败：${errorMsg}`,
      });
    }
  }
  
  /**
   * 执行具体的业务节点
   */
  private async executeNode(
    template: typeof BUSINESS_NODE_TEMPLATES[number],
    params: Record<string, unknown>,
    userId: string
  ): Promise<ExecuteTaskResult> {
    const MXMCGI_URL = process.env.MXMCGI_URL || 'http://localhost:4003';
    
    // 根据节点类型构建 API 请求
    switch (template.nodeType) {
      case 'graph':
        return this.executeGraph(template, params, userId, MXMCGI_URL);
      case 'writing':
        return this.executeWriting(template, params, userId, MXMCGI_URL);
      case 'video':
        return this.executeVideo(template, params, userId, MXMCGI_URL);
      case 'audio':
        return this.executeAudio(template, params, userId, MXMCGI_URL);
      default:
        return { success: false, error: `不支持的节点类型：${template.nodeType}` };
    }
  }
  
  /**
   * 执行图像生成
   */
  private async executeGraph(
    template: typeof BUSINESS_NODE_TEMPLATES[number],
    params: Record<string, unknown>,
    userId: string,
    baseUrl: string
  ): Promise<ExecuteTaskResult> {
    // 构建 graph API 请求体
    const graphParams: Record<string, unknown> = {
      model: `graph-${template.subType}`,
      subtype: template.subType,
      ...params,
    };
    
    // 处理图像参考
    if (params.referenceImage) {
      graphParams.referenceImage = params.referenceImage;
    }
    
    const response = await fetch(`${baseUrl}/api/v1/cgi-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        type: 'image',
        model: `graph-${template.subType}`,
        params: graphParams,
        storeToMinio: true,
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `API 请求失败: ${response.status} ${err}` };
    }
    
    const data = await response.json() as { taskId?: string; id?: string; success: boolean; error?: string };
    return {
      success: data.success !== false,
      taskId: data.taskId || data.id,
      message: `已提交${template.name}任务，任务ID：${data.taskId || data.id}`,
    };
  }
  
  /**
   * 执行写作生成
   */
  private async executeWriting(
    template: typeof BUSINESS_NODE_TEMPLATES[number],
    params: Record<string, unknown>,
    userId: string,
    baseUrl: string
  ): Promise<ExecuteTaskResult> {
    const writingParams: Record<string, unknown> = {
      type: template.subType,
      ...params,
    };
    
    const response = await fetch(`${baseUrl}/api/v1/cgi-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        type: 'text',
        model: `writing-${template.subType}`,
        params: writingParams,
        storeToMinio: false,
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `API 请求失败: ${response.status} ${err}` };
    }
    
    const data = await response.json() as { taskId?: string; id?: string; success: boolean; error?: string };
    return {
      success: data.success !== false,
      taskId: data.taskId || data.id,
      message: `已提交${template.name}任务，任务ID：${data.taskId || data.id}`,
    };
  }
  
  /**
   * 执行视频生成
   */
  private async executeVideo(
    template: typeof BUSINESS_NODE_TEMPLATES[number],
    params: Record<string, unknown>,
    userId: string,
    baseUrl: string
  ): Promise<ExecuteTaskResult> {
    const videoParams: Record<string, unknown> = {
      subtype: 'generate',
      ...params,
    };
    
    const response = await fetch(`${baseUrl}/api/v1/cgi-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        type: 'video',
        model: 'video-generate',
        params: videoParams,
        storeToMinio: true,
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `API 请求失败: ${response.status} ${err}` };
    }
    
    const data = await response.json() as { taskId?: string; id?: string; success: boolean; error?: string };
    return {
      success: data.success !== false,
      taskId: data.taskId || data.id,
      message: `已提交${template.name}任务，任务ID：${data.taskId || data.id}`,
    };
  }
  
  /**
   * 执行音频生成
   */
  private async executeAudio(
    template: typeof BUSINESS_NODE_TEMPLATES[number],
    params: Record<string, unknown>,
    userId: string,
    baseUrl: string
  ): Promise<ExecuteTaskResult> {
    const audioParams: Record<string, unknown> = {
      modelName: `audio-${template.subType}`,
      ...params,
    };
    
    const response = await fetch(`${baseUrl}/api/v1/cgi-tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        type: 'audio',
        model: `audio-${template.subType}`,
        params: audioParams,
        storeToMinio: true,
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `API 请求失败: ${response.status} ${err}` };
    }
    
    const data = await response.json() as { taskId?: string; id?: string; success: boolean; error?: string };
    return {
      success: data.success !== false,
      taskId: data.taskId || data.id,
      message: `已提交${template.name}任务，任务ID：${data.taskId || data.id}`,
    };
  }
}
