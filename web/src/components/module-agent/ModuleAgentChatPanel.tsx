/**
 * 模块级 Agent Chat — 嵌入生成页新建 Drawer
 * 一次性生成引导：每次进入对话模式新建会话，不恢复历史（与主路由 Agent 不同）
 * 硬绑定 conversation.scope；业务 mention 仅当前 scope
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, message as antdMessage } from 'antd';
import { useTranslation } from 'react-i18next';
import { toAppLang } from '../../i18n/appLocale';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowUp, Loader2, StopCircle } from 'lucide-react';
import {
  createAgentConversation,
  deleteAgentConversation,
  postAgentMessage,
  cancelAgentRun,
  type AgentReference,
  type AgentStreamEvent,
} from '../../api/client';
import { AgentMessageBody } from '../../pages/agent-chat/AgentMessageBody';
import { AgentThinkingBlock } from '../../pages/agent-chat/AgentThinkingBlock';
import { AgentMentionPicker } from '../../pages/agent-chat/AgentMentionPicker';
import { AgentRefChip } from '../../pages/agent-chat/AgentRefChip';
import '../../pages/agent-chat.css';
import './module-agent-chat-panel.css';

gsap.registerPlugin(useGSAP);

export type ModuleAgentScope = 'writing' | 'graph' | 'video' | 'audio' | 'music';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  thinkingDone?: boolean;
  references?: AgentReference[];
  status?: 'typing' | 'done' | 'error';
  toolCalls?: Array<{ name: string; args?: unknown; result?: string }>;
  tasks?: Array<{ taskId: string; status: string; progress?: number }>;
  createdAt: Date;
};

type Props = {
  scope: ModuleAgentScope;
  /** Drawer 打开且处于对话模式时为 true */
  active?: boolean;
};

type WelcomeTranslator = (
  key: string,
  options?: Record<string, unknown>
) => string;

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

/** 自然语言能力清单（不罗列 taskKey/subtype；路由由模型内部理解） */
function buildProactiveWelcome(
  scope: ModuleAgentScope,
  scopeLabel: string,
  t: WelcomeTranslator
): string {
  const raw = t(`agent.moduleAgent.caps.${scope}`, {
    returnObjects: true,
    defaultValue: [],
  }) as unknown;
  const caps: string[] = Array.isArray(raw)
    ? raw.map((x) => String(x)).filter(Boolean)
    : [];

  const header = t('agent.moduleAgent.welcomeHeader', { scopeLabel });
  const intro = t('agent.moduleAgent.welcomeCapsIntro');
  const list =
    caps.length > 0
      ? caps.map((n) => `- ${n}`).join('\n')
      : `- ${t('agent.moduleAgent.capsFallback', {
          defaultValue: 'Creation and generation in this module',
        })}`;
  const kb = t('agent.moduleAgent.welcomeKb');
  const cta = t('agent.moduleAgent.welcomeCta');
  return `${header}\n\n${intro}\n\n${list}\n\n${kb}\n\n${cta}`;
}

export function ModuleAgentChatPanel({ scope, active = true }: Props) {
  const { t, i18n } = useTranslation();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [references, setReferences] = useState<AgentReference[]>([]);
  const [sending, setSending] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTab, setMentionTab] = useState<'folder' | 'business'>('folder');
  const [bootstrapping, setBootstrapping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const draftAiIdRef = useRef<string | null>(null);
  const cursorRef = useRef(0);
  const replayingRef = useRef(true);
  const activeRunIdRef = useRef<string | null>(null);
  const animatedMsgIdsRef = useRef<Set<string>>(new Set());

  const scopeLabel = t(`generation.scope.${scope}`, { defaultValue: scope });
  const uiLocale = toAppLang(i18n.language);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useGSAP(
    () => {
      if (!messagesRef.current) return;
      const nodes = messagesRef.current.querySelectorAll<HTMLElement>('.module-agent-panel__msg');
      nodes.forEach((node) => {
        const id = node.dataset.msgId;
        if (!id || animatedMsgIdsRef.current.has(id)) return;
        animatedMsgIdsRef.current.add(id);
        const reduce =
          typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
          gsap.set(node, { opacity: 1, y: 0 });
          return;
        }
        gsap.fromTo(
          node,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }
        );
      });
    },
    { scope: panelRef, dependencies: [messages] }
  );

  const ensureDraftAssistant = useCallback(() => {
    if (draftAiIdRef.current) return draftAiIdRef.current;
    const id = `ai-draft-${Date.now()}`;
    draftAiIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: 'assistant',
        content: '',
        status: 'typing',
        createdAt: new Date(),
        toolCalls: [],
        tasks: [],
      },
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

      if (replayingRef.current) {
        const skip = new Set([
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
        if (skip.has(ev.type)) {
          const evRunId = typeof ev.runId === 'string' ? ev.runId : null;
          const activeRun = activeRunIdRef.current;
          const isCurrent = !!(activeRun && evRunId && evRunId === activeRun);
          const hasDraft = !!draftAiIdRef.current;
          if (!isCurrent && !(hasDraft && activeRun && (!evRunId || evRunId === activeRun))) {
            if (!(hasDraft && !activeRun && ev.type !== 'run_cancelled' && ev.type !== 'run_failed')) {
              return;
            }
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
              ? { ...m, thinking: (m.thinking || '') + delta, thinkingDone: false, status: 'typing' }
              : m
          )
        );
        return;
      }
      if (ev.type === 'thinking_done') {
        const id = draftAiIdRef.current || ensureDraftAssistant();
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, thinkingDone: true, status: 'typing' } : m))
        );
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
      if (ev.type === 'task_created' || ev.type === 'task_progress' || ev.type === 'task_done') {
        const id = ensureDraftAssistant();
        const taskId = String(payload.taskId || '');
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const tasks = [...(m.tasks || [])];
            const idx = tasks.findIndex((x) => x.taskId === taskId);
            const next = {
              taskId,
              status: String(payload.status || (ev.type === 'task_done' ? 'completed' : 'processing')),
              progress: typeof payload.progress === 'number' ? payload.progress : undefined,
            };
            if (idx >= 0) tasks[idx] = { ...tasks[idx], ...next };
            else if (taskId) tasks.push(next);
            return { ...m, tasks };
          })
        );
        return;
      }
      if (ev.type === 'run_completed' || ev.type === 'run_failed' || ev.type === 'run_cancelled' || ev.type === 'error') {
        const id = draftAiIdRef.current;
        if (id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    status: ev.type === 'run_failed' || ev.type === 'error' ? 'error' : 'done',
                    thinkingDone: true,
                    content:
                      m.content ||
                      (ev.type === 'error' || ev.type === 'run_failed'
                        ? String(payload.error || payload.message || t('agent.runFailed'))
                        : m.content),
                  }
                : m
            )
          );
        }
        draftAiIdRef.current = null;
        setSending(false);
        setActiveRunId(null);
        activeRunIdRef.current = null;
      }
    },
    [ensureDraftAssistant, t]
  );

  // 每次进入对话模式：新建一次性会话；离开时软删，不保留历史
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let createdId: string | null = null;

    setMessages([]);
    setConversationId(null);
    setInputValue('');
    setReferences([]);
    setSending(false);
    setActiveRunId(null);
      draftAiIdRef.current = null;
      cursorRef.current = 0;
      animatedMsgIdsRef.current.clear();

    const boot = async () => {
      setBootstrapping(true);
      try {
        const title = t('agent.moduleAgent.defaultTitle', {
          scope: scopeLabel,
        });
        const res = await createAgentConversation(title, { scope, locale: uiLocale });
        const conv = res.data?.data;
        if (!conv?.id) throw new Error(res.data?.error || 'create failed');
        createdId = conv.id;
        if (cancelled) {
          void deleteAgentConversation(conv.id).catch(() => undefined);
          return;
        }
        setConversationId(conv.id);
        const welcome = buildProactiveWelcome(scope, scopeLabel, t);
        if (cancelled) return;
        setMessages([
          {
            id: `welcome-${Date.now()}`,
            role: 'assistant',
            content: welcome,
            status: 'done',
            createdAt: new Date(),
          },
        ]);
      } catch (err) {
        if (!cancelled) {
          antdMessage.error(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };
    void boot();

    return () => {
      cancelled = true;
      streamAbortRef.current?.abort();
      setConversationId(null);
      setMessages([]);
      setSending(false);
      setActiveRunId(null);
      draftAiIdRef.current = null;
      if (createdId) {
        void deleteAgentConversation(createdId).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scope, uiLocale]);

  // SSE
  useEffect(() => {
    if (!active || !conversationId) return;
    streamAbortRef.current?.abort();
    const ac = new AbortController();
    streamAbortRef.current = ac;
    const start = async () => {
      replayingRef.current = true;
      const url = `${getApiBase()}/api/v2/agent/conversations/${conversationId}/stream?cursor=${cursorRef.current}`;
      try {
        const res = await fetch(url, { headers: getAuthHeaders(), signal: ac.signal });
        if (!res.ok || !res.body) return;
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
              handleStreamEvent(JSON.parse(line.slice(5).trim()) as AgentStreamEvent);
            } catch {
              /* ignore */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[ModuleAgent] stream error', err);
        }
      }
    };
    void start();
    return () => ac.abort();
  }, [active, conversationId, handleStreamEvent]);

  const handleSend = async () => {
    if (!inputValue.trim() || sending || !conversationId) return;
    const text = inputValue.trim();
    const refs = [...references];
    setInputValue('');
    setReferences([]);
    setSending(true);
    draftAiIdRef.current = null;
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
      if (!res.data?.data?.runId) throw new Error(res.data?.error || t('agent.sendFailed'));
      setActiveRunId(res.data.data.runId);
      activeRunIdRef.current = res.data.data.runId;
      ensureDraftAssistant();
    } catch (err) {
      setSending(false);
      antdMessage.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = async () => {
    if (!activeRunId) return;
    await cancelAgentRun(activeRunId);
    setSending(false);
  };

  const addReference = (ref: AgentReference) => {
    setReferences((prev) => {
      if (prev.some((r) => r.type === ref.type && r.id === ref.id)) return prev;
      return [...prev, ref];
    });
    setMentionOpen(false);
    setInputValue((v) => v.replace(/@\s*$/, '').trimEnd());
  };

  return (
    <div className="module-agent-panel" ref={panelRef}>
      <div className="module-agent-panel__messages" ref={messagesRef}>
        {bootstrapping && messages.length === 0 ? (
          <div className="module-agent-panel__empty">
            <Loader2 className="module-agent-panel__spin" size={18} />
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-msg-id={m.id}
              className={`module-agent-panel__msg module-agent-panel__msg--${m.role}${
                m.status === 'typing' ? ' is-typing' : ''
              }`}
            >
              {m.references?.length ? (
                <div className="agent-chat-ref-chips">
                  {m.references.map((r) => (
                    <AgentRefChip key={`${r.type}:${r.id}`} reference={r} compact />
                  ))}
                </div>
              ) : null}
              {m.thinking ? (
                <AgentThinkingBlock content={m.thinking} done={!!m.thinkingDone} />
              ) : null}
              <AgentMessageBody content={m.content} />
              {m.tasks?.length ? (
                <ul className="module-agent-panel__tasks">
                  {m.tasks.map((task) => (
                    <li key={task.taskId}>
                      {task.taskId.slice(0, 12)}… · {task.status}
                      {typeof task.progress === 'number' ? ` ${Math.round(task.progress)}%` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="module-agent-panel__composer">
        {references.length > 0 ? (
          <div className="agent-chat-ref-chips agent-chat-ref-chips--composer">
            {references.map((r) => (
              <AgentRefChip
                key={`${r.type}:${r.id}`}
                reference={r}
                compact
                onRemove={() =>
                  setReferences((prev) => prev.filter((x) => !(x.type === r.type && x.id === r.id)))
                }
              />
            ))}
          </div>
        ) : null}
        <div className="module-agent-panel__input-row">
          <textarea
            ref={inputRef}
            className="module-agent-panel__textarea"
            rows={2}
            value={inputValue}
            placeholder={t('agent.moduleAgent.placeholder')}
            onChange={(e) => {
              const v = e.target.value;
              setInputValue(v);
              if (v.endsWith('@')) setMentionOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={sending || !conversationId}
          />
          <div className="module-agent-panel__actions">
            <button
              type="button"
              className="agent-chat-icon-btn"
              onClick={() => setMentionOpen(true)}
              title="@"
            >
              @
            </button>
            {sending ? (
              <button type="button" className="agent-chat-icon-btn" onClick={() => void handleCancel()}>
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="agent-chat-icon-btn agent-chat-icon-btn--primary"
                disabled={!inputValue.trim() || !conversationId}
                onClick={() => void handleSend()}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <Modal
        title={t('agent.mentionTitle')}
        open={mentionOpen}
        onCancel={() => setMentionOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
        className="agent-chat-mention-modal"
      >
        <AgentMentionPicker
          activeTab={mentionTab}
          onTabChange={setMentionTab}
          onPick={addReference}
          businessScopes={[scope]}
        />
      </Modal>
    </div>
  );
}
