/**
 * 话题写作 · 大纲预览编辑器
 * 给人看的表单（标题 + 各节），不暴露 JSON；提交仍为 { title, sections }。
 */
import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Input } from 'antd';
import { prefersReducedMotion } from '../lib/motion/useReducedMotion';
import './TopicOutlineEditor.css';

gsap.registerPlugin(useGSAP);

export type TopicOutlineSection = {
  heading: string;
  intent: string;
  notes?: string;
};

export type TopicOutlineValue = {
  title: string;
  sections: TopicOutlineSection[];
};

type DraftSection = { heading: string; intent: string; notes: string };
type Draft = { title: string; sections: DraftSection[] };

function emptyDraft(): Draft {
  return { title: '', sections: [{ heading: '', intent: '', notes: '' }] };
}

export function normalizeTopicOutline(raw: unknown): Draft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDraft();
  const o = raw as Record<string, unknown>;
  const root =
    o.outline && typeof o.outline === 'object' && !Array.isArray(o.outline)
      ? (o.outline as Record<string, unknown>)
      : o;
  const sections = Array.isArray(root.sections)
    ? (root.sections
        .map((s) => {
          if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
          const sec = s as Record<string, unknown>;
          const heading = String(sec.heading ?? '').trim();
          const intent = String(sec.intent ?? '').trim();
          const notes = String(sec.notes ?? '').trim();
          if (!heading && !intent && !notes) return null;
          return { heading, intent, notes };
        })
        .filter(Boolean) as DraftSection[])
    : [];
  return {
    title: String(root.title ?? '').trim(),
    sections: sections.length ? sections : [{ heading: '', intent: '', notes: '' }],
  };
}

export function finalizeTopicOutline(draft: Draft): TopicOutlineValue | null {
  const sections: TopicOutlineSection[] = [];
  for (const s of draft.sections) {
    const heading = String(s.heading ?? '').trim();
    const intent = String(s.intent ?? '').trim();
    const notes = String(s.notes ?? '').trim();
    if (!heading && !intent) continue;
    sections.push({
      heading: heading || intent.slice(0, 24),
      intent: intent || heading,
      ...(notes ? { notes } : {}),
    });
  }
  if (!sections.length) return null;
  return {
    title: String(draft.title ?? '').trim() || sections[0].heading,
    sections,
  };
}

export type TopicOutlineEditorProps = {
  value?: unknown;
  disabled?: boolean;
  confirmLabel?: string;
  onConfirm: (outline: TopicOutlineValue) => void;
  onError?: (message: string) => void;
};

export function TopicOutlineEditor({
  value,
  disabled,
  confirmLabel = '确认大纲',
  onConfirm,
  onError,
}: TopicOutlineEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Draft>(() => normalizeTopicOutline(value));

  useGSAP(
    () => {
      const el = rootRef.current;
      if (!el || prefersReducedMotion()) return;
      const sections = el.querySelectorAll('.topic-outline-editor__section');
      gsap.fromTo(
        sections,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.28,
          stagger: 0.06,
          ease: 'power2.out',
          clearProps: 'transform',
        }
      );
    },
    { scope: rootRef }
  );

  const updateSection = (index: number, key: keyof DraftSection, next: string) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === index ? { ...s, [key]: next } : s)),
    }));
  };

  const addSection = () => {
    setDraft((prev) => {
      if (prev.sections.length >= 8) {
        onError?.('最多 8 节');
        return prev;
      }
      return {
        ...prev,
        sections: [...prev.sections, { heading: '', intent: '', notes: '' }],
      };
    });
  };

  const removeSection = (index: number) => {
    setDraft((prev) => {
      if (prev.sections.length <= 1) return prev;
      return { ...prev, sections: prev.sections.filter((_, i) => i !== index) };
    });
  };

  const handleConfirm = () => {
    const parsed = finalizeTopicOutline(draft);
    if (!parsed) {
      onError?.('请至少填写一节：小节标题或「这一节写什么」');
      return;
    }
    onConfirm(parsed);
  };

  return (
    <div ref={rootRef} className="topic-outline-editor" role="group" aria-label="大纲编辑">
      <label className="topic-outline-editor__field">
        <span className="topic-outline-editor__label">标题</span>
        <Input
          size="large"
          value={draft.title}
          disabled={disabled}
          placeholder="文章标题"
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
        />
      </label>

      <ol className="topic-outline-editor__sections">
        {draft.sections.map((sec, index) => (
          <li key={`outline-sec-${index}`} className="topic-outline-editor__section">
            <div className="topic-outline-editor__section-head">
              <span className="topic-outline-editor__section-index">第 {index + 1} 节</span>
              {draft.sections.length > 1 ? (
                <button
                  type="button"
                  className="topic-outline-editor__remove"
                  disabled={disabled}
                  onClick={() => removeSection(index)}
                >
                  删除
                </button>
              ) : null}
            </div>
            <label className="topic-outline-editor__field">
              <span className="topic-outline-editor__label">小节标题</span>
              <Input
                value={sec.heading}
                disabled={disabled}
                placeholder="这一节叫什么"
                onChange={(e) => updateSection(index, 'heading', e.target.value)}
              />
            </label>
            <label className="topic-outline-editor__field">
              <span className="topic-outline-editor__label">这一节写什么</span>
              <Input.TextArea
                autoSize={{ minRows: 2, maxRows: 4 }}
                value={sec.intent}
                disabled={disabled}
                placeholder="用一句话说明本节要讲清什么"
                onChange={(e) => updateSection(index, 'intent', e.target.value)}
              />
            </label>
            <label className="topic-outline-editor__field">
              <span className="topic-outline-editor__label">备注（可选）</span>
              <Input.TextArea
                autoSize={{ minRows: 1, maxRows: 3 }}
                value={sec.notes}
                disabled={disabled}
                placeholder="素材提示、边界等，可不填"
                onChange={(e) => updateSection(index, 'notes', e.target.value)}
              />
            </label>
          </li>
        ))}
      </ol>

      <div className="topic-outline-editor__actions">
        <button
          type="button"
          className="topic-outline-editor__add"
          disabled={disabled || draft.sections.length >= 8}
          onClick={() => addSection()}
        >
          加一节
        </button>
        <button
          type="button"
          className="topic-outline-editor__confirm"
          disabled={disabled}
          onClick={() => handleConfirm()}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
