import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Input, InputNumber, Popover, Tooltip } from 'antd';
import { Code2, Pause, Plus, Trash2, UserRound, Users, X } from 'lucide-react';
import {
  addDialogueTurn,
  insertPauseAfter,
  listSpeakers,
  looksLikeVoiceoverTtsMarkup,
  parseVoiceoverDocument,
  removeDialogueTurn,
  removeSegment,
  renameTurnSpeaker,
  serializeVoiceoverDocument,
  soundLabel,
  speakerColorIndex,
  updatePauseSeconds,
  updateTextSegment,
  updateTurnSegments,
  type VoiceoverDocument,
  type VoiceoverMarkupSegment,
  type VoiceoverTurn,
} from './voiceoverScriptMarkup';
import './voiceover-script-editor.css';

export { looksLikeVoiceoverTtsMarkup };

type VoiceoverScriptEditorProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * 是否开放多角色对白（仅 audio/group、audio/series）。
   * generator 人工审核应关闭：隐藏「多角色」入口与相关提示。
   */
  allowMultiRole?: boolean;
};

const PAUSE_PRESETS = [0.15, 0.25, 0.3, 0.4, 0.5, 0.8, 1];

function PauseChip({
  seconds,
  disabled,
  onChangeSeconds,
  onRemove,
}: {
  seconds: number;
  disabled?: boolean;
  onChangeSeconds: (n: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(seconds);

  useEffect(() => {
    if (open) setDraft(seconds);
  }, [open, seconds]);

  const label = `${Number.isInteger(seconds) ? seconds : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}s`;

  return (
    <Popover
      trigger="click"
      open={disabled ? false : open}
      onOpenChange={(v) => !disabled && setOpen(v)}
      content={
        <div className="vos-chip-pop">
          <div className="vos-chip-pop__label">停顿时长（秒）</div>
          <InputNumber
            min={0.01}
            max={99.99}
            step={0.05}
            value={draft}
            disabled={disabled}
            onChange={(v) => setDraft(typeof v === 'number' ? v : seconds)}
            style={{ width: '100%' }}
          />
          <div className="vos-chip-pop__presets">
            {PAUSE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="vos-chip-pop__preset"
                disabled={disabled}
                onClick={() => setDraft(p)}
              >
                {p}s
              </button>
            ))}
          </div>
          <div className="vos-chip-pop__actions">
            <button
              type="button"
              className="vos-chip-pop__danger"
              disabled={disabled}
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
            >
              <Trash2 size={14} />
              删除停顿
            </button>
            <button
              type="button"
              className="vos-chip-pop__apply"
              disabled={disabled}
              onClick={() => {
                onChangeSeconds(draft);
                setOpen(false);
              }}
            >
              应用
            </button>
          </div>
        </div>
      }
      placement="top"
      destroyOnHidden
    >
      <button
        type="button"
        className="vos-chip vos-chip--pause"
        disabled={disabled}
        aria-label={`停顿 ${label}，点击修改`}
      >
        <Pause size={12} strokeWidth={2.25} />
        <span>{label}</span>
      </button>
    </Popover>
  );
}

function TagChip({
  kind,
  label,
  disabled,
  onRemove,
}: {
  kind: 'sound' | 'particle';
  label: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  return (
    <span className={`vos-chip vos-chip--${kind}`} title={kind === 'sound' ? '非言语标记' : '语气助词'}>
      <span className="vos-chip__text">{label}</span>
      {!disabled ? (
        <button type="button" className="vos-chip__x" aria-label={`删除「${label}」`} onClick={onRemove}>
          <X size={12} strokeWidth={2.5} />
        </button>
      ) : null}
    </span>
  );
}

function TextBlock({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    // 始终同步：contentEditable 在 disabled 切换时可能被浏览器清空
    el.textContent = value ?? '';
  }, [value, disabled]);

  return (
    <span
      ref={ref}
      className="vos-text"
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      spellCheck
      onBlur={() => {
        const next = ref.current?.textContent ?? '';
        if (next !== value) onCommit(next);
      }}
    />
  );
}

function MarkupCanvas({
  segments,
  disabled,
  onChangeSegments,
}: {
  segments: VoiceoverMarkupSegment[];
  disabled?: boolean;
  onChangeSegments: (next: VoiceoverMarkupSegment[]) => void;
}) {
  const empty =
    segments.length === 0 ||
    (segments.length === 1 && segments[0].kind === 'text' && !segments[0].value.trim());

  if (empty) {
    return (
      <TextBlock
        value=""
        disabled={disabled}
        onCommit={(next) =>
          onChangeSegments([{ id: `t-${Date.now()}`, kind: 'text', value: next }])
        }
      />
    );
  }

  return (
    <>
      {segments.map((seg) => {
        if (seg.kind === 'text') {
          return (
            <TextBlock
              key={seg.id}
              value={seg.value}
              disabled={disabled}
              onCommit={(next) => onChangeSegments(updateTextSegment(segments, seg.id, next))}
            />
          );
        }
        if (seg.kind === 'pause') {
          return (
            <PauseChip
              key={seg.id}
              seconds={seg.seconds}
              disabled={disabled}
              onChangeSeconds={(n) => onChangeSegments(updatePauseSeconds(segments, seg.id, n))}
              onRemove={() => onChangeSegments(removeSegment(segments, seg.id))}
            />
          );
        }
        if (seg.kind === 'sound') {
          return (
            <TagChip
              key={seg.id}
              kind="sound"
              label={soundLabel(seg.name)}
              disabled={disabled}
              onRemove={() => onChangeSegments(removeSegment(segments, seg.id))}
            />
          );
        }
        return (
          <TagChip
            key={seg.id}
            kind="particle"
            label={seg.value}
            disabled={disabled}
            onRemove={() => onChangeSegments(removeSegment(segments, seg.id))}
          />
        );
      })}
    </>
  );
}

function SpeakerBadge({
  turn,
  colorIndex,
  disabled,
  roster,
  onRename,
}: {
  turn: VoiceoverTurn;
  colorIndex: number;
  disabled?: boolean;
  roster: string[];
  onRename: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(turn.speaker ?? '旁白');

  useEffect(() => {
    if (open) setDraft(turn.speaker ?? '旁白');
  }, [open, turn.speaker]);

  const name = turn.speaker?.trim() || '旁白';

  return (
    <Popover
      trigger="click"
      open={disabled ? false : open}
      onOpenChange={(v) => !disabled && setOpen(v)}
      content={
        <div className="vos-chip-pop">
          <div className="vos-chip-pop__label">说话人</div>
          <Input
            value={draft}
            maxLength={24}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={() => {
              onRename(draft);
              setOpen(false);
            }}
            placeholder="角色名"
          />
          {roster.length > 0 ? (
            <div className="vos-chip-pop__presets">
              {roster.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="vos-chip-pop__preset"
                  disabled={disabled}
                  onClick={() => setDraft(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : null}
          <div className="vos-chip-pop__actions">
            <span />
            <button
              type="button"
              className="vos-chip-pop__apply"
              disabled={disabled}
              onClick={() => {
                onRename(draft);
                setOpen(false);
              }}
            >
              应用
            </button>
          </div>
        </div>
      }
      placement="bottomLeft"
      destroyOnHidden
    >
      <button
        type="button"
        className={`vos-speaker vos-speaker--c${colorIndex}`}
        disabled={disabled}
        aria-label={`说话人 ${name}，点击改名`}
      >
        <UserRound size={13} strokeWidth={2} />
        {name}
      </button>
    </Popover>
  );
}

export function VoiceoverScriptEditor({
  value,
  onChange,
  disabled,
  placeholder,
  allowMultiRole = true,
}: VoiceoverScriptEditorProps) {
  const [rawMode, setRawMode] = useState(false);
  const [doc, setDoc] = useState<VoiceoverDocument>(() => parseVoiceoverDocument(value));
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setDoc(parseVoiceoverDocument(value));
  }, [value]);

  const emit = (nextDoc: VoiceoverDocument) => {
    setDoc(nextDoc);
    const serialized = serializeVoiceoverDocument(nextDoc);
    lastEmitted.current = serialized;
    onChange(serialized);
  };

  const roster = useMemo(() => listSpeakers(doc), [doc]);
  const isDialogue = doc.mode === 'dialogue';

  const stats = useMemo(() => {
    const all = doc.turns.flatMap((t) => t.segments);
    const pauses = all.filter((s) => s.kind === 'pause').length;
    const particles = all.filter((s) => s.kind === 'particle').length;
    const sounds = all.filter((s) => s.kind === 'sound').length;
    const chars = serializeVoiceoverDocument(doc)
      .replace(/<#.*?#>/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/【[^】]*】/g, '')
      .replace(/^[^：:\n]{1,16}[：:]/gm, '')
      .length;
    return { pauses, particles, sounds, chars, turns: doc.turns.length, speakers: roster.length };
  }, [doc, roster.length]);

  const patchTurnSegments = (turnId: string, segments: VoiceoverMarkupSegment[]) => {
    emit(updateTurnSegments(doc, turnId, segments));
  };

  const insertPauseOnTurn = (turn: VoiceoverTurn) => {
    const lastId = turn.segments[turn.segments.length - 1]?.id ?? null;
    patchTurnSegments(turn.id, insertPauseAfter(turn.segments, lastId, 0.3));
  };

  return (
    <div className={`vos-editor${disabled ? ' is-disabled' : ''}${isDialogue ? ' vos-editor--dialogue' : ''}`}>
      <div className="vos-editor__toolbar">
        <div className="vos-editor__legend" aria-hidden>
          <span className="vos-chip vos-chip--pause vos-chip--legend">
            <Pause size={11} />
            停顿
          </span>
          <span className="vos-chip vos-chip--particle vos-chip--legend">语气</span>
          <span className="vos-chip vos-chip--sound vos-chip--legend">换气</span>
          {allowMultiRole && isDialogue ? (
            <span className="vos-chip vos-chip--legend vos-chip--speaker-legend">
              <Users size={11} />
              多角色
            </span>
          ) : null}
        </div>
        <div className="vos-editor__toolbar-actions">
          {allowMultiRole ? (
            <Tooltip title={isDialogue ? '在末尾新增一条对白' : '拆成多角色对白（【角色名】）'}>
              <button
                type="button"
                className="vos-tool-btn"
                disabled={disabled || rawMode}
                onClick={() => emit(addDialogueTurn(doc))}
              >
                <Users size={14} />
                {isDialogue ? '加对白' : '多角色'}
              </button>
            </Tooltip>
          ) : null}
          <Tooltip title="在当前稿末插入 0.3s 停顿">
            <button
              type="button"
              className="vos-tool-btn"
              disabled={disabled || rawMode || doc.turns.length === 0}
              onClick={() => {
                const last = doc.turns[doc.turns.length - 1];
                if (last) insertPauseOnTurn(last);
              }}
            >
              <Plus size={14} />
              加停顿
            </button>
          </Tooltip>
          <button
            type="button"
            className={`vos-tool-btn${rawMode ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => setRawMode((v) => !v)}
          >
            <Code2 size={14} />
            {rawMode ? '可视化' : '源码'}
          </button>
        </div>
      </div>

      {rawMode ? (
        <textarea
          className="vos-editor__raw"
          value={value}
          disabled={disabled}
          placeholder={
            placeholder ||
            (allowMultiRole
              ? '单口直接写正文；多角色用行首【角色名】或 角色名：\n【主持人】…\n【嘉宾】…'
              : '直接编辑口播正文；可用 <#0.3#> 表示停顿')
          }
          onChange={(e) => {
            lastEmitted.current = e.target.value;
            onChange(e.target.value);
            setDoc(parseVoiceoverDocument(e.target.value));
          }}
        />
      ) : isDialogue ? (
        <div className="vos-editor__dialogue" aria-label="多角色对白编辑">
          {doc.turns.map((turn, idx) => {
            const speakerName = turn.speaker?.trim() || '旁白';
            const colorIdx = speakerColorIndex(speakerName, roster);
            return (
              <div key={turn.id} className={`vos-turn vos-turn--c${colorIdx}`}>
                <div className="vos-turn__head">
                  <SpeakerBadge
                    turn={turn}
                    colorIndex={colorIdx}
                    disabled={disabled}
                    roster={roster}
                    onRename={(name) => emit(renameTurnSpeaker(doc, turn.id, name))}
                  />
                  <span className="vos-turn__idx">#{idx + 1}</span>
                  <div className="vos-turn__head-actions">
                    <Tooltip title="本句末加停顿">
                      <button
                        type="button"
                        className="vos-icon-btn"
                        disabled={disabled}
                        onClick={() => insertPauseOnTurn(turn)}
                      >
                        <Pause size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip title="删除这句对白">
                      <button
                        type="button"
                        className="vos-icon-btn vos-icon-btn--danger"
                        disabled={disabled}
                        onClick={() => emit(removeDialogueTurn(doc, turn.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <div className="vos-turn__body">
                  <MarkupCanvas
                    segments={turn.segments}
                    disabled={disabled}
                    onChangeSegments={(segs) => patchTurnSegments(turn.id, segs)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="vos-editor__canvas" aria-label="口播稿可视化编辑">
          {doc.turns[0] ? (
            <MarkupCanvas
              segments={doc.turns[0].segments}
              disabled={disabled}
              onChangeSegments={(segs) => patchTurnSegments(doc.turns[0].id, segs)}
            />
          ) : (
            <p className="vos-editor__placeholder">{placeholder || '暂无口播稿'}</p>
          )}
        </div>
      )}

      <div className="vos-editor__footer">
        <span>
          {stats.chars.toLocaleString()} 字
          {isDialogue ? ` · ${stats.speakers} 人 · ${stats.turns} 句` : ''}
          {stats.pauses ? ` · ${stats.pauses} 处停顿` : ''}
          {stats.particles ? ` · ${stats.particles} 个语气` : ''}
          {stats.sounds ? ` · ${stats.sounds} 个换气` : ''}
        </span>
        <span className="vos-editor__hint">
          {allowMultiRole && isDialogue
            ? '点击角色名可改名；对白用【角色名】落盘，便于多音色合成'
            : allowMultiRole
              ? '点击标签改停顿/删除；需要对话时点「多角色」'
              : '点击标签修改停顿/删除'}
        </span>
      </div>
    </div>
  );
}
