/**
 * Agent 聊天富文本渲染
 * - 当前：react-markdown + GFM（只读气泡）
 * - 扩展：registerAgentChatBlock 注册特殊卡片（任务卡 / 预览卡等）
 * - 后续若需可编辑块级文档，可将同一 block registry 迁到 Slate Element
 */

import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

export type AgentChatBlockProps = {
  payload: Record<string, unknown>;
  children?: ReactNode;
};

const blockRegistry = new Map<string, ComponentType<AgentChatBlockProps>>();

/** 注册特殊聊天卡片，type 对应 ```agent-card:<type> JSON 代码块 */
export function registerAgentChatBlock(type: string, Comp: ComponentType<AgentChatBlockProps>) {
  blockRegistry.set(type, Comp);
}

function tryParseAgentCard(raw: string): { type: string; payload: Record<string, unknown> } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const json = JSON.parse(trimmed) as { type?: string; payload?: Record<string, unknown> };
    if (json && typeof json.type === 'string') {
      return {
        type: json.type,
        payload: (json.payload && typeof json.payload === 'object'
          ? json.payload
          : json) as Record<string, unknown>,
      };
    }
  } catch {
    /* not a card */
  }
  return null;
}

function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = String(children ?? '').replace(/\n$/, '');
  const lang = /language-([\w+-]+)/.exec(className || '')?.[1] || '';

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="agent-md-codeblock">
      <div className="agent-md-codeblock__bar">
        <span className="agent-md-codeblock__lang">{lang || 'code'}</span>
        <button type="button" className="agent-md-codeblock__copy" onClick={() => void onCopy()}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t('agent.message.copied') : t('agent.message.copy')}
        </button>
      </div>
      <pre className="agent-md-pre">
        <code className={className}>{text}</code>
      </pre>
    </div>
  );
}

type AgentMessageBodyProps = {
  content: string;
  className?: string;
};

export function AgentMessageBody({ content, className }: AgentMessageBodyProps) {
  const components = useMemo<Components>(
    () => ({
      // 由 code 统一包一层，避免 pre>code 双重边框
      pre({ children }) {
        return <>{children}</>;
      },
      code({ className: codeClass, children, ...props }) {
        const text = String(children ?? '').replace(/\n$/, '');
        const langMatch = /language-agent-card(?::([\w-]+))?/.exec(codeClass || '');
        if (langMatch) {
          const typeFromLang = langMatch[1];
          const parsed = tryParseAgentCard(text);
          const type = typeFromLang || parsed?.type;
          const Comp = type ? blockRegistry.get(type) : undefined;
          if (Comp && parsed) {
            return (
              <div className="agent-chat-custom-card" data-card-type={type}>
                <Comp payload={parsed.payload} />
              </div>
            );
          }
        }

        const isBlock =
          Boolean(codeClass && /language-/.test(codeClass)) || text.includes('\n');
        if (isBlock) {
          return <CodeBlock className={codeClass}>{children}</CodeBlock>;
        }

        return (
          <code className="agent-md-code-inline" {...props}>
            {children}
          </code>
        );
      },
      table({ children }) {
        return (
          <div className="agent-md-table-wrap">
            <table className="agent-md-table">{children}</table>
          </div>
        );
      },
      th({ children }) {
        return <th>{children}</th>;
      },
      td({ children }) {
        return <td>{children}</td>;
      },
      a({ href, children }) {
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
      blockquote({ children }) {
        return <blockquote className="agent-md-quote">{children}</blockquote>;
      },
      img({ src, alt }) {
        if (!src) return null;
        return <img className="agent-md-img" src={src} alt={alt || ''} loading="lazy" />;
      },
    }),
    []
  );

  if (!content.trim()) return null;

  return (
    <div className={`agent-md ${className || ''}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
