/**
 * 思维链（CoT）展示：流式追加时模拟打字机节奏（后端已分片；此处保证可见进度）
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Brain } from 'lucide-react';

type Props = {
  text: string;
  done?: boolean;
  streaming?: boolean;
};

export function AgentThinkingBlock({ text, done, streaming }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState('');
  const targetRef = useRef(text);
  const shownLenRef = useRef(0);

  useEffect(() => {
    targetRef.current = text;
  }, [text]);

  useEffect(() => {
    if (!streaming) {
      setShown(text);
      shownLenRef.current = text.length;
      return;
    }
    let raf = 0;
    const tick = () => {
      const target = targetRef.current;
      if (shownLenRef.current < target.length) {
        // 每次追上更多字符，保持「跟得上」又不整段蹦出
        const step = Math.max(2, Math.ceil((target.length - shownLenRef.current) / 8));
        shownLenRef.current = Math.min(target.length, shownLenRef.current + step);
        setShown(target.slice(0, shownLenRef.current));
      }
      if (shownLenRef.current < targetRef.current.length || streaming) {
        raf = window.setTimeout(tick, 28) as unknown as number;
      }
    };
    raf = window.setTimeout(tick, 28) as unknown as number;
    return () => window.clearTimeout(raf);
  }, [text, streaming]);

  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);

  if (!text && !streaming) return null;

  return (
    <div className={`agent-chat-thinking ${done ? 'is-done' : 'is-live'}`}>
      <button type="button" className="agent-chat-thinking__toggle" onClick={() => setOpen((v) => !v)}>
        <Brain size={14} />
        <span>{done ? t('agent.thinkingBlock.process') : t('agent.thinkingBlock.inProgress')}</span>
        <ChevronDown size={14} className={open ? 'is-open' : ''} />
      </button>
      {open && (
        <div className="agent-chat-thinking__body" aria-live="polite">
          {shown || (streaming ? '…' : '')}
          {streaming && !done ? <span className="agent-chat-thinking__caret" /> : null}
        </div>
      )}
    </div>
  );
}
