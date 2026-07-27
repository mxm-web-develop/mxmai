import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { SfCanvasData } from './schemaFlow';

const TYPE_LABEL: Record<string, string> = {
  start: '开始',
  model: '业务/模型',
  end: '结束',
  tools: '工具',
  condition: '条件',
  loop: '循环',
  variable: '变量',
  plan_execute: '计划执行',
  reflection: '反思环',
  react: 'ReAct',
  research: '调研摘要',
};

const TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  start: { bg: 'rgba(16,185,129,0.15)', border: '#10b981' },
  model: { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6' },
  business: { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6' },
  tools: { bg: 'rgba(249,115,22,0.15)', border: '#f97316' },
  condition: { bg: 'rgba(234,179,8,0.15)', border: '#eab308' },
  loop: { bg: 'rgba(6,182,212,0.15)', border: '#06b6d4' },
  variable: { bg: 'rgba(236,72,153,0.15)', border: '#ec4899' },
  end: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444' },
  plan_execute: { bg: 'rgba(99,102,241,0.18)', border: '#6366f1' },
  reflection: { bg: 'rgba(99,102,241,0.18)', border: '#818cf8' },
  react: { bg: 'rgba(99,102,241,0.18)', border: '#4f46e5' },
  research: { bg: 'rgba(99,102,241,0.18)', border: '#7c3aed' },
};

type SfBlockNode = Node<SfCanvasData, 'sfBlock'>;

function SfCanvasNodeInner({ data, selected }: NodeProps<SfBlockNode>) {
  const sn = data.sfNode;
  const ui = data.ui;
  const t = String(sn.type ?? 'node');
  const name = String(sn.name ?? sn.id ?? '');
  const bizScope = sn.business_scope != null ? String(sn.business_scope) : '';
  const taskKey = sn.taskKey != null ? String(sn.taskKey) : '';
  const subtype = sn.subtype != null ? String(sn.subtype) : '';
  const label =
    (t === 'model' || t === 'business') && bizScope
      ? `业务 · ${bizScope}`
      : TYPE_LABEL[t] ?? t;

  const isStart = t === 'start';
  const isEnd = t === 'end';
  const isLoop = t === 'loop';
  const loopNodes = isLoop && Array.isArray(sn.loop_nodes) ? (sn.loop_nodes as string[]) : [];
  const parallel = isLoop && Boolean(sn.parallel_iterations);
  const iterableRaw = isLoop ? String(sn.iterable ?? '') : '';
  const iterableShort =
    iterableRaw.length > 28 ? `${iterableRaw.slice(0, 26)}…` : iterableRaw;

  const extraClass = [
    ui?.loopBodyHighlight ? 'sf-canvas-node--loop-body-highlight' : '',
    ui?.loopBodyMember ? 'sf-canvas-node--loop-body-member' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`sf-canvas-node ${selected ? 'sf-canvas-node--selected' : ''} sf-canvas-node--${t} ${extraClass}`}
      style={{
        ...TYPE_COLORS[t] || TYPE_COLORS.model,
        minWidth: 160,
        maxWidth: 220,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${TYPE_COLORS[t]?.border || '#6b7280'}`,
        boxShadow: selected ? `0 0 0 2px ${TYPE_COLORS[t]?.border || '#3b82f6'}55` : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: '#94a3b8', width: 8, height: 8 }}
        />
      )}
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
        {t === 'tools' && sn.tool_type != null ? `工具 · ${String(sn.tool_type)}` : label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{name}</div>
      {(t === 'model' || t === 'business') && (
        <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>
          {taskKey ? `${taskKey}${subtype ? ` / ${subtype}` : ''}` : '未选择业务'}
        </div>
      )}
      {(t === 'plan_execute' || t === 'reflection' || t === 'react' || t === 'research') && (
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>
          Agent · {t === 'reflection' ? `max ${String(sn.max_rounds ?? 3)} 轮` : t === 'react' ? `max ${String(sn.max_steps ?? 10)} 步` : t === 'plan_execute' ? `max ${String(sn.max_steps ?? 6)} 步` : '调研'}
        </div>
      )}
      {isLoop && (
        <div className="sf-canvas-node__loop-summary">
          <div>循环体 · {loopNodes.length} 个节点</div>
          {parallel && <div>并行 · 最大 {String(sn.max_concurrency ?? 3)} 并发</div>}
          {iterableShort && <div className="sf-canvas-node__loop-iterable">{iterableShort}</div>}
        </div>
      )}
      {ui?.loopBodyMember && ui.loopBodyConflict && ui.loopBodyOwners && (
        <div className="sf-canvas-node__loop-body-badge sf-canvas-node__loop-body-badge--conflict">
          循环体冲突 · {ui.loopBodyOwners.length} 个 Loop
        </div>
      )}
      {ui?.loopBodyMember && !ui.loopBodyConflict && ui.loopBodyOwners?.[0] && (
        <div className="sf-canvas-node__loop-body-badge">
          循环体内 · {ui.loopBodyOwners[0].loopName}
        </div>
      )}
      {t === 'condition' ? (
        <>
          {/* then 分支 - 顶部 */}
          <Handle type="source" position={Position.Top} id="then" style={{ top: 8, background: '#10b981', width: 8, height: 8 }} />
          {/* else_if 分支 - 右侧，动态计算 top 偏移避免重叠 */}
          {(sn.else_if as Array<{condition?: string; then?: string}> || []).map((_, i) => {
            const branchOffset = 24 + i * 22;
            return (
              <Handle key={`elseif-${i}`} type="source" position={Position.Right} id={`elseif-${i}`} style={{ top: branchOffset, right: 8, background: '#eab308', width: 8, height: 8 }} />
            );
          })}
          {/* else 分支 - 底部 */}
          <Handle type="source" position={Position.Bottom} id="else" style={{ bottom: 8, background: '#94a3b8', width: 8, height: 8 }} />
        </>
      ) : isLoop ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="main"
            className="sf-handle sf-handle--main"
            style={{ background: '#64748b', width: 10, height: 10, bottom: -5 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="loop-body"
            className="sf-handle sf-handle--loop-body"
            style={{ background: '#06b6d4', width: 10, height: 10, right: -5, top: '42%' }}
          />
          <span className="sf-handle-label sf-handle-label--main">主流程</span>
          <span className="sf-handle-label sf-handle-label--loop-body">循环体</span>
        </>
      ) : !isEnd && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: '#64748b', width: 8, height: 8 }}
        />
      )}
    </div>
  );
}

export const SfCanvasNode = memo(SfCanvasNodeInner);
