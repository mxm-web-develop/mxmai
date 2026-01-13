/**
 * 通知系统类型定义
 * 支持按模块管理的通知
 */

/**
 * 模块类型
 */
export enum ModuleType {
  MXMCGI = 'mxmcgi',      // 内容生成模块
  MXMPAY = 'mxmpay',      // 支付模块
  MXMAUTH = 'mxmauth',    // 认证模块
  MXMAGENT = 'mxmagent',  // 智能体模块
}

/**
 * 任务状态
 */
export enum TaskStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 通知类型
 */
export enum NotificationType {
  SYSTEM = 'system',
  REMINDER = 'reminder',
  ACTIVITY = 'activity',
  PROMOTION = 'promotion',
}

/**
 * 异步任务状态变更事件
 */
export interface AsyncTaskStatusChangedEvent {
  event_type: 'async_task.status_changed';
  module_type: ModuleType;
  task_id: string;
  user_id: string;
  task_status: TaskStatus | string;
  task_status_message?: string;
  metadata?: Record<string, any>;
  notification_config?: {
    notification_type?: NotificationType;
    title?: string;
    content?: string;
    action_url?: string;
    avatar_url?: string;
    send_push?: boolean;
    send_email?: boolean;
  };
}

/**
 * 通知处理器接口
 */
export interface NotificationHandler {
  /**
   * 判断是否支持该模块
   */
  supports(module_type: ModuleType | string): boolean;

  /**
   * 处理事件
   */
  handle(event: AsyncTaskStatusChangedEvent): Promise<void>;

  /**
   * 生成通知内容
   */
  generateNotification(event: AsyncTaskStatusChangedEvent): {
    notification_type: NotificationType;
    title: string;
    content: string;
    action_url?: string;
    avatar_url?: string;
  };
}

/**
 * WebSocket 消息类型
 */
export enum WebSocketMessageType {
  // 客户端消息
  AUTH = 'auth',
  PING = 'ping',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  
  // 服务端消息
  CONNECTED = 'connected',
  ERROR = 'error',
  NOTIFICATION = 'notification',
  TASK_UPDATE = 'task_update',
  PONG = 'pong',
}

/**
 * WebSocket 客户端消息
 */
export interface ClientMessage {
  type: WebSocketMessageType;
  payload?: any;
}

/**
 * WebSocket 服务端消息
 */
export interface ServerMessage {
  type: WebSocketMessageType;
  event?: string;  // 事件类型：task_completed, task_failed, writing_updated, etc.
  data: any;
  timestamp: string;
}

/**
 * 通知事件类型
 */
export enum NotificationEventType {
  // 任务相关
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_UPDATED = 'task_updated',
  
  // 写作相关
  WRITING_COMPLETED = 'writing_completed',
  WRITING_UPDATED = 'writing_updated',
  
  // 支付相关
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  
  // 系统通知
  SYSTEM_NOTIFICATION = 'system_notification',
  
  // 未读数量更新
  UNREAD_COUNT_UPDATED = 'unread_count_updated',
}

