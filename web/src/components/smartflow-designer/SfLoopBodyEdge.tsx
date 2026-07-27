import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

/** 循环体虚拟边：仅展示，不参与 schema 持久化；可点击移除 loop_nodes */
export function SfLoopBodyEdge(props: EdgeProps) {
  const {
    id,
    selected,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = (data as { label?: string } | undefined)?.label ?? '每轮执行';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          stroke: selected ? '#fbbf24' : '#06b6d4',
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: '6 4',
          opacity: selected ? 1 : 0.85,
          cursor: 'pointer',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={`sf-loop-body-edge-label nodrag nopan${selected ? ' sf-loop-body-edge-label--selected' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
