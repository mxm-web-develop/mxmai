/**
 * AgentChat v2 — 多会话 harness agent
 * - 会话列表 + 持久化消息
 * - SSE cursor 回放 / 实时事件
 * - @ 引用知识库 / 业务
 * 模型与业务权限由 Admin 在「系统管理 → AI 助手」配置
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../i18n/appLocale';
import { Modal, message as antdMessage, notification } from 'antd';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  ArrowUp,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  StopCircle,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandLoading from '../components/BrandLoading';
import {
  listAgentConversations,
  createAgentConversation,
  deleteAgentConversation,
  listAgentMessages,
  postAgentMessage,
  cancelAgentRun,
  getAgentSettings,
  type AgentConversation,
  type AgentMessage,
  type AgentReference,
  type AgentStreamEvent,
} from '../api/client';
import { AgentMessageBody } from './agent-chat/AgentMessageBody';
import { AgentThinkingBlock } from './agent-chat/AgentThinkingBlock';
import { AgentMentionPicker } from './agent-chat/AgentMentionPicker';
import { AgentRefChip } from './agent-chat/AgentRefChip';
import './agent-chat.css';
import { toUserFacingErrorMessage } from '../lib/platformErrors';

gsap.registerPlugin(useGSAP);

const SIDEBAR_COLLAPSED_KEY = 'agent-chat-sidebar-collapsed';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 思维链 / CoT */
  thinking?: string;
  thinkingDone?: boolean;
  references?: AgentReference[];
  status?: 'typing' | 'done' | 'error';
  toolCalls?: Array<{ name: string; args?: unknown; result?: string }>;
  tasks?: Array<{ taskId: string; status: string; progress?: number; mediaUrls?: string[] }>;
  createdAt: Date;
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('api_token') || '';
  const userId = localStorage.getItem('user_id') || '';
  return {
    Authorization: token ? `Bearer ${token}` : '',
    ...(userId ? { 'x-user-id': userId } : {}),
  };
}

function getApiBase(): string {
  return (localStorage.getItem('api_base_url') || '').replace(/\/$/, '');
}

function partsText(msg: AgentMessage): string {
  return (msg.content || [])
    .map((p) => (p.type === 'text' ? p.text || '' : p.url || p.name || ''))
    .filter(Boolean)
    .join('\n');
}

export default function AgentChat() {
  const { t, i18n } = useTranslation();
  const uiLocale = toAppLang(i18n.language);
  const { isLoggedIn } = useAuth();
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [references, setReferences] = useState<AgentReference[]>([]);
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState(t('agent.welcome'));
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTab, setMentionTab] = useState<'folder' | 'business'>('folder');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [messagesLoading, setMessagesLoading] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const animatedMsgIdsRef = useRef<Set<string>>(new Set());
  const streamAbortRef = useRef<AbortController | null>(null);
  const draftAiIdRef = useRef<string | null>(null);
  const cursorRef = useRef(0);
  /** SSE 历史回放中：忽略终态事件，避免刷出大量「已取消」气泡 */
  const replayingRef = useRef(true);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  const loadConversations = useCallback(async () => {
    if (!isLoggedIn) return;
    const res = await listAgentConversations({ limit: 50 });
    const list = res.data?.data || [];
    setConversations(list);
    if (!activeId && list[0]) setActiveId(list[0].id);
  }, [isLoggedIn, activeId]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) void loadConversations();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    void (async () => {
      try {
        const res = await getAgentSettings();
        const text = res.data?.data?.welcome_message?.trim();
        setWelcomeMessage(text || t('agent.welcome'));
      } catch {
        setWelcomeMessage(t('agent.welcome'));
      }
    })();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setMessagesLoading(false);
      animatedMsgIdsRef.current.clear();
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    cursorRef.current = 0;
    void (async () => {
      try {
        const res = await listAgentMessages(activeId, { limit: 100 });
        if (cancelled) return;
        const list = (res.data?.data || []).map((m) => ({
          id: m.id,
          role: (m.role === 'assistant' || m.role === 'user' ? m.role : 'system') as UiMessage['role'],
          content: partsText(m),
          references: m.references,
          status: 'done' as const,
          createdAt: new Date(m.created_at),
        }));
        const filtered = list.filter((m) => m.role !== 'system');
        animatedMsgIdsRef.current = new Set(filtered.map((m) => m.id));
        setMessages(filtered);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (messagesLoading) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messagesLoading]);

  /* 空态欢迎语入场 */
  useGSAP(
    () => {
      if (messagesLoading || messages.length > 0) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const el = pageRef.current?.querySelector('.agent-chat-welcome');
      if (!el) return;
      if (reduce) {
        gsap.set(el, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        el,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }
      );
    },
    { scope: pageRef, dependencies: [messages.length, welcomeMessage, activeId, messagesLoading] }
  );

  /* 新消息气泡入场（仅未动画过的节点） */
  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const nodes = pageRef.current?.querySelectorAll<HTMLElement>('.agent-chat-bubble[data-msg-id]');
      if (!nodes?.length) return;
      const fresh: HTMLElement[] = [];
      nodes.forEach((node) => {
        const id = node.dataset.msgId;
        if (!id || animatedMsgIdsRef.current.has(id)) return;
        animatedMsgIdsRef.current.add(id);
        fresh.push(node);
      });
      if (!fresh.length) return;
      if (reduce) {
        gsap.set(fresh, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        fresh,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.22, stagger: 0.04, ease: 'power3.out' }
      );
      const tools = fresh
        .flatMap((n) => Array.from(n.querySelectorAll<HTMLElement>('.agent-chat-tool-card, .agent-chat-task-card')))
        .filter(Boolean);
      if (tools.length) {
        gsap.fromTo(
          tools,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.2, stagger: 0.03, ease: 'power2.out', delay: 0.05 }
        );
      }
    },
    { scope: pageRef, dependencies: [messages] }
  );

  // SSE 订阅当前会话
  useEffect(() => {
    if (!activeId || !isLoggedIn) return;

    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;

    const start = async () => {
      replayingRef.current = true;
      const url = `${getApiBase()}/api/v2/agent/conversations/${activeId}/stream?cursor=${cursorRef.current}`;
      try {
        const res = await fetch(url, {
          headers: getAuthHeaders(),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          if (res.status === 401) {
            antdMessage.error(t('agent.sessionExpired'));
          }
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';
          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim()) as AgentStreamEvent;
              handleStreamEvent(ev);
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[AgentChat] stream error', err);
        }
      }
    };

    void start();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, isLoggedIn]);

  const ensureDraftAssistant = useCallback(() => {
    if (draftAiIdRef.current) return draftAiIdRef.current;
    const id = `ai-draft-${Date.now()}`;
    draftAiIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      { id, role: 'assistant', content: '', status: 'typing', createdAt: new Date(), toolCalls: [], tasks: [] },
    ]);
    return id;
  }, []);

  const handleStreamEvent = useCallback(
    (ev: AgentStreamEvent) => {
      if (typeof ev.seq === 'number') {
        cursorRef.current = Math.max(cursorRef.current, ev.seq);
      }

      if (ev.type === 'stream_open') {
        replayingRef.current = true;
        return;
      }
      if (ev.type === 'replay_done') {
        replayingRef.current = false;
        return;
      }

      // 历史回放：跳过旧 run，避免满屏「已取消」；当前 run / 草稿必须放行
      if (replayingRef.current) {
        const skipDuringReplay = new Set([
          'run_cancelled',
          'run_failed',
          'run_completed',
          'text_delta',
          'thinking_delta',
          'thinking_done',
          'tool_call',
          'tool_result',
          'task_created',
          'task_progress',
          'task_done',
          'thinking',
          'error',
        ]);
        if (skipDuringReplay.has(ev.type)) {
          const evRunId = typeof ev.runId === 'string' ? ev.runId : null;
          const active = activeRunIdRef.current;
          const isCurrentRun = !!(active && evRunId && evRunId === active);
          const hasDraft = !!draftAiIdRef.current;
          // 刚发送尚未写入 activeRunId 时：允许草稿吃增量（不含历史取消）
          const draftCatchup =
            hasDraft &&
            !active &&
            ev.type !== 'run_cancelled' &&
            ev.type !== 'run_failed' &&
            ev.type !== 'error';
          const draftSameRun =
            hasDraft && !!active && (!evRunId || evRunId === active);
          if (!isCurrentRun && !draftSameRun && !draftCatchup) {
            return;
          }
        }
      }

      const payload = ev.payload || {};

      if (ev.type === 'thinking_delta') {
        const id = ensureDraftAssistant();
        const delta = String(payload.content || '');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  thinking: (m.thinking || '') + delta,
                  thinkingDone: false,
                  status: 'typing',
                }
              : m
          )
        );
        return;
      }

      if (ev.type === 'thinking_done' || ev.type === 'thinking') {
        const id = draftAiIdRef.current || ensureDraftAssistant();
        if (ev.type === 'thinking_done') {
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, thinkingDone: true, status: 'typing' } : m))
          );
        } else {
          // 仅 phase/round：确保有 typing 气泡
          ensureDraftAssistant();
        }
        return;
      }

      if (ev.type === 'text_delta') {
        const id = ensureDraftAssistant();
        const delta = String(payload.content || '');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content: m.content + delta,
                  thinkingDone: m.thinking ? true : m.thinkingDone,
                  status: 'typing',
                }
              : m
          )
        );
        return;
      }

      if (ev.type === 'tool_call') {
        const id = ensureDraftAssistant();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls || []),
                    { name: String(payload.name || ''), args: payload.arguments || payload },
                  ],
                }
              : m
          )
        );
        return;
      }

      if (ev.type === 'tool_result') {
        const id = ensureDraftAssistant();
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const tools = [...(m.toolCalls || [])];
            const idx = tools.findIndex((t) => t.name === payload.name && !t.result);
            if (idx >= 0) tools[idx] = { ...tools[idx], result: String(payload.content || '').slice(0, 500) };
            return { ...m, toolCalls: tools };
          })
        );
        return;
      }

      if (ev.type === 'task_created' || ev.type === 'task_progress' || ev.type === 'task_done') {
        const id = ensureDraftAssistant();
        const taskId = String(payload.taskId || '');
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const tasks = [...(m.tasks || [])];
            const idx = tasks.findIndex((t) => t.taskId === taskId);
            const next = {
              taskId,
              status: String(payload.status || (ev.type === 'task_done' ? 'completed' : 'processing')),
              progress: typeof payload.progress === 'number' ? payload.progress : undefined,
              mediaUrls: Array.isArray(payload.mediaUrls) ? (payload.mediaUrls as string[]) : undefined,
            };
            if (idx >= 0) tasks[idx] = { ...tasks[idx], ...next };
            else tasks.push(next);
            return { ...m, tasks };
          })
        );
        return;
      }

      if (ev.type === 'run_completed' || ev.type === 'run_failed' || ev.type === 'run_cancelled') {
        const id = draftAiIdRef.current;
        if (id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    status: ev.type === 'run_failed' ? 'error' : 'done',
                    thinkingDone: true,
                    content:
                      m.content ||
                      (ev.type === 'run_failed'
                        ? String(payload.error || t('agent.runFailed'))
                        : ev.type === 'run_cancelled'
                          ? t('agent.cancelled')
                          : m.content || t('agent.noTextReply')),
                  }
                : m
            )
          );
        }
        draftAiIdRef.current = null;
        setSending(false);
        activeRunIdRef.current = null;
        setActiveRunId(null);
        void loadConversations();
        if (ev.type === 'run_failed') {
          antdMessage.error(String(payload.error || t('agent.runFailedMsg')));
        }
        if (ev.type === 'run_completed' && document.visibilityState === 'hidden') {
          notification.success({ message: t('agent.replyDone'), description: t('agent.replyDoneDesc') });
        }
        return;
      }

      if (ev.type === 'error') {
        antdMessage.error(String(payload.error || t('agent.error')));
      }
    },
    [ensureDraftAssistant, loadConversations]
  );

  const handleNewConversation = async () => {
    const res = await createAgentConversation(undefined, { locale: uiLocale });
    const conv = res.data?.data;
    if (!conv) return;
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
  };

  const handleDeleteConversation = (id: string) => {
    const title = conversations.find((c) => c.id === id)?.title || t('agent.newConversation');
    Modal.confirm({
      title: t('agent.deleteConvTitle'),
      content: t('agent.deleteConvContent', { title }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      centered: true,
      onOk: async () => {
        await deleteAgentConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
          setMessages([]);
        }
      },
    });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;
    let conversationId = activeId;
    if (!conversationId) {
      const res = await createAgentConversation(inputValue.trim().slice(0, 40), {
        locale: uiLocale,
      });
      const conv = res.data?.data;
      if (!conv) {
        antdMessage.error(t('agent.createConvFailed'));
        return;
      }
      conversationId = conv.id;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
    }

    const text = inputValue.trim();
    const refs = [...references];
    setInputValue('');
    setReferences([]);
    setSending(true);
    draftAiIdRef.current = null;
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        references: refs,
        status: 'done',
        createdAt: new Date(),
      },
    ]);

    try {
      const res = await postAgentMessage(conversationId, {
        content: text,
        references: refs,
        locale: uiLocale,
      });
      if (!res.data?.data?.runId) {
        throw new Error(res.data?.error || t('agent.sendFailed'));
      }
      setActiveRunId(res.data.data.runId);
      activeRunIdRef.current = res.data.data.runId;
      ensureDraftAssistant();
    } catch (err) {
      setSending(false);
      antdMessage.error(toUserFacingErrorMessage(err instanceof Error ? err.message : err));
    }
  };

  const handleCancelRun = async () => {
    if (!activeRunId) return;
    await cancelAgentRun(activeRunId);
    setSending(false);
  };

  const openMention = () => {
    setMentionOpen(true);
  };

  const addReference = (ref: AgentReference) => {
    setReferences((prev) => {
      if (prev.some((r) => r.type === ref.type && r.id === ref.id)) return prev;
      return [...prev, ref];
    });
    setMentionOpen(false);
    // 去掉末尾触发用的 @，名称由高亮 chip 展示
    setInputValue((v) => v.replace(/@\s*$/, '').trimEnd());
  };

  const onInputChange = (v: string) => {
    setInputValue(v);
    if (v.endsWith('@')) openMention();
  };

  if (!isLoggedIn) {
    return (
      <div className="agent-chat-page agent-chat-page--v2">
        <div className="agent-chat-empty">{t('agent.pleaseLogin')}</div>
      </div>
    );
  }

  return (
    <div
      className={`agent-chat-page agent-chat-page--v2${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
      ref={pageRef}
    >
      <aside
        className="agent-chat-sidebar"
        aria-label={t('agent.conversations')}
        aria-hidden={sidebarCollapsed}
      >
        <div className="agent-chat-sidebar__header">
          <span>{t('agent.conversations')}</span>
          <div className="agent-chat-sidebar__header-actions">
            <button
              type="button"
              className="agent-chat-icon-btn"
              onClick={() => void handleNewConversation()}
              title={t('agent.newConversation')}
              aria-label={t('agent.newConversation')}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="agent-chat-icon-btn"
              onClick={toggleSidebar}
              title={t('agent.collapseSidebar')}
              aria-label={t('agent.collapseSidebar')}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
        <div className="agent-chat-sidebar__list">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`agent-chat-conv ${activeId === c.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(c.id)}
            >
              <MessageSquare size={14} />
              <span className="agent-chat-conv__title">{c.title || t('agent.newConversation')}</span>
              <span
                className="agent-chat-conv__del"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(c.id);
                }}
              >
                <Trash2 size={12} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="agent-chat-main">
        <header className="agent-chat-header">
          <div className="agent-chat-header__start">
            {sidebarCollapsed ? (
              <button
                type="button"
                className="agent-chat-icon-btn"
                onClick={toggleSidebar}
                title={t('agent.expandSidebar')}
                aria-label={t('agent.expandSidebar')}
              >
                <PanelLeft size={16} />
              </button>
            ) : null}
            <span className="agent-chat-header__brand">{t('agent.title')}</span>
            <strong className="agent-chat-header__title">
              {conversations.find((c) => c.id === activeId)?.title || t('agent.newConversation')}
            </strong>
          </div>
          <div className="agent-chat-header__actions">
            {sending && (
              <button type="button" className="agent-chat-icon-btn" onClick={() => void handleCancelRun()} title={t('agent.stop')}>
                <StopCircle size={16} />
              </button>
            )}
          </div>
        </header>

        <div className={`agent-chat-messages${messagesLoading ? ' is-loading' : ''}`} role="log" aria-live="polite">
          {messagesLoading ? (
            <div className="agent-chat-messages__loading" aria-busy="true">
              <BrandLoading tip={t('agent.loadingConv')} />
            </div>
          ) : null}
          <div className={`agent-chat-messages__body${messagesLoading ? ' is-dimmed' : ''}`}>
          {messages.length === 0 && !messagesLoading && (
            <div className="agent-chat-welcome">
              <div className="agent-chat-welcome__mark" aria-hidden>
                <Sparkles size={22} />
              </div>
              <p className="agent-chat-welcome__eyebrow">SuperMXMai</p>
              <h2>{welcomeMessage}</h2>
              <p className="agent-chat-welcome__hint">
                {t('agent.intro')}
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              data-msg-id={m.id}
              className={`agent-chat-bubble agent-chat-bubble--${m.role}`}
            >
              {m.references && m.references.length > 0 && (
                <div className="agent-chat-ref-chips">
                  {m.references.map((r) => (
                    <AgentRefChip key={`${r.type}-${r.id}`} reference={r} compact />
                  ))}
                </div>
              )}
              {m.role === 'assistant' && m.thinking ? (
                <AgentThinkingBlock
                  text={m.thinking}
                  done={!!m.thinkingDone || m.status === 'done'}
                  streaming={m.status === 'typing' && !m.thinkingDone}
                />
              ) : null}
              {m.role === 'assistant' ? (
                m.content ? (
                  <AgentMessageBody content={m.content} className="agent-chat-bubble__content" />
                ) : null
              ) : (
                <div className="agent-chat-bubble__content">{m.content}</div>
              )}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="agent-chat-tools">
                  {m.toolCalls.map((tool, i) => (
                    <details key={`${tool.name}-${i}`} className="agent-chat-tool-card">
                      <summary>{t('agent.toolLabel', { name: tool.name })}</summary>
                      <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                      {tool.result && <pre className="agent-chat-tool-result">{tool.result}</pre>}
                    </details>
                  ))}
                </div>
              )}
              {m.tasks && m.tasks.length > 0 && (
                <div className="agent-chat-tasks">
                  {m.tasks.map((task) => (
                    <div key={task.taskId} className="agent-chat-task-card">
                      <div>
                        {t('agent.taskStatus', { id: task.taskId.slice(0, 8), status: task.status })}
                        {task.progress != null ? ` · ${task.progress}%` : ''}
                      </div>
                      {task.mediaUrls?.map((url) =>
                        /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ? (
                          <img key={url} src={url} alt="" className="agent-chat-task-img" />
                        ) : (
                          <a key={url} href={url} target="_blank" rel="noreferrer">
                            {t('agent.openResult')}
                          </a>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
              {m.status === 'typing' && !m.thinking && !m.content && (
                <div className="agent-chat-typing">
                  <Loader2 size={14} className="spin" /> {t('agent.thinkingLabel')}
                </div>
              )}
              {m.status === 'typing' && !!(m.thinking || m.content) && (
                <div className="agent-chat-typing agent-chat-typing--subtle">
                  <Loader2 size={14} className="spin" /> {t('agent.generatingLabel')}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="agent-chat-composer">
          {references.length > 0 && (
            <div className="agent-chat-ref-chips agent-chat-ref-chips--composer">
              {references.map((r) => (
                <AgentRefChip
                  key={`${r.type}-${r.id}`}
                  reference={r}
                  onRemove={() =>
                    setReferences((prev) => prev.filter((x) => !(x.type === r.type && x.id === r.id)))
                  }
                />
              ))}
            </div>
          )}
          <div className="agent-chat-input-row">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                onInputChange(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t('agent.inputPlaceholder')}
              rows={1}
            />
            <div className="agent-chat-input-row__actions">
              <button type="button" className="agent-chat-icon-btn" onClick={() => openMention()} title={t('agent.mentionTitle')}>
                @
              </button>
              <button
                type="button"
                className={`agent-chat-send${sending ? ' is-busy' : ''}`}
                disabled={sending || !inputValue.trim()}
                onClick={() => void handleSend()}
                aria-label={t('agent.send')}
              >
                {sending ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} />}
              </button>
            </div>
          </div>
        </div>
      </section>

      <Modal
        title={t('agent.mentionTitle')}
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        footer={null}
        width={Math.min(780, typeof window !== 'undefined' ? window.innerWidth - 32 : 780)}
        destroyOnClose
        className="agent-chat-mention-modal"
      >
        <AgentMentionPicker
          activeTab={mentionTab}
          onTabChange={setMentionTab}
          onPick={addReference}
        />
      </Modal>
    </div>
  );
}
