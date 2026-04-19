/**
 * AgentChat — Web 端对话创作助手页面
 * 支持 SSE type 事件协议：text | confirm | task_created | task_progress | task_done | error | done
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Spin, notification, Button, Space, Modal, InputNumber, message, Select } from 'antd';
import { SendOutlined, ClearOutlined, RobotOutlined, CheckOutlined, CloseOutlined, SettingOutlined } from '@ant-design/icons';
import { getAdminModelConfig, putAdminModelConfig, getAdminModelOptions, type AdminModelConfigData, type ModelOption } from '../api/client';
import { useAuth } from '../context/AuthContext';

// ==================== Types ====================

type MessageRole = 'user' | 'assistant' | 'system';

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  status?: 'typing' | 'done' | 'error';
  createdAt: Date;
  /** 确认类消息 */
  confirmInfo?: ConfirmInfo;
  /** 任务卡片 */
  taskInfo?: TaskInfo;
  /** 图片结果 */
  imageUrls?: string[];
}

interface ConfirmInfo {
  confirmType: 'node' | 'params' | 'final';
  nodeType?: string;
  nodeName?: string;
  params: Record<string, string | number | boolean>;
  text: string;
  askingField?: string;
  options?: string[];
}

interface TaskInfo {
  taskId: string;
  nodeType: string;
  nodeName: string;
  status: 'created' | 'progress' | 'done' | 'error' | 'cancelled';
  progress?: number;
  resultUrls?: string[];
  error?: string;
  text?: string;
}

type ChatPhase = 'idle' | 'sending' | 'ai_thinking';

// ==================== Theme Tokens ====================

const TOKENS = {
  bg: 'hsl(var(--agent-chat-bg))',
  surface: 'hsl(var(--agent-chat-surface))',
  surfaceElevated: 'hsl(var(--agent-chat-surface-elevated))',
  border: 'hsl(var(--agent-chat-border))',
  borderSubtle: 'hsl(var(--agent-chat-border-subtle))',
  text: 'hsl(var(--agent-chat-text))',
  textSecondary: 'hsl(var(--agent-chat-text-secondary))',
  muted: 'hsl(var(--agent-chat-muted))',
  accent: 'hsl(var(--agent-chat-accent))',
  accentHover: 'hsl(var(--agent-chat-accent-hover))',
  accentSubtle: 'hsl(var(--agent-chat-accent-subtle))',
  accentText: 'hsl(var(--agent-chat-accent-text))',
  success: '#34C759',
  warning: '#FF9F0A',
  error: '#FF453A',
  userBubble: 'hsl(var(--agent-chat-user-bubble))',
  aiBubble: 'hsl(var(--agent-chat-ai-bubble))',
};

// ==================== Constants ====================

const WELCOME_MESSAGES = [
  { icon: '🖼', label: '图像生成', desc: '帮我做淘宝女装棚拍图' },
  { icon: '🎬', label: '视频生成', desc: '做一个30秒短视频' },
  { icon: '✏️', label: '文案创作', desc: '写一段口播稿' },
  { icon: '🎵', label: '音乐生成', desc: '做一首原创歌曲' },
];

// ==================== Styles ====================

const s = {
  root: { display: 'flex', flexDirection: 'column' as const, height: '100%', background: TOKENS.bg, color: TOKENS.text, fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif" },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${TOKENS.border}`, background: TOKENS.surface, flexShrink: 0 },
  headerTitle: { fontSize: 16, fontWeight: 600, color: TOKENS.text, display: 'flex', alignItems: 'center', gap: 8 },
  messagesWrap: { flex: 1, overflowY: 'auto' as const, padding: '20px', display: 'flex', flexDirection: 'column' as const, gap: 16, scrollBehavior: 'smooth' as const },
  emptyState: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', flex: 1, gap: 24, color: TOKENS.textSecondary },
  emptyTitle: { fontSize: 20, fontWeight: 600, color: TOKENS.text },
  welcomeGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 480, width: '100%' },
  welcomeCard: { background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s', textAlign: 'left' as const, color: TOKENS.text },
  welcomeCardIcon: { fontSize: 20, marginBottom: 6 },
  welcomeCardLabel: { fontSize: 14, fontWeight: 600, marginBottom: 2 },
  welcomeCardDesc: { fontSize: 12, color: TOKENS.textSecondary },
  msgRow: (role: MessageRole) => ({ display: 'flex', flexDirection: 'column' as const, alignItems: role === 'user' ? 'flex-end' : 'flex-start' }),
  msgBubble: (role: MessageRole) => ({
    maxWidth: '72%', padding: '10px 14px',
    borderRadius: role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
    background: role === 'user' ? TOKENS.userBubble : TOKENS.aiBubble,
    color: role === 'user' ? '#fff' : TOKENS.text,
    fontSize: 15, lineHeight: 1.55,
    boxShadow: 'var(--agent-chat-shadow, 0 2px 12px rgba(0,0,0,0.4))',
    border: role === 'user' ? 'none' : `1px solid ${TOKENS.border}`,
    position: 'relative' as const, wordBreak: 'break-word' as const,
  }),
  typingIndicator: { display: 'inline-flex', gap: 4, padding: '10px 14px', background: TOKENS.aiBubble, borderRadius: 18, border: `1px solid ${TOKENS.border})`, boxShadow: 'var(--agent-chat-shadow, 0 2px 12px rgba(0,0,0,0.4))' },
  dot: (delay: number) => ({ width: 7, height: 7, borderRadius: '50%', background: TOKENS.accent, animation: `pulse 1.2s ease-in-out ${delay}ms infinite` }),
  inputArea: { display: 'flex', alignItems: 'flex-end', gap: 10, padding: '12px 20px', borderTop: `1px solid ${TOKENS.border}`, background: TOKENS.surface, flexShrink: 0 },
  input: { flex: 1, background: TOKENS.surfaceElevated, border: `1px solid ${TOKENS.border}`, borderRadius: 12, color: TOKENS.text, fontSize: 15, padding: '10px 14px', resize: 'none' as const, outline: 'none', lineHeight: 1.5, minHeight: 44, maxHeight: 120, fontFamily: 'inherit' },
  sendBtn: { background: TOKENS.accent, border: 'none', borderRadius: 12, color: '#fff', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 18, transition: 'background 0.2s' },
  clearBtn: { background: 'transparent', border: `1px solid ${TOKENS.border}`, borderRadius: 12, color: TOKENS.textSecondary, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 16, transition: 'color 0.2s, border-color 0.2s' },
  nodeTag: { display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: TOKENS.accentSubtle, color: TOKENS.accentText, fontSize: 12, fontWeight: 500, marginBottom: 4 },
  confirmCard: { background: TOKENS.surface, border: `1px solid ${TOKENS.accent}`, borderRadius: 12, padding: '14px 16px', maxWidth: '72%', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' },
  confirmTitle: { fontSize: 13, fontWeight: 600, color: TOKENS.accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' },
  confirmText: { fontSize: 15, color: TOKENS.text, lineHeight: 1.55, marginBottom: 12 },
  confirmParams: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 12 },
  confirmParam: { padding: '3px 10px', borderRadius: 6, background: TOKENS.surfaceElevated, border: `1px solid ${TOKENS.border}`, fontSize: 12, color: TOKENS.textSecondary },
  taskCard: { background: TOKENS.surface, border: `1px solid ${TOKENS.border}`, borderRadius: 12, padding: '14px 16px', maxWidth: '72%', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' },
  taskHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  taskTitle: { fontSize: 14, fontWeight: 600, color: TOKENS.text },
  taskProgress: { flex: 1, height: 4, borderRadius: 2, background: TOKENS.surfaceElevated, overflow: 'hidden' },
  taskProgressFill: (progress: number) => ({ height: '100%', width: `${progress}%`, background: TOKENS.accent, transition: 'width 0.4s ease' }),
  taskStatus: (status: string) => ({ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: status === 'done' ? 'rgba(52,199,89,0.15)' : status === 'error' ? 'rgba(255,69,58,0.15)' : 'rgba(255,107,44,0.15)', color: status === 'done' ? TOKENS.success : status === 'error' ? TOKENS.error : TOKENS.accent }),
  taskImages: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' as const },
  taskImage: { width: 80, height: 80, borderRadius: 8, objectFit: 'cover' as const, cursor: 'pointer', border: `1px solid ${TOKENS.border}` },
  errorMsg: { color: TOKENS.error, fontSize: 13, padding: '8px 12px', background: 'rgba(255,69,58,0.1)', borderRadius: 8, border: `1px solid rgba(255,69,58,0.3)` },
};

// ==================== Component ====================

export default function AgentChat() {
  const { isLoggedIn, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentConfirm, setCurrentConfirm] = useState<ConfirmInfo | null>(null);
  const [confirmParams, setConfirmParams] = useState<Record<string, string>>({});
  // Admin 模型配置
  const [adminConfig, setAdminConfig] = useState<AdminModelConfigData | null>(null);
  const [adminConfigModalVisible, setAdminConfigModalVisible] = useState(false);
  const [adminConfigSaving, setAdminConfigSaving] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ==================== Load Admin Model Config ====================

  const loadAdminConfig = useCallback(async () => {
    if (!isLoggedIn || user?.role !== 'admin') return;
    try {
      const res = await getAdminModelConfig();
      if (res.data?.data) setAdminConfig(res.data.data);
    } catch (e) { console.warn('[AgentChat] Failed to load admin config:', e); }
  }, [isLoggedIn, user?.role]);

  useEffect(() => { if (isLoggedIn && user?.role === 'admin') void loadAdminConfig(); }, [isLoggedIn, user?.role]);

  // ==================== Auto-scroll ====================

  const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ==================== SSE Handler ====================

  const sendMessage = useCallback(
    async (text: string, extraParams?: Record<string, string | number | boolean>) => {
      if (!text.trim() || !isLoggedIn) return;

      const userId = user?.id || 'anonymous';
      const userMsgId = `user-${Date.now()}`;
      const aiMsgId = `ai-${Date.now()}`;

      setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text, status: 'done', createdAt: new Date() }]);
      setInputValue('');
      setPhase('sending');
      setCurrentConfirm(null);

      setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', status: 'typing', createdAt: new Date() }]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const token = localStorage.getItem('api_token') || '';
        const base = (localStorage.getItem('api_base_url') || '').replace(/\/$/, '');
        const url = `${base}/api/v1/agents/message`;

        const reqBody: Record<string, unknown> = {
          sessionId: sessionId || undefined,
          userId,
          message: text,
        };
        if (extraParams) Object.assign(reqBody, extraParams);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '', 'x-user-id': userId },
          body: JSON.stringify(reqBody),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let latestAiMsgId = aiMsgId;

        const updateAIContent = (chunk: string) => {
          setMessages(prev => prev.map(m => m.id === latestAiMsgId ? { ...m, content: m.content + chunk, status: 'typing' as const } : m));
        };

        const flushTaskCard = (taskInfo: TaskInfo) => {
          setMessages(prev => {
            const existingIdx = prev.findIndex(m => m.taskInfo?.taskId === taskInfo.taskId);
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = { ...updated[existingIdx], taskInfo };
              return updated;
            }
            return [...prev, { id: `task-${taskInfo.taskId}`, role: 'assistant', content: taskInfo.text || '', status: 'typing', createdAt: new Date(), taskInfo }];
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr) as {
                type?: string;
                content?: string;
                sessionId?: string;
                error?: string;
                confirm?: ConfirmInfo;
                task?: TaskInfo;
              };

              // === 收到 sessionId ===
              if (parsed.sessionId && !sessionId) setSessionId(parsed.sessionId);

              // === 事件类型路由（按 type 字段）===
              switch (parsed.type) {
                case 'text':
                  if (parsed.content) updateAIContent(parsed.content);
                  break;

                case 'confirm': {
                  // 收到确认请求，追加确认卡片
                  if (parsed.confirm) {
                    setCurrentConfirm(parsed.confirm);
                    setConfirmParams({});
                    setMessages(prev => prev.map(m => m.id === latestAiMsgId ? { ...m, status: 'done' as const } : m));
                    // 在消息流中插入一个带确认卡片的空消息
                    const confirmMsgId = `confirm-${Date.now()}`;
                    setMessages(prev => [...prev, {
                      id: confirmMsgId, role: 'assistant', content: parsed.confirm!.text,
                      status: 'done', createdAt: new Date(), confirmInfo: parsed.confirm!,
                    }]);
                    latestAiMsgId = confirmMsgId;
                  }
                  break;
                }

                case 'task_created':
                case 'task_progress':
                case 'task_done': {
                  if (parsed.task) {
                    flushTaskCard(parsed.task);
                    if (parsed.type === 'task_done') {
                      setMessages(prev => prev.map(m =>
                        m.taskInfo?.taskId === parsed.task?.taskId
                          ? { ...m, status: 'done' as const, imageUrls: parsed.task?.resultUrls }
                          : m
                      ));
                    }
                  }
                  break;
                }

                case 'error':
                  if (parsed.error) {
                    setMessages(prev => prev.map(m => m.id === latestAiMsgId ? { ...m, content: `错误: ${parsed.error}`, status: 'error' as const } : m));
                    notification.error({ message: 'Agent 错误', description: parsed.error });
                  }
                  break;

                case 'done':
                  setMessages(prev => prev.map(m => m.id === latestAiMsgId && m.status === 'typing' ? { ...m, status: 'done' as const } : m));
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        setMessages(prev => prev.map(m => m.id === latestAiMsgId && m.status === 'typing' ? { ...m, status: 'done' as const } : m));

      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: (m.content || '(已取消)') + ' [对话已取消]', status: 'error' as const } : m));
        } else {
          const errMsg = e instanceof Error ? e.message : 'Unknown error';
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `请求失败: ${errMsg}`, status: 'error' as const } : m));
          notification.error({ message: '发送失败', description: errMsg });
        }
      } finally {
        abortControllerRef.current = null;
        setPhase('idle');
      }
    },
    [isLoggedIn, user, sessionId]
  );

  // ==================== Confirm Actions ====================

  /** P0-B1/B2: 直接调用 /confirm 端点，而非走 /message */
  const confirmAction = useCallback(
    async (confirmed: boolean, extraParams?: Record<string, string | number | boolean>) => {
      if (!sessionId || !isLoggedIn) return;
      const userId = user?.id || 'anonymous';
      const token = localStorage.getItem('api_token') || '';
      const base = (localStorage.getItem('api_base_url') || '').replace(/\/$/, '');

      const userMsgId = `user-${Date.now()}`;
      setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: confirmed ? '确认执行' : '取消', status: 'done', createdAt: new Date() }]);

      const aiMsgId = `ai-confirm-${Date.now()}`;
      setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', status: 'typing', createdAt: new Date() }]);
      setPhase('sending');
      setCurrentConfirm(null);

      try {
        const res = await fetch(`${base}/api/v1/agents/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '', 'x-user-id': userId },
          body: JSON.stringify({ sessionId, confirmed, params: extraParams }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        let latestAiMsgId = aiMsgId;

        const updateAIContent = (chunk: string) => {
          setMessages(prev => prev.map(m => m.id === latestAiMsgId ? { ...m, content: m.content + chunk, status: 'typing' as const } : m));
        };

        const flushTaskCard = (taskInfo: TaskInfo) => {
          setMessages(prev => {
            const existingIdx = prev.findIndex(m => m.taskInfo?.taskId === taskInfo.taskId);
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = { ...updated[existingIdx], taskInfo };
              return updated;
            }
            return [...prev, { id: `task-${taskInfo.taskId}`, role: 'assistant', content: taskInfo.text || '', status: 'typing', createdAt: new Date(), taskInfo }];
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr) as { type?: string; content?: string; error?: string; task?: TaskInfo };
              switch (parsed.type) {
                case 'text': if (parsed.content) updateAIContent(parsed.content); break;
                case 'task_created':
                case 'task_progress':
                case 'task_done':
                  if (parsed.task) {
                    flushTaskCard(parsed.task);
                    if (parsed.type === 'task_done') {
                      setMessages(prev => prev.map(m =>
                        m.taskInfo?.taskId === parsed.task?.taskId
                          ? { ...m, status: 'done' as const, imageUrls: parsed.task?.resultUrls }
                          : m
                      ));
                    }
                  }
                  break;
                case 'error':
                  if (parsed.error) {
                    setMessages(prev => prev.map(m => m.id === latestAiMsgId ? { ...m, content: `错误: ${parsed.error}`, status: 'error' as const } : m));
                    notification.error({ message: '确认失败', description: parsed.error });
                  }
                  break;
                case 'done':
                  setMessages(prev => prev.map(m => m.id === latestAiMsgId && m.status === 'typing' ? { ...m, status: 'done' as const } : m));
                  break;
              }
            } catch { /* ignore */ }
          }
        }
        setMessages(prev => prev.map(m => m.id === latestAiMsgId && m.status === 'typing' ? { ...m, status: 'done' as const } : m));
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `请求失败: ${errMsg}`, status: 'error' as const } : m));
        notification.error({ message: '确认失败', description: errMsg });
      } finally {
        setPhase('idle');
      }
    },
    [sessionId, isLoggedIn, user]
  );

  const handleConfirm = useCallback(
    (confirmed: boolean) => {
      if (!currentConfirm) return;
      const { confirmType, nodeName, params } = currentConfirm;

      if (confirmType === 'node' && confirmed) {
        // 确认节点后，补问参数
        void sendMessage(`确认做${nodeName}，请告诉我具体参数`);
      } else if (confirmType === 'node' && !confirmed) {
        void sendMessage('取消');
        setCurrentConfirm(null);
      } else if (confirmType === 'final') {
        // P0-B1: 调用 /confirm 端点，而非 sendMessage
        void confirmAction(confirmed);
      } else if (confirmType === 'params') {
        // P0-B2: 发送结构化 params，不走文本解析
        if (confirmed) {
          void confirmAction(true, { ...params, ...confirmParams });
        } else {
          void confirmAction(false);
        }
      }
    },
    [currentConfirm, confirmParams, sendMessage, confirmAction]
  );

  const handleParamChange = useCallback((key: string, value: string) => {
    setConfirmParams(prev => ({ ...prev, [key]: value }));
  }, []);

  // ==================== Actions ====================

  const handleSend = useCallback(() => {
    if (inputValue.trim() && phase === 'idle') {
      void sendMessage(inputValue.trim());
    }
  }, [inputValue, phase, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleClear = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setMessages([]);
    setSessionId(null);
    setCurrentConfirm(null);
    setConfirmParams({});
    setPhase('idle');
  }, []);

  const handleWelcomeClick = useCallback((desc: string) => {
    setInputValue(desc);
    textareaRef.current?.focus();
  }, []);

  // ==================== Render Helpers ====================

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user';
    return (
      <div key={msg.id} style={s.msgRow(msg.role)}>
        {isUser && <span style={{ fontSize: 11, color: TOKENS.textSecondary, marginBottom: 4 }}>你</span>}
        <div style={s.msgBubble(msg.role)}>
          {msg.status === 'typing' && !msg.content ? (
            <span style={s.typingIndicator}><span style={s.dot(0)} /><span style={s.dot(200)} /><span style={s.dot(400)} /></span>
          ) : (
            <span>{msg.content}</span>
          )}
        </div>
      </div>
    );
  };

  const renderConfirmCard = (msg: Message) => {
    const info = msg.confirmInfo;
    if (!info) return renderMessage(msg);

    return (
      <div key={msg.id} style={s.msgRow('assistant')}>
        <div style={s.confirmCard}>
          {info.nodeType && <div style={s.nodeTag}>{info.nodeName}</div>}
          <div style={s.confirmTitle}>
            {info.confirmType === 'node' ? '📋 节点确认' : info.confirmType === 'final' ? '✅ 最终确认' : '🔧 参数确认'}
          </div>
          <div style={s.confirmText}>{info.text}</div>

          {Object.keys(info.params).length > 0 && (
            <div style={s.confirmParams}>
              {Object.entries(info.params).map(([k, v]) => (
                <span key={k} style={s.confirmParam}>{k}: {String(v)}</span>
              ))}
            </div>
          )}

          {info.askingField && info.options && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: TOKENS.textSecondary, marginBottom: 6 }}>请选择「{info.askingField}」：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {info.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => handleParamChange(info.askingField!, opt)}
                    style={{
                      padding: '4px 12px', borderRadius: 8, border: `1px solid ${confirmParams[info.askingField!] === opt ? TOKENS.accent : TOKENS.border}`,
                      background: confirmParams[info.askingField!] === opt ? TOKENS.accentSubtle : 'transparent',
                      color: confirmParams[info.askingField!] === opt ? TOKENS.accentText : TOKENS.text,
                      fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Space>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              size="small"
              onClick={() => handleConfirm(true)}
              style={{ background: TOKENS.accent, borderColor: TOKENS.accent }}
            >
              确认
            </Button>
            <Button
              danger
              icon={<CloseOutlined />}
              size="small"
              onClick={() => handleConfirm(false)}
            >
              取消
            </Button>
          </Space>
        </div>
      </div>
    );
  };

  const renderTaskCard = (msg: Message) => {
    const t = msg.taskInfo;
    if (!t) return renderMessage(msg);

    return (
      <div key={msg.id} style={s.msgRow('assistant')}>
        <div style={s.taskCard}>
          <div style={s.taskHeader}>
            <span style={s.nodeTag}>{t.nodeName}</span>
            <span style={s.taskTitle}>任务 {t.taskId.slice(0, 12)}…</span>
            <span style={{ marginLeft: 'auto', ...s.taskStatus(t.status) }}>
              {t.status === 'created' ? '已提交' : t.status === 'progress' ? '生成中' : t.status === 'done' ? '已完成' : t.status === 'error' ? '失败' : '已取消'}
            </span>
          </div>

          {t.status === 'progress' && (
            <div style={s.taskProgress}>
              <div style={s.taskProgressFill(t.progress || 0)} />
            </div>
          )}

          {t.text && <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginTop: 6 }}>{t.text}</div>}

          {t.resultUrls && t.resultUrls.length > 0 && (
            <div style={s.taskImages}>
              {t.resultUrls.map((url, i) => (
                <img key={i} src={url} alt={`结果${i + 1}`} style={s.taskImage} onClick={() => window.open(url, '_blank')} />
              ))}
            </div>
          )}

          {t.error && <div style={s.errorMsg}>{t.error}</div>}
        </div>
      </div>
    );
  };

  // ==================== Render ====================

  const isAdmin = user?.role === 'admin';

  const handleOpenAdminConfig = () => {
    void loadAdminConfig();
    void (async () => {
      try {
        const res = await getAdminModelOptions();
        if (res.data?.data) setModelOptions(res.data.data);
      } catch (e) { console.warn('[AgentChat] Failed to load model options', e); }
    })();
    setAdminConfigModalVisible(true);
  };

  const handleSaveAdminConfig = async () => {
    if (!adminConfig) return;
    setAdminConfigSaving(true);
    try {
      const res = await putAdminModelConfig({
        model_key: adminConfig.model_key,
        temperature: adminConfig.temperature,
        max_tokens: adminConfig.max_tokens,
        top_p: adminConfig.top_p,
        frequency_penalty: adminConfig.frequency_penalty,
        presence_penalty: adminConfig.presence_penalty,
      });
      if (res.data?.success) {
        message.success('模型配置已更新');
        setAdminConfigModalVisible(false);
      } else {
        message.error(res.data?.error || '保存失败');
      }
    } catch (e) {
      message.error('保存失败');
    } finally {
      setAdminConfigSaving(false);
    }
  };

  return (
    <div style={s.root}>
      <style>{`
        @keyframes pulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        .agent-chat-textarea:focus { border-color: ${TOKENS.accent} !important; }
        .agent-chat-send:hover { background: ${TOKENS.accentHover} !important; }
        .agent-chat-clear:hover { color: ${TOKENS.text} !important; border-color: ${TOKENS.accent} !important; }
        .agent-chat-welcome-card:hover { border-color: ${TOKENS.accent} !important; background: ${TOKENS.surfaceElevated} !important; }

      `}</style>

      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>
          <RobotOutlined style={{ color: TOKENS.accent, fontSize: 20 }} />
          AI 助手
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAdmin && (
            <Button
              type="text"
              icon={<SettingOutlined />}
              size="small"
              onClick={handleOpenAdminConfig}
              style={{ color: TOKENS.textSecondary }}
            >
              模型配置
            </Button>
          )}
        </div>
        {sessionId && <span style={{ fontSize: 11, color: TOKENS.muted }}>会话: {sessionId.slice(0, 8)}…</span>}
      </div>

      {/* Messages area */}
      <div style={s.messagesWrap}>
        {messages.length === 0 ? (
          <div style={s.emptyState}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👋</div>
              <div style={s.emptyTitle}>你好，我是 AI 创作助手</div>
              <div style={{ color: TOKENS.textSecondary, fontSize: 14, marginTop: 4 }}>直接说你想做什么，我会帮你完成</div>
            </div>
            <div style={s.welcomeGrid}>
              {WELCOME_MESSAGES.map(w => (
                <button key={w.label} className="agent-chat-welcome-card" style={s.welcomeCard} onClick={() => void handleWelcomeClick(w.desc)} type="button">
                  <div style={s.welcomeCardIcon}>{w.icon}</div>
                  <div style={s.welcomeCardLabel}>{w.label}</div>
                  <div style={s.welcomeCardDesc}>{w.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => {
              if (msg.taskInfo) return renderTaskCard(msg);
              if (msg.confirmInfo) return renderConfirmCard(msg);
              return renderMessage(msg);
            })}
            {phase === 'sending' && messages[messages.length - 1]?.status !== 'typing' && (
              <div style={s.msgRow('assistant')}>
                <div style={s.msgBubble('assistant')}>
                  <span style={s.typingIndicator}><span style={s.dot(0)} /><span style={s.dot(200)} /><span style={s.dot(400)} /></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div style={s.inputArea}>
        <button className="agent-chat-clear" style={s.clearBtn} onClick={handleClear} title="清空对话" type="button" disabled={phase !== 'idle'}>
          <ClearOutlined />
        </button>
        <textarea ref={textareaRef} className="agent-chat-textarea" style={s.input} value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="说说你想做什么…（Enter 发送，Shift+Enter 换行）" rows={1} disabled={!isLoggedIn} />
        <button className="agent-chat-send" style={{ ...s.sendBtn, opacity: !inputValue.trim() || phase !== 'idle' || !isLoggedIn ? 0.5 : 1, cursor: !inputValue.trim() || phase !== 'idle' || !isLoggedIn ? 'not-allowed' : 'pointer' }} onClick={handleSend} disabled={!inputValue.trim() || phase !== 'idle' || !isLoggedIn} title="发送" type="button">
          {phase !== 'idle' ? <Spin size="small" /> : <SendOutlined />}
        </button>
      </div>

      {/* Admin 模型配置弹窗 */}
      <Modal
        title="模型配置"
        open={adminConfigModalVisible}
        onOk={handleSaveAdminConfig}
        onCancel={() => setAdminConfigModalVisible(false)}
        confirmLoading={adminConfigSaving}
        okText="保存"
        cancelText="取消"
      >
        {adminConfig && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginBottom: 6 }}>模型名称</div>
              <Select
                style={{ width: '100%' }}
                value={adminConfig.model_key}
                onChange={v => setAdminConfig(prev => prev ? { ...prev, model_key: String(v || '') } : prev)}
                placeholder="选择模型"
                options={modelOptions.map(m => ({
                  value: m.model_key,
                  label: `${m.display_name || m.model_key} (${m.provider}/${m.scope})`,
                }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginBottom: 6 }}>Temperature</div>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={2}
                step={0.1}
                value={adminConfig.temperature}
                onChange={v => setAdminConfig(prev => prev ? { ...prev, temperature: v ?? 0.7 } : prev)}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginBottom: 6 }}>Max Tokens</div>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                max={100000}
                value={adminConfig.max_tokens ?? undefined}
                onChange={v => setAdminConfig(prev => prev ? { ...prev, max_tokens: v ?? null } : prev)}
                placeholder="留空表示不限制"
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginBottom: 6 }}>Top P</div>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.05}
                value={adminConfig.top_p ?? undefined}
                onChange={v => setAdminConfig(prev => prev ? { ...prev, top_p: v ?? null } : prev)}
                placeholder="留空表示使用默认值"
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginBottom: 6 }}>Frequency Penalty</div>
              <InputNumber
                style={{ width: '100%' }}
                min={-2}
                max={2}
                step={0.1}
                value={adminConfig.frequency_penalty ?? undefined}
                onChange={v => setAdminConfig(prev => prev ? { ...prev, frequency_penalty: v ?? null } : prev)}
                placeholder="留空表示使用默认值"
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: TOKENS.textSecondary, marginBottom: 6 }}>Presence Penalty</div>
              <InputNumber
                style={{ width: '100%' }}
                min={-2}
                max={2}
                step={0.1}
                value={adminConfig.presence_penalty ?? undefined}
                onChange={v => setAdminConfig(prev => prev ? { ...prev, presence_penalty: v ?? null } : prev)}
                placeholder="留空表示使用默认值"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
