/**
 * 多人语音人审：单轴台词时间线（按绝对时间落位；重叠句并排显示）
 * 文案卡片按内容高度，时长用色条表示，避免长句把气泡拉成空白柱。
 */
import { useMemo, useState } from 'react';
import { Input, Tag, Typography } from 'antd';
import {
  formatDialogueScriptFromGuidanceLines,
  formatMsClock,
  KIND_LABELS,
  resolveGuidanceTimeline,
  type DialogueGuidanceCast,
  type DialogueGuidanceLine,
  type ResolvedGuidanceLine,
} from '../lib/dialogueGuidanceTimeline';
import './dialogue-guidance-timeline-review.css';

export type DialogueGuidanceTimelineReviewProps = {
  lines: DialogueGuidanceLine[];
  cast: DialogueGuidanceCast[];
  broadcastStyle?: string;
  disabled?: boolean;
  onChangeScript: (script: string) => void;
};

const SPEAKER_COLORS = [
  { bg: 'rgba(14, 165, 233, 0.2)', border: '#0284c7', text: '#0c4a6e', span: 'rgba(2, 132, 199, 0.45)' },
  { bg: 'rgba(250, 204, 21, 0.28)', border: '#ca8a04', text: '#713f12', span: 'rgba(202, 138, 4, 0.5)' },
  { bg: 'rgba(45, 212, 191, 0.2)', border: '#0d9488', text: '#134e4a', span: 'rgba(13, 148, 136, 0.45)' },
  { bg: 'rgba(244, 114, 182, 0.2)', border: '#db2777', text: '#831843', span: 'rgba(219, 39, 119, 0.45)' },
  { bg: 'rgba(167, 139, 250, 0.22)', border: '#7c3aed', text: '#4c1d95', span: 'rgba(124, 58, 237, 0.45)' },
  { bg: 'rgba(251, 146, 60, 0.22)', border: '#ea580c', text: '#7c2d12', span: 'rgba(234, 88, 12, 0.45)' },
];

function speakerColor(index: number) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length]!;
}

type PlacedLine = ResolvedGuidanceLine & {
  column: number;
  columnsInGroup: number;
};

/**
 * 按角色固定分列（cast 顺序：主持左、嘉宾右…），全程一致。
 * 不同角色的接话/抢词自然左右并排，避免「刚好错开几十毫秒」时又叠回同一列。
 */
function assignSpeakerColumns(
  sorted: ResolvedGuidanceLine[],
  cast: DialogueGuidanceCast[]
): { placed: PlacedLine[]; speakerIndex: Map<string, number> } {
  const speakerIndex = new Map<string, number>();
  let n = 0;
  for (const c of cast) {
    const id = String(c.id ?? '').trim();
    if (id && !speakerIndex.has(id)) speakerIndex.set(id, n++);
  }
  for (const line of sorted) {
    const id = String(line.speakerId ?? '').trim() || line.displayName;
    if (id && !speakerIndex.has(id)) speakerIndex.set(id, n++);
  }
  const totalCols = Math.max(1, speakerIndex.size);
  const placed = sorted.map((line) => {
    const id = String(line.speakerId ?? '').trim() || line.displayName;
    return {
      ...line,
      column: speakerIndex.get(id) ?? 0,
      columnsInGroup: totalCols,
    };
  });
  return { placed, speakerIndex };
}

/** 按总时长与句数压紧刻度，避免长句撑出大片空白 */
function computePxPerMs(totalMs: number, durations: number[]): number {
  const n = Math.max(1, durations.length);
  const targetCanvas = Math.min(380, Math.max(200, 40 + n * 52));
  const fitScale = targetCanvas / Math.max(1000, totalMs);

  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 3000;
  // 中位句长对应约 44px 时长条，再与「整轴装下」取更紧的
  const medianScale = 44 / Math.max(800, median);

  return Math.min(0.022, Math.max(0.0038, Math.min(fitScale, medianScale)));
}

export function DialogueGuidanceTimelineReview({
  lines: initialLines,
  cast,
  broadcastStyle,
  disabled,
  onChangeScript,
}: DialogueGuidanceTimelineReviewProps) {
  const [lines, setLines] = useState<DialogueGuidanceLine[]>(() =>
    initialLines.map((l) => ({ ...l }))
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialLines[0]?.id ?? null
  );

  const { placed, totalDurationMs, speakerIndex, maxColumns, ticks, pxPerMs } = useMemo(() => {
    const { lines: resolvedLines, totalDurationMs: total } = resolveGuidanceTimeline(lines, {
      cast,
      broadcastStyle,
    });
    const sorted = [...resolvedLines].sort((a, b) => {
      if (a.start_ms !== b.start_ms) return a.start_ms - b.start_ms;
      return String(a.id).localeCompare(String(b.id));
    });
    const { placed: withCols, speakerIndex: idx } = assignSpeakerColumns(sorted, cast);

    const totalMs = Math.max(total, 1000);
    const scale = computePxPerMs(
      totalMs,
      withCols.map((l) => l.duration_ms)
    );

    // 刻度步长随缩放自适应，避免挤成一团
    const step =
      totalMs > 180_000 ? 15_000 : totalMs > 90_000 ? 10_000 : totalMs > 45_000 ? 5_000 : 2_000;
    const tickList: number[] = [];
    for (let t = 0; t <= totalMs; t += step) tickList.push(t);

    return {
      placed: withCols,
      totalDurationMs: totalMs,
      speakerIndex: idx,
      maxColumns: Math.max(1, idx.size),
      ticks: tickList,
      pxPerMs: scale,
    };
  }, [lines, cast, broadcastStyle]);

  const selected = placed.find((l) => l.id === selectedId) ?? null;
  const selectedRaw = lines.find((l) => l.id === selectedId) ?? null;

  const emitScript = (next: DialogueGuidanceLine[]) => {
    setLines(next);
    onChangeScript(formatDialogueScriptFromGuidanceLines(next, cast));
  };

  const updateSelectedText = (nextText: string) => {
    if (!selectedId || disabled) return;
    emitScript(
      lines.map((l) =>
        l.id === selectedId ? { ...l, text: nextText, tts_markup: nextText } : l
      )
    );
  };

  // 卡片按内容高度；时长条按真实时长。短句卡片可能略超时长条，预留底部缓冲。
  const canvasHeight = Math.max(
    240,
    Math.ceil(totalDurationMs * pxPerMs) + 96
  );

  return (
    <div className={`dgt-review${disabled ? ' is-disabled' : ''}`}>
      <div className="dgt-review__banner" role="note">
        <Typography.Text>
          <strong>单轴台词时间线</strong>
          ：按角色左右分轨（主持左、嘉宾右）；色条表示预估时长，重叠时前后并排可见。
          文案框按内容自适应。与最终 TTS 成片会有偏差。
        </Typography.Text>
      </div>

      <div className="dgt-review__meta">
        <span>
          {placed.length} 句 · {speakerIndex.size} 人 · 约 {formatMsClock(totalDurationMs)}
          {maxColumns > 1 ? ` · 最多 ${maxColumns} 路并行` : ''}
        </span>
        <div className="dgt-review__legend">
          {[...speakerIndex.entries()].map(([id, i]) => {
            const name = cast.find((c) => String(c.id) === id)?.name || id;
            const c = speakerColor(i);
            return (
              <span
                key={id}
                className="dgt-review__legend-item"
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
              >
                {name}
              </span>
            );
          })}
        </div>
        {broadcastStyle ? <Tag>{broadcastStyle}</Tag> : null}
      </div>

      <div className="dgt-review__scroll">
        <div className="dgt-review__axis-wrap" style={{ height: canvasHeight }}>
          <div className="dgt-review__axis-labels" aria-hidden>
            {ticks.map((t) => (
              <span
                key={t}
                className="dgt-review__axis-tick"
                style={{ top: t * pxPerMs }}
              >
                {formatMsClock(t)}
              </span>
            ))}
          </div>

          <div className="dgt-review__axis-line" aria-hidden />

          <div className="dgt-review__canvas">
            {placed.map((item) => {
              const kind = String(item.kind ?? 'main');
              const sid = String(item.speakerId ?? '').trim() || item.displayName;
              const color = speakerColor(speakerIndex.get(sid) ?? 0);
              const active = item.id === selectedId;
              const top = item.start_ms * pxPerMs;
              const spanH = Math.max(6, item.duration_ms * pxPerMs);
              const cols = Math.max(1, item.columnsInGroup);
              const colW = 100 / cols;
              const leftPct = item.column * colW;
              const widthPct = colW - 1.2;

              return (
                <div
                  key={item.id}
                  className={`dgt-review__lane${active ? ' is-active' : ''}`}
                  style={{
                    top,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minHeight: spanH,
                  }}
                >
                  <div
                    className="dgt-review__span"
                    style={{ height: spanH, background: color.span }}
                    title={`${formatMsClock(item.start_ms)}–${formatMsClock(
                      item.start_ms + item.duration_ms
                    )}`}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className={`dgt-review__block${active ? ' is-active' : ''}${
                      kind === 'interrupt' || kind === 'affirmation' ? ' is-overlap-kind' : ''
                    }`}
                    style={{
                      background: color.bg,
                      borderColor: color.border,
                      color: color.text,
                    }}
                    disabled={disabled}
                    onClick={() => setSelectedId(item.id)}
                    title={`${item.displayName} · ${formatMsClock(item.start_ms)}–${formatMsClock(
                      item.start_ms + item.duration_ms
                    )}`}
                  >
                    <span className="dgt-review__block-meta">
                      <span className="dgt-review__block-speaker">{item.displayName}</span>
                      <span className="dgt-review__block-kind">
                        {KIND_LABELS[kind] ?? kind}
                      </span>
                      <span className="dgt-review__block-time">
                        {formatMsClock(item.start_ms)} · {formatMsClock(item.duration_ms)}
                      </span>
                    </span>
                    <span className="dgt-review__block-text">
                      {item.displayText || '（空）'}
                    </span>
                  </button>
                </div>
              );
            })}
            {placed.length === 0 ? (
              <p className="dgt-review__empty">暂无台词行</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="dgt-review__editor">
        {selected && selectedRaw ? (
          <>
            <div className="dgt-review__editor-head">
              <Typography.Text strong>【{selected.displayName}】</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatMsClock(selected.start_ms)}–
                {formatMsClock(selected.start_ms + selected.duration_ms)}
                {selected.kind ? ` · ${KIND_LABELS[selected.kind] ?? selected.kind}` : ''}
                {selected.cue?.offsetMs != null && selected.cue.offsetMs !== 0
                  ? ` · offset ${selected.cue.offsetMs > 0 ? '+' : ''}${selected.cue.offsetMs}ms`
                  : ''}
              </Typography.Text>
            </div>
            <Input.TextArea
              value={String(selectedRaw.tts_markup ?? selectedRaw.text ?? '')}
              onChange={(e) => updateSelectedText(e.target.value)}
              disabled={disabled}
              autoSize={{ minRows: 3, maxRows: 8 }}
              placeholder="编辑本句 TTS 稿（可含 <#0.3#> 停顿）"
            />
          </>
        ) : (
          <Typography.Text type="secondary">点选时间轴上的台词块进行编辑</Typography.Text>
        )}
      </div>
    </div>
  );
}
