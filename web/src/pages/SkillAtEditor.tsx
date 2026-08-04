/**
 * Core Skill 编辑器：@ 包内文件联想 + 选中高亮
 * （不用 antd Mentions：父级 overflow 会裁掉弹层）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCode2, FileText, Lock } from 'lucide-react';
import { isLockedSkillPath } from './admin-core-skill';
import './SkillAtEditor.css';

export type SkillFileMentionOption = {
  path: string;
  title: string;
  locked?: boolean;
};

type MentionsState = {
  open: boolean;
  query: string;
  /** @ 在全文中的起始下标 */
  atIndex: number;
};

type TextSeg = { type: 'text' | 'mention'; value: string };

/**
 * 高亮包内文件引用：
 * - `@references/rules.md`
 * - `` `references/rules.md` ``
 * - 裸路径 `references/rules.md`（YAML loadReferences / 正文）
 */
export function splitSkillMentions(text: string, paths: string[]): TextSeg[] {
  if (!text) return [];
  const sorted = [...new Set(paths.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return [{ type: 'text', value: text }];

  const escaped = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const alt = escaped.join('|');
  // 优先 @path / `path`；裸路径允许句号收尾（rules.md.），但不吃进 file.md.bak
  const re = new RegExp(
    `@(?:${alt})|\`(?:${alt})\`|(?<![\\w@./-])(?:${alt})(?![\\w/-]|\\.[\\w-])`,
    'g'
  );

  const segs: TextSeg[] = [];
  let last = 0;
  for (const hit of text.matchAll(re)) {
    const start = hit.index ?? 0;
    if (start > last) segs.push({ type: 'text', value: text.slice(last, start) });
    segs.push({ type: 'mention', value: hit[0]! });
    last = start + hit[0]!.length;
  }
  if (last < text.length) segs.push({ type: 'text', value: text.slice(last) });
  return segs;
}

function findAtToken(value: string, cursor: number): MentionsState | null {
  const before = value.slice(0, cursor);
  // 从光标向前找未闭合的 @token（允许路径字符）
  const m = before.match(/(^|[\s\n`('"])@([\w./-]*)$/);
  if (!m) return null;
  const token = m[2] ?? '';
  const atIndex = before.length - token.length - 1;
  return { open: true, query: token, atIndex };
}

export type SkillAtEditorProps = {
  value: string;
  disabled?: boolean;
  options: SkillFileMentionOption[];
  /** 联想列表中排除当前正在编辑的文件 */
  excludePath?: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onBlurCommit?: () => void;
};

export function SkillAtEditor({
  value,
  disabled,
  options,
  excludePath,
  placeholder,
  onChange,
  onBlurCommit,
}: SkillAtEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [mention, setMention] = useState<MentionsState | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  const pathList = useMemo(() => options.map((o) => o.path), [options]);

  const filtered = useMemo(() => {
    const q = (mention?.query ?? '').trim().toLowerCase();
    const pool = options.filter((o) => o.path !== excludePath);
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((o) => o.path.toLowerCase().includes(q) || o.title.toLowerCase().includes(q))
      .slice(0, 20);
  }, [options, mention?.query, excludePath]);

  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    const mir = mirrorRef.current;
    if (!ta || !mir) return;
    mir.scrollTop = ta.scrollTop;
    mir.scrollLeft = ta.scrollLeft;
  }, []);

  const updatePopupPosition = useCallback(() => {
    const ta = taRef.current;
    if (!ta || !mention?.open) {
      setPopupPos(null);
      return;
    }
    const rect = ta.getBoundingClientRect();
    setPopupPos({
      top: Math.min(rect.top + 48, window.innerHeight - 280),
      left: Math.min(rect.left + 16, window.innerWidth - 320),
    });
  }, [mention?.open]);

  useEffect(() => {
    if (mention?.open) updatePopupPosition();
  }, [mention?.open, mention?.query, updatePopupPosition]);

  useEffect(() => {
    setActiveIdx(0);
  }, [mention?.query, filtered.length]);

  const applyMention = (opt: SkillFileMentionOption) => {
    const ta = taRef.current;
    if (!mention || !ta) return;
    const cursor = ta.selectionStart ?? value.length;
    const before = value.slice(0, mention.atIndex);
    const after = value.slice(cursor);
    const inserted = `@${opt.path}`;
    const next = `${before}${inserted}${after.startsWith(' ') || after.startsWith('\n') ? '' : ' '}${after}`;
    onChange(next);
    setMention(null);
    setPopupPos(null);
    // 选完立刻落盘（父组件在 onChange 里同步写 ref）
    onBlurCommit?.();
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      syncScroll();
    });
  };

  const refreshMentionFromCursor = (raw: string) => {
    const ta = taRef.current;
    const cursor = ta?.selectionStart ?? raw.length;
    const state = findAtToken(raw, cursor);
    if (state) setMention(state);
    else {
      setMention(null);
      setPopupPos(null);
    }
  };

  const onInput = (raw: string) => {
    onChange(raw);
    refreshMentionFromCursor(raw);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention?.open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyMention(filtered[activeIdx]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMention(null);
      setPopupPos(null);
    }
  };

  const segs = useMemo(() => splitSkillMentions(value, pathList), [value, pathList]);

  const popup =
    mention?.open && popupPos && !disabled
      ? createPortal(
          <div
            className="skill-at-editor__popup"
            style={{ top: popupPos.top, left: popupPos.left }}
            role="listbox"
            aria-label="引用包内文件"
          >
            <div className="skill-at-editor__popup-head">引用文件</div>
            {filtered.length === 0 ? (
              <div className="skill-at-editor__popup-empty">无匹配文件</div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={opt.path}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  className={
                    i === activeIdx
                      ? 'skill-at-editor__popup-item is-active'
                      : 'skill-at-editor__popup-item'
                  }
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    applyMention(opt);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="skill-at-editor__popup-icon">
                    {opt.path.endsWith('.mjs') || opt.path.endsWith('.js') ? (
                      <FileCode2 size={15} strokeWidth={1.75} />
                    ) : (
                      <FileText size={15} strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="skill-at-editor__popup-meta">
                    <span className="skill-at-editor__popup-title">{opt.title}</span>
                    <span className="skill-at-editor__popup-path">{opt.path}</span>
                  </span>
                  {opt.locked || isLockedSkillPath(opt.path) ? (
                    <span className="skill-at-editor__popup-lock">
                      <Lock size={10} strokeWidth={2.5} />
                      只读
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`skill-at-editor${disabled ? ' is-disabled' : ''}`}>
      <div className="skill-at-editor__frame">
        <div ref={mirrorRef} className="skill-at-editor__mirror" aria-hidden>
          {segs.map((seg, i) =>
            seg.type === 'mention' ? (
              <mark key={i} className="skill-at-editor__chip">
                {seg.value}
              </mark>
            ) : (
              <span key={i}>{seg.value}</span>
            )
          )}
          {/* 末尾垫一行，滚动高度与 textarea 对齐 */}
          {'\n'}
        </div>
        <textarea
          ref={taRef}
          className="skill-at-editor__textarea"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          onClick={() => refreshMentionFromCursor(value)}
          onKeyUp={() => refreshMentionFromCursor(value)}
          onBlur={() => {
            window.setTimeout(() => {
              setMention(null);
              setPopupPos(null);
              onBlurCommit?.();
            }, 120);
          }}
        />
      </div>
      {popup}
    </div>
  );
}
