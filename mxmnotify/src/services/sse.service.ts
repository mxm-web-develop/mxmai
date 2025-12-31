/**
 * Server-Sent Events (SSE) 服务
 * 用于主动推送通知给用户
 */

import { Response } from 'express';
import { logger } from '../utils/logger';

interface SSEClient {
  userId: string;
  response: Response;
  lastEventId: number;
}

class SSEService {
  private clients: Map<string, SSEClient[]> = new Map();
  private eventIdCounter = 0;

  /**
   * 添加 SSE 客户端连接
   */
  addClient(userId: string, res: Response): void {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

    // 发送初始连接消息
    res.write(`: connected\n\n`);
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connection established' })}\n\n`);

    // 保存客户端连接
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }
    this.clients.get(userId)!.push({
      userId,
      response: res,
      lastEventId: this.eventIdCounter,
    });

    logger.info(`SSE client connected: user ${userId}, total clients: ${this.clients.get(userId)!.length}`);

    // 处理客户端断开连接
    res.on('close', () => {
      this.removeClient(userId, res);
      logger.info(`SSE client disconnected: user ${userId}`);
    });

    // 保持连接活跃（发送心跳）
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat\n\n`);
      } else {
        clearInterval(heartbeat);
        this.removeClient(userId, res);
      }
    }, 30000); // 每 30 秒发送一次心跳
  }

  /**
   * 移除客户端连接
   */
  removeClient(userId: string, res: Response): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const index = userClients.findIndex(client => client.response === res);
      if (index !== -1) {
        userClients.splice(index, 1);
        if (userClients.length === 0) {
          this.clients.delete(userId);
        }
      }
    }
  }

  /**
   * 发送通知给用户的所有连接
   */
  sendNotification(userId: string, event: string, data: any): void {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.length === 0) {
      logger.debug(`No SSE clients for user ${userId}`);
      return;
    }

    this.eventIdCounter++;
    const eventId = this.eventIdCounter;
    const message = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // 发送给所有该用户的连接
    userClients.forEach((client, index) => {
      try {
        if (!client.response.writableEnded) {
          client.response.write(message);
          client.lastEventId = eventId;
        } else {
          // 连接已关闭，移除
          userClients.splice(index, 1);
        }
      } catch (error) {
        logger.error(`Failed to send SSE message to client:`, error);
        userClients.splice(index, 1);
      }
    });

    // 清理空数组
    if (userClients.length === 0) {
      this.clients.delete(userId);
    }

    logger.info(`Sent SSE notification to user ${userId}: ${event}`);
  }

  /**
   * 发送任务完成通知
   */
  sendTaskCompleted(userId: string, taskData: any): void {
    this.sendNotification(userId, 'task_completed', {
      type: 'task_completed',
      task: taskData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送任务失败通知
   */
  sendTaskFailed(userId: string, taskData: any): void {
    this.sendNotification(userId, 'task_failed', {
      type: 'task_failed',
      task: taskData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送通用通知
   */
  sendNotificationEvent(userId: string, notification: any): void {
    this.sendNotification(userId, 'notification', {
      type: 'notification',
      notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 获取在线用户数
   */
  getOnlineUserCount(): number {
    return this.clients.size;
  }

  /**
   * 获取用户连接数
   */
  getUserConnectionCount(userId: string): number {
    return this.clients.get(userId)?.length || 0;
  }
}

// 单例模式
export const sseService = new SSEService();
