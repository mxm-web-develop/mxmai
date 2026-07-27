import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { App, Alert, Button, Drawer, Dropdown, Space, Typography } from 'antd';
import type { SmartflowSchemaBody } from '../../api/client';
import {
  RF_NODE_TYPE,
  applyCanvasUiState,
  buildLoopBodyEdges,
  findLoopBodyConflicts,
  createBusinessNode,
  createCompositeNode,
  createDefaultNode,
  createToolNode,
  flowToSchema,
  isLoopBodyEdgeId,
  LOOP_BODY_SOURCE_HANDLE,
  LOOP_MAIN_SOURCE_HANDLE,
  parseLoopBodyEdgeId,
  parseSchemaJson,
  schemaToFlowNodesEdges,
  type BusinessScope,
  type CompositeKind,
  type SfCanvasData,
  type ToolKind,
} from './schemaFlow';
import { SfCanvasNode } from './SfCanvasNode';
import { SfLoopBodyEdge } from './SfLoopBodyEdge';
import { SmartflowProperties } from './SmartflowProperties';
import { SfCanvasContextMenu } from './SfCanvasContextMenu';
import { getDisabledFlowCatalogIds, type CatalogContext } from './nodeCatalog';
import './smartflow-designer.css';

const nodeTypes = { [RF_NODE_TYPE]: SfCanvasNode };
const edgeTypes = { loopBody: SfLoopBodyEdge };

const AGENT_MENU_ITEMS: { key: CompositeKind; label: string }[] = [
  { key: 'plan_execute', label: '计划执行' },
  { key: 'reflection', label: '反思环' },
  { key: 'react', label: 'ReAct' },
  { key: 'research', label: '调研摘要' },
];

type InnerProps = {
  schemaJson: string;
  syncToken: number;
  onSchemaChange: (schema: SmartflowSchemaBody) => void;
};

function FlowCanvasInner({ schemaJson, syncToken, onSchemaChange }: InnerProps) {
  const { message, modal } = App.useApp();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const lastEmit = useRef<string>('');
  const skipEmit = useRef(false);
  const schemaJsonRef = useRef(schemaJson);
  schemaJsonRef.current = schemaJson;
  const quickAddFlowPos = useRef<{ x: number; y: number } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SfCanvasData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const parsed = parseSchemaJson(schemaJsonRef.current);
    if (!parsed) {
      message.warning('无法解析 schema JSON');
      skipEmit.current = true;
      return;
    }
    skipEmit.current = true;
    const { nodes: n, edges: e } = schemaToFlowNodesEdges(parsed);
    setNodes(n);
    setEdges(e);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setContextMenu(null);
    queueMicrotask(() => {
      fitView({ padding: 0.2, duration: 200 });
    });
  }, [syncToken, fitView, setNodes, setEdges, message]);

  useEffect(() => {
    if (skipEmit.current) {
      skipEmit.current = false;
      return;
    }
    const parsed = parseSchemaJson(schemaJsonRef.current);
    const base: SmartflowSchemaBody = parsed ?? {
      version: '2.0.0',
      nodes: [],
      edges: [],
    };
    const next = flowToSchema(nodes, edges, base);
    const serialized = JSON.stringify(next);
    if (serialized === lastEmit.current) return;
    lastEmit.current = serialized;
    onSchemaChange(next);
  }, [nodes, edges, onSchemaChange]);

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (!params.source || !params.target) return;

      if (params.sourceHandle === LOOP_BODY_SOURCE_HANDLE) {
        const targetType = String(targetNode?.data?.sfNode?.type ?? '');
        if (targetType === 'start' || targetType === 'end') {
          message.warning('循环体出口请连到业务/变量等执行节点，不要连 start/end');
          return;
        }
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== params.source) return n;
            const sn = { ...(n.data.sfNode ?? {}) } as Record<string, unknown>;
            const list = Array.isArray(sn.loop_nodes) ? [...(sn.loop_nodes as string[])] : [];
            if (!list.includes(params.target!)) list.push(params.target!);
            return { ...n, data: { ...n.data, sfNode: { ...sn, loop_nodes: list } } };
          })
        );
        message.success('已加入循环体（青色虚线）');
        return;
      }

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            sourceHandle:
              String(sourceNode?.data?.sfNode?.type) === 'loop'
                ? LOOP_MAIN_SOURCE_HANDLE
                : params.sourceHandle,
            animated: true,
            selectable: true,
            interactionWidth: 24,
            zIndex: 2,
          },
          eds
        )
      );
    },
    [nodes, setEdges, setNodes, message]
  );

  const isValidConnection = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return false;
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetType = String(
        nodes.find((n) => n.id === params.target)?.data?.sfNode?.type ?? ''
      );
      if (params.sourceHandle === LOOP_BODY_SOURCE_HANDLE) {
        return (
          String(sourceNode?.data?.sfNode?.type) === 'loop' &&
          targetType !== 'start' &&
          targetType !== 'end'
        );
      }
      if (String(sourceNode?.data?.sfNode?.type) === 'loop') {
        return params.sourceHandle === LOOP_MAIN_SOURCE_HANDLE || !params.sourceHandle;
      }
      return true;
    },
    [nodes]
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const peerNodes = useMemo(() => nodes, [nodes]);

  const displayNodes = useMemo(
    () => applyCanvasUiState(nodes, selectedId),
    [nodes, selectedId]
  );

  const displayEdges = useMemo(() => {
    const bodyEdges = buildLoopBodyEdges(nodes).map((e) => ({
      ...e,
      selected: e.id === selectedEdgeId,
      selectable: true,
      focusable: true,
      deletable: false,
      zIndex: e.id === selectedEdgeId ? 3 : 0,
      interactionWidth: 24,
    }));
    const mainEdges = edges.map((e) => ({
      ...e,
      selected: e.id === selectedEdgeId,
      selectable: true,
      deletable: true,
      zIndex: 2,
      interactionWidth: 24,
    }));
    return [...bodyEdges, ...mainEdges];
  }, [edges, nodes, selectedEdgeId]);

  const selectedEdgeIsLoopBody = Boolean(selectedEdgeId && isLoopBodyEdgeId(selectedEdgeId));

  const loopBodyConflicts = useMemo(() => findLoopBodyConflicts(nodes), [nodes]);

  const focusLoopBody = useCallback(() => {
    const sel = nodes.find((n) => n.id === selectedId);
    if (!sel || String(sel.data.sfNode.type) !== 'loop') {
      message.info('请先选中循环节点');
      return;
    }
    const loopNodes = Array.isArray(sel.data.sfNode.loop_nodes)
      ? (sel.data.sfNode.loop_nodes as string[])
      : [];
    if (loopNodes.length === 0) {
      message.info('请先在属性面板配置循环体节点');
      return;
    }
    const ids = [selectedId!, ...loopNodes];
    fitView({ nodes: ids.map((id) => ({ id })), padding: 0.4, duration: 280 });
  }, [nodes, selectedId, fitView, message]);

  const updateSelectedSf = useCallback(
    (nextSf: Record<string, unknown>) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { sfNode: nextSf } } : n))
      );
    },
    [selectedId, setNodes]
  );

  const removeLoopBodyLink = useCallback(
    (loopId: string, bodyId: string, showToast = true) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== loopId) return n;
          const sn = { ...(n.data.sfNode ?? {}) } as Record<string, unknown>;
          const list = Array.isArray(sn.loop_nodes)
            ? (sn.loop_nodes as string[]).filter((id) => id !== bodyId)
            : [];
          return { ...n, data: { ...n.data, sfNode: { ...sn, loop_nodes: list } } };
        })
      );
      if (showToast) message.success('已从循环体移除');
    },
    [setNodes, message]
  );

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    const isLoopBody = isLoopBodyEdgeId(selectedEdgeId);
    if (isLoopBody) {
      const parsed = parseLoopBodyEdgeId(selectedEdgeId);
      if (!parsed) return;
      removeLoopBodyLink(parsed.loopId, parsed.bodyId, false);
    } else {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId));
    }
    setSelectedEdgeId(null);
    message.success(isLoopBody ? '已移除循环体连线' : '已删除连线');
  }, [selectedEdgeId, setEdges, message, removeLoopBodyLink]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedEdgeId(null);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, [contenteditable="true"]')) return;

      if (selectedEdgeId) {
        e.preventDefault();
        deleteSelectedEdge();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEdgeId, deleteSelectedEdge]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }, [selectedId, setNodes, setEdges]);

  const pushNode = useCallback(
    (raw: Record<string, unknown>, position?: { x: number; y: number }) => {
      const id = String(raw.id);
      setNodes((nds) => {
        const offset = nds.length * 24;
        const newNode: Node<SfCanvasData> = {
          id,
          type: RF_NODE_TYPE,
          position: position ?? { x: 120 + offset, y: 120 + offset },
          data: { sfNode: raw },
        };
        return [...nds, newNode];
      });
      setSelectedId(id);
    },
    [setNodes]
  );

  const hasStart = useMemo(
    () => nodes.some((n) => String(n.data.sfNode.type) === 'start'),
    [nodes]
  );
  const hasEnd = useMemo(
    () => nodes.some((n) => String(n.data.sfNode.type) === 'end'),
    [nodes]
  );
  const disabledCatalogIds = useMemo(
    () => getDisabledFlowCatalogIds(hasStart, hasEnd),
    [hasStart, hasEnd]
  );

  const addNode = useCallback(
    (kind: Parameters<typeof createDefaultNode>[0], position?: { x: number; y: number }) => {
      if (kind === 'start' && hasStart) {
        message.info('已存在开始节点');
        return;
      }
      if (kind === 'end' && hasEnd) {
        message.info('已存在结束节点');
        return;
      }
      pushNode(createDefaultNode(kind), position);
    },
    [hasStart, hasEnd, pushNode, message]
  );

  const addBusiness = useCallback(
    (scope: BusinessScope) => {
      pushNode(createBusinessNode(scope));
    },
    [pushNode]
  );

  const addTool = useCallback(
    (k: ToolKind) => {
      pushNode(createToolNode(k));
    },
    [pushNode]
  );

  const addComposite = useCallback(
    (kind: CompositeKind) => {
      pushNode(createCompositeNode(kind));
    },
    [pushNode]
  );

  const catalogCtx: CatalogContext = useMemo(
    () => ({
      addNode,
      addBusiness,
      addTool,
      addComposite,
    }),
    [addNode, addBusiness, addTool, addComposite]
  );

  const onPaneContextMenu = useCallback(
    (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      quickAddFlowPos.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [screenToFlowPosition]
  );

  const onNodeContextMenu = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onNodeClick = useCallback((_: MouseEvent, node: Node<SfCanvasData>) => {
    setContextMenu(null);
    setSelectedEdgeId(null);
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedId(null);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((_: MouseEvent, edge: Edge) => {
    setSelectedId(null);
    setSelectedEdgeId(edge.id);
  }, []);

  // Simpler quick add: store pending position and wrap pushNode in catalog context for quick add only
  const quickAddCatalogCtx: CatalogContext = useMemo(() => {
    const posRef = quickAddFlowPos;
    const wrap =
      (factory: () => Record<string, unknown>) =>
      () => {
        const pos = posRef.current ?? undefined;
        posRef.current = null;
        setContextMenu(null);
        pushNode(factory(), pos);
      };
    return {
      addNode: (kind) => {
        const pos = posRef.current ?? undefined;
        posRef.current = null;
        setContextMenu(null);
        addNode(kind, pos);
      },
      addBusiness: (scope) => wrap(() => createBusinessNode(scope))(),
      addTool: (k) => wrap(() => createToolNode(k))(),
      addComposite: (kind) => wrap(() => createCompositeNode(kind))(),
    };
  }, [addNode, pushNode]);

  const validateGraph = useCallback(() => {
    if (!hasStart || !hasEnd) {
      message.warning('引擎需要至少一个「开始」与一个「结束」节点');
      return false;
    }
    return true;
  }, [hasStart, hasEnd, message]);

  return (
    <div className="smartflow-designer-root">
      <div className="smartflow-designer-main">
        <div className="smartflow-designer-toolbar smartflow-designer-toolbar--top">
            <Space size="small" style={{ flexWrap: 'nowrap' }}>
              <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                流程
              </Typography.Text>
              <Button size="small" disabled={hasStart} onClick={() => addNode('start')}>
                开始
              </Button>
              <Button size="small" disabled={hasEnd} onClick={() => addNode('end')}>
                结束
              </Button>
              <Button size="small" onClick={() => addNode('condition')}>
                条件
              </Button>
              <Button size="small" onClick={() => addNode('variable')}>
                变量
              </Button>
              <Button size="small" onClick={() => addNode('loop')}>
                循环
              </Button>
            </Space>
            <div className="smartflow-toolbar-divider" />
            <Space size="small" style={{ flexWrap: 'nowrap' }}>
              <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                Agent
              </Typography.Text>
              <Dropdown
                menu={{
                  items: AGENT_MENU_ITEMS.map((i) => ({
                    key: i.key,
                    label: i.label,
                    onClick: () => addComposite(i.key),
                  })),
                }}
              >
                <Button size="small">+ Agent 模式</Button>
              </Dropdown>
            </Space>
            <div className="smartflow-toolbar-divider" />
            <Space size="small" style={{ flexWrap: 'nowrap' }}>
              <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                业务
              </Typography.Text>
              <Dropdown
                menu={{
                  items: [
                    { key: 'writing', label: '写作', onClick: () => addBusiness('writing') },
                    { key: 'text', label: '文本', onClick: () => addBusiness('text') },
                    { key: 'graph', label: '图文', onClick: () => addBusiness('graph') },
                    { key: 'audio', label: '音频', onClick: () => addBusiness('audio') },
                    { key: 'video', label: '视频', onClick: () => addBusiness('video') },
                  ],
                }}
              >
                <Button size="small">+ 业务节点</Button>
              </Dropdown>
            </Space>
            <div className="smartflow-toolbar-divider" />
            <Space size="small" style={{ flexWrap: 'nowrap' }}>
              <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                工具
              </Typography.Text>
              <Dropdown
                menu={{
                  items: [
                    { key: 'deep_search', label: '深度搜索', onClick: () => addTool('deep_search') },
                    { key: 'web_scraper', label: '爬虫', onClick: () => addTool('web_scraper') },
                    { key: 'code_js', label: 'Node.js', onClick: () => addTool('code_js') },
                    { key: 'code_py', label: 'Python', onClick: () => addTool('code_py') },
                    { key: 'vector_store', label: '向量存储', onClick: () => addTool('vector_store') },
                    { key: 'vector_recall', label: '向量召回', onClick: () => addTool('vector_recall') },
                  ],
                }}
              >
                <Button size="small">+ 工具</Button>
              </Dropdown>
            </Space>
            <div className="smartflow-toolbar-divider" />
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => {
                if (validateGraph()) message.success('结构检查通过（含开始/结束）');
              }}
            >
              检查：需有开始+结束
            </Button>
          </div>

        {loopBodyConflicts.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ margin: '0 12px 8px', flexShrink: 0 }}
            title="循环体冲突"
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {loopBodyConflicts.map((c) => (
                  <li key={c.bodyId}>
                    节点「{c.bodyName}」被 {c.loopNames.length} 个 Loop 引用（{c.loopNames.join('、')}），运行时行为未定义
                  </li>
                ))}
              </ul>
            }
          />
        )}

        <div className="smartflow-designer-canvas-wrap">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            elevateEdgesOnSelect={false}
            onNodesChange={onNodesChange}
            onEdgesChange={(changes) => {
              onEdgesChange(
                changes.filter((c) => {
                  if ('id' in c && typeof c.id === 'string') return !isLoopBodyEdgeId(c.id);
                  return true;
                })
              );
            }}
            onEdgesDelete={(deleted) => {
              const ids = deleted.filter((e) => !isLoopBodyEdgeId(e.id)).map((e) => e.id);
              if (ids.length === 0) return;
              setEdges((eds) => eds.filter((e) => !ids.includes(e.id)));
              setSelectedEdgeId(null);
            }}
            defaultEdgeOptions={{
              selectable: true,
              deletable: true,
              interactionWidth: 24,
            }}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onEdgeClick={onEdgeClick}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[12, 12]}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodesDelete={(deleted) => {
              const ids = deleted.map((n) => n.id);
              modal.confirm({
                title: '确认删除',
                content: `确定删除 ${ids.length} 个节点？`,
                okText: '删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: () => {
                  setNodes((nds) => nds.filter((n) => !ids.includes(n.id)));
                  setEdges((eds) =>
                    eds.filter((e) => !ids.includes(e.source) && !ids.includes(e.target))
                  );
                  if (ids.includes(selectedId ?? '')) setSelectedId(null);
                },
              });
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Lines} gap={24} color="rgba(148,163,184,0.2)" />
            <Controls showInteractive={false} />
            <MiniMap zoomable pannable />
            <Panel position="bottom-center">
              {selectedEdgeId ? (
                <Space size="small" className="sf-edge-toolbar">
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {selectedEdgeIsLoopBody
                      ? '已选中循环体连线（不删节点）'
                      : '已选中主流程连线'}
                  </Typography.Text>
                  <Button size="small" danger onClick={deleteSelectedEdge}>
                    {selectedEdgeIsLoopBody ? '移除连线' : '删除连线'}
                  </Button>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    或按 Delete / Backspace
                  </Typography.Text>
                </Space>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  点击连线选中 · Delete / Backspace 删除
                </Typography.Text>
              )}
            </Panel>
            <Panel position="top-right">
              <Typography.Text type="secondary" style={{ fontSize: 11, maxWidth: 300 }}>
                主流程：Loop 底部「主流程」→ End（实线，可选中删除）；循环体：右侧「循环体」拖到业务节点或属性面板 loop_nodes（青色虚线）
              </Typography.Text>
            </Panel>
          </ReactFlow>
          <SfCanvasContextMenu
            open={contextMenu != null}
            x={contextMenu?.x ?? 0}
            y={contextMenu?.y ?? 0}
            onClose={() => setContextMenu(null)}
            catalogCtx={quickAddCatalogCtx}
            disabledIds={disabledCatalogIds}
          />
        </div>
      </div>

      <Drawer
        title="节点属性"
        placement="right"
        size={360}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        closable
        mask={false}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <SmartflowProperties
          node={selectedNode}
          peerNodes={peerNodes}
          onChange={updateSelectedSf}
          onDelete={deleteSelectedNode}
          onFocusLoopBody={focusLoopBody}
        />
      </Drawer>
    </div>
  );
}

export type SmartflowDesignerProps = {
  schemaJson: string;
  syncToken: number;
  onSchemaChange: (schema: SmartflowSchemaBody) => void;
};

export function SmartflowDesigner(props: SmartflowDesignerProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
