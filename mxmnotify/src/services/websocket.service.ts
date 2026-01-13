/**
 * WebSocket 服务
 * 用于实时推送通知给用户
 */

import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import {
  ServerMessage,
  NotificationEventType,
  WebSocketMessageType,
} from '../types/notification.types';

interface WebSocketClient {
  userId: string;
  socket: WebSocket;
  connectedAt: Date;
  lastPingAt: Date;
  subscribedEvents: Set<string>;
}

class WebSocketService {
  private clients: Map<WebSocket, WebSocketClient> = new Map();
  private userConnections: Map<string, Set<WebSocket>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 启动心跳检测
    this.startHeartbeat();
  }

  /**
   * 添加客户端连接
   */
  addClient(userId: string, socket: WebSocket): void {
    const client: WebSocketClient = {
      userId,
      socket,
      connectedAt: new Date(),
      lastPingAt: new Date(),
      subscribedEvents: new Set(), // 默认订阅所有事件
    };

    this.clients.set(socket, client);

    // 维护用户连接映射
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socket);

    logger.info(
      `[WebSocket] Client connected: user ${userId}, total clients: ${this.clients.size}, user connections: ${this.userConnections.get(userId)!.size}`
    );

    // 发送连接成功消息
    this.sendMessage(socket, {
      type: WebSocketMessageType.CONNECTED,
      data: {
        userId,
        message: 'WebSocket connection established',
      },
      timestamp: new Date().toISOString(),
    });

    // 处理客户端断开
    socket.on('close', () => {
      this.removeClient(socket);
    });

    // 处理客户端消息
    socket.on('message', (data: Buffer) => {
      this.handleClientMessage(socket, data);
    });

    // 处理错误
    socket.on('error', (error) => {
      logger.error(`[WebSocket] Socket error for user ${userId}:`, error);
    });
  }

  /**
   * 移除客户端连接
   */
  removeClient(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) {
      return;
    }

    const { userId } = client;
    this.clients.delete(socket);

    // 从用户连接映射中移除
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    logger.info(
      `[WebSocket] Client disconnected: user ${userId}, remaining clients: ${this.clients.size}`
    );
  }

  /**
   * 发送消息给用户的所有连接
   */
  sendToUser(
    userId: string,
    event: NotificationEventType | string,
    data: any
  ): void {
    const userSockets = this.userConnections.get(userId);
    if (!userSockets || userSockets.size === 0) {
      logger.debug(`[WebSocket] No connections for user ${userId}`);
      return;
    }

    const message: ServerMessage = {
      type: WebSocketMessageType.NOTIFICATION,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    // 发送给该用户的所有连接
    const disconnectedSockets: WebSocket[] = [];
    userSockets.forEach((socket) => {
      const client = this.clients.get(socket);
      if (!client) {
        disconnectedSockets.push(socket);
        return;
      }

      // 检查是否订阅了该事件（如果订阅列表为空，表示订阅所有事件）
      if (
        client.subscribedEvents.size === 0 ||
        client.subscribedEvents.has(event)
      ) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
          } else {
            disconnectedSockets.push(socket);
          }
        } catch (error) {
          logger.error(
            `[WebSocket] Failed to send message to user ${userId}:`,
            error
          );
          disconnectedSockets.push(socket);
        }
      }
    });

    // 清理断开的连接
    disconnectedSockets.forEach((socket) => {
      this.removeClient(socket);
    });

    logger.info(
      `[WebSocket] Sent notification to user ${userId}: ${event} (${userSockets.size} connections)`
    );
  }

  /**
   * 发送任务完成通知
   */
  sendTaskCompleted(userId: string, taskData: any): void {
    this.sendToUser(userId, NotificationEventType.TASK_COMPLETED, {
      type: NotificationEventType.TASK_COMPLETED,
      task: taskData,
    });
  }

  /**
   * 发送任务失败通知
   */
  sendTaskFailed(userId: string, taskData: any): void {
    this.sendToUser(userId, NotificationEventType.TASK_FAILED, {
      type: NotificationEventType.TASK_FAILED,
      task: taskData,
    });
  }

  /**
   * 发送任务更新通知
   */
  sendTaskUpdated(userId: string, taskData: any): void {
    this.sendToUser(userId, NotificationEventType.TASK_UPDATED, {
      type: NotificationEventType.TASK_UPDATED,
      task: taskData,
    });
  }

  /**
   * 发送通用通知
   */
  sendNotificationEvent(userId: string, event: string, notification: any): void {
    this.sendToUser(userId, event, {
      type: event,
      notification,
    });
  }

  /**
   * 处理客户端消息
   */
  private handleClientMessage(socket: WebSocket, data: Buffer): void {
    const client = this.clients.get(socket);
    if (!client) {
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case WebSocketMessageType.PING:
          // 响应心跳
          this.sendMessage(socket, {
            type: WebSocketMessageType.PONG,
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date().toISOString(),
          });
          client.lastPingAt = new Date();
          break;

        case WebSocketMessageType.SUBSCRIBE:
          // 订阅事件
          if (message.payload?.events && Array.isArray(message.payload.events)) {
            message.payload.events.forEach((event: string) => {
              client.subscribedEvents.add(event);
            });
            logger.debug(
              `[WebSocket] User ${client.userId} subscribed to events:`,
              Array.from(client.subscribedEvents)
            );
          }
          break;

        case WebSocketMessageType.UNSUBSCRIBE:
          // 取消订阅事件
          if (message.payload?.events && Array.isArray(message.payload.events)) {
            message.payload.events.forEach((event: string) => {
              client.subscribedEvents.delete(event);
            });
            logger.debug(
              `[WebSocket] User ${client.userId} unsubscribed from events:`,
              message.payload.events
            );
          }
          break;

        default:
          logger.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`[WebSocket] Failed to parse client message:`, error);
    }
  }

  /**
   * 发送消息给单个连接
   */
  private sendMessage(socket: WebSocket, message: ServerMessage): void {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    } catch (error) {
      logger.error(`[WebSocket] Failed to send message:`, error);
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      const timeout = 60000; // 60 秒超时

      this.clients.forEach((client, socket) => {
        const timeSinceLastPing = now.getTime() - client.lastPingAt.getTime();

        if (timeSinceLastPing > timeout) {
          logger.warn(
            `[WebSocket] Client timeout: user ${client.userId}, closing connection`
          );
          socket.close();
          this.removeClient(socket);
        } else if (socket.readyState === WebSocket.OPEN) {
          // 发送心跳
          this.sendMessage(socket, {
            type: WebSocketMessageType.PONG,
            data: { timestamp: now.toISOString() },
            timestamp: now.toISOString(),
          });
        }
      });
    }, 30000); // 每 30 秒检查一次
  }

  /**
   * 获取在线用户数
   */
  getOnlineUserCount(): number {
    return this.userConnections.size;
  }

  /**
   * 获取用户连接数
   */
  getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }

  /**
   * 获取总连接数
   */
  getTotalConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * 广播消息给所有连接的客户端（全局通知）
   * @param event 事件类型
   * @param data 消息数据
   * @param excludeUserIds 排除的用户ID列表（可选）
   */
  broadcast(
    event: NotificationEventType | string,
    data: any,
    excludeUserIds?: string[]
  ): void {
    const excludeSet = excludeUserIds ? new Set(excludeUserIds) : new Set();
    const message: ServerMessage = {
      type: WebSocketMessageType.NOTIFICATION,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    let sentCount = 0;
    const disconnectedSockets: WebSocket[] = [];

    // 遍历所有客户端连接
    this.clients.forEach((client, socket) => {
      // 如果用户在被排除列表中，跳过
      if (excludeSet.has(client.userId)) {
        return;
      }

      // 检查是否订阅了该事件（如果订阅列表为空，表示订阅所有事件）
      if (
        client.subscribedEvents.size === 0 ||
        client.subscribedEvents.has(event)
      ) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
            sentCount++;
          } else {
            disconnectedSockets.push(socket);
          }
        } catch (error) {
          logger.error(
            `[WebSocket] Failed to broadcast message to user ${client.userId}:`,
            error
          );
          disconnectedSockets.push(socket);
        }
      }
    });

    // 清理断开的连接
    disconnectedSockets.forEach((socket) => {
      this.removeClient(socket);
    });

    logger.info(
      `[WebSocket] Broadcast notification: ${event} to ${sentCount} connections (${this.clients.size} total)`
    );
  }

  /**
   * 发送消息给多个指定用户
   * @param userIds 用户ID列表
   * @param event 事件类型
   * @param data 消息数据
   */
  sendToUsers(
    userIds: string[],
    event: NotificationEventType | string,
    data: any
  ): void {
    const userIdSet = new Set(userIds);
    let sentCount = 0;

    userIdSet.forEach((userId) => {
      const userSockets = this.userConnections.get(userId);
      if (!userSockets || userSockets.size === 0) {
        return;
      }

      const message: ServerMessage = {
        type: WebSocketMessageType.NOTIFICATION,
        event,
        data,
        timestamp: new Date().toISOString(),
      };

      const disconnectedSockets: WebSocket[] = [];
      userSockets.forEach((socket) => {
        const client = this.clients.get(socket);
        if (!client) {
          disconnectedSockets.push(socket);
          return;
        }

        // 检查是否订阅了该事件
        if (
          client.subscribedEvents.size === 0 ||
          client.subscribedEvents.has(event)
        ) {
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify(message));
              sentCount++;
            } else {
              disconnectedSockets.push(socket);
            }
          } catch (error) {
            logger.error(
              `[WebSocket] Failed to send message to user ${userId}:`,
              error
            );
            disconnectedSockets.push(socket);
          }
        }
      });

      // 清理断开的连接
      disconnectedSockets.forEach((socket) => {
        this.removeClient(socket);
      });
    });

    logger.info(
      `[WebSocket] Sent notification to ${userIds.length} users: ${event} (${sentCount} connections)`
    );
  }

  /**
   * 获取所有在线用户ID列表
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.userConnections.keys());
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // 关闭所有连接
    this.clients.forEach((client, socket) => {
      socket.close();
    });

    this.clients.clear();
    this.userConnections.clear();
  }
}

// 单例模式
export const websocketService = new WebSocketService();

