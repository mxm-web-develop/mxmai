#!/usr/bin/env node

/**
 * WebSocket 通知测试脚本
 * 测试连接到 Gateway 的 WebSocket 通知服务
 * 
 * Token 说明:
 *   使用用户登录后获取的 accessToken（JWT Token）
 *   登录接口返回: { "tokens": { "accessToken": "eyJhbGc...", ... } }
 *   直接使用 accessToken 的值
 * 
 * 使用方法:
 *   node test-websocket.js YOUR_ACCESS_TOKEN
 *   或
 *   TOKEN=your_access_token node test-websocket.js
 * 
 * 示例:
 *   node test-websocket.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const WebSocket = require('ws');

// 从命令行参数或环境变量获取 Token
const token = process.argv[2] || process.env.TOKEN;

if (!token) {
  console.error('❌ 错误: 请提供 JWT Token');
  console.log('');
  console.log('使用方法:');
  console.log('  node test-websocket.js YOUR_JWT_TOKEN');
  console.log('  或');
  console.log('  TOKEN=your_token node test-websocket.js');
  process.exit(1);
}

const WS_URL = `ws://localhost:3000/api/v1/ws/notifications?token=${token}`;

console.log('🔌 正在连接到 WebSocket 服务器...');
console.log(`📍 URL: ${WS_URL.replace(/token=[^&]+/, 'token=***')}`);
console.log('');

const ws = new WebSocket(WS_URL);

// 连接成功
ws.on('open', () => {
  console.log('✅ WebSocket 连接成功！');
  console.log('');
  
  // 发送心跳
  console.log('💓 发送心跳消息...');
  ws.send(JSON.stringify({ type: 'ping' }));
  
  // 订阅事件
  console.log('📝 订阅通知事件...');
  ws.send(JSON.stringify({
    type: 'subscribe',
    payload: {
      events: ['task_completed', 'task_failed', 'task_updated', 'writing_completed', 'writing_updated']
    }
  }));
  
  console.log('');
  console.log('⏳ 等待通知消息...');
  console.log('💡 提示: 在另一个终端发送任务完成事件来触发通知');
  console.log('💡 按 Ctrl+C 退出');
  console.log('');
  
  // 定期发送心跳（每 30 秒）
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
      console.log('💓 [心跳] 发送 ping');
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);
});

// 接收消息
ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    console.log('📨 收到消息:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 解析不同类型的消息
    switch (message.type) {
      case 'connected':
        console.log('✅ 连接确认');
        console.log(`   用户 ID: ${message.data.userId}`);
        console.log(`   消息: ${message.data.message}`);
        break;
        
      case 'pong':
        console.log('💓 心跳响应');
        console.log(`   时间戳: ${message.data.timestamp}`);
        break;
        
      case 'notification':
        console.log('🔔 收到通知！');
        console.log(`   事件类型: ${message.event || '未知'}`);
        console.log(`   时间戳: ${message.timestamp}`);
        console.log('');
        
        if (message.data.notification) {
          const notification = message.data.notification;
          console.log('📋 通知详情:');
          console.log(`   ID: ${notification.id}`);
          console.log(`   标题: ${notification.title}`);
          console.log(`   内容: ${notification.content}`);
          if (notification.action_url) {
            console.log(`   跳转链接: ${notification.action_url}`);
          }
          console.log(`   已读: ${notification.is_read ? '是' : '否'}`);
          console.log(`   创建时间: ${notification.created_at}`);
        }
        
        if (message.data.task) {
          const task = message.data.task;
          console.log('');
          console.log('📦 任务信息:');
          console.log(`   任务 ID: ${task.id}`);
          console.log(`   状态: ${task.status}`);
          console.log(`   模块: ${task.module_type || '未知'}`);
          if (task.task_type) {
            console.log(`   任务类型: ${task.task_type}`);
          }
          if (task.model_name) {
            console.log(`   模型: ${task.model_name}`);
          }
          if (task.error) {
            console.log(`   错误: ${task.error}`);
          }
        }
        break;
        
      case 'error':
        console.log('❌ 错误消息');
        console.log(`   错误信息: ${JSON.stringify(message.data, null, 2)}`);
        break;
        
      default:
        console.log('📦 其他消息');
        console.log(JSON.stringify(message, null, 2));
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
  } catch (error) {
    console.error('❌ 解析消息失败:', error);
    console.log('原始数据:', data.toString());
    console.log('');
  }
});

// 连接错误
ws.on('error', (error) => {
  console.error('❌ WebSocket 连接错误:');
  console.error(`   错误信息: ${error.message}`);
  
  if (error.message.includes('ECONNREFUSED')) {
    console.error('');
    console.error('💡 提示: 请确保 Gateway 服务正在运行 (端口 3000)');
  } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    console.error('');
    console.error('💡 提示: Token 无效或已过期，请使用有效的 JWT Token');
  }
  
  process.exit(1);
});

// 连接关闭
ws.on('close', (code, reason) => {
  console.log('');
  console.log('🔌 WebSocket 连接已关闭');
  console.log(`   关闭代码: ${code}`);
  if (reason) {
    console.log(`   关闭原因: ${reason.toString()}`);
  }
  
  if (code === 1008) {
    console.log('');
    console.error('💡 提示: 认证失败，请检查 Token 是否正确');
  }
  
  process.exit(0);
});

// 处理程序退出
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 正在关闭连接...');
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('👋 正在关闭连接...');
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
  process.exit(0);
});

