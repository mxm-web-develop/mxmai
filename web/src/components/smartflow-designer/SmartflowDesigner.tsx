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
import { App, Button, Drawer, Modal, Space, Typography } from 'antd';
import type { SmartflowSchemaBody } from '../../api/client';
import {
  RF_NODE_TYPE,
  createBusinessNode,
  createDefaultNode,
  createToolNode,
  flowToSchema,
  parseSchemaJson,
  schemaToFlowNodesEdges,
  type BusinessScope,
  type SfCanvasData,
  type ToolKind,
} from './schemaFlow';
import { SfCanvasNode } from './SfCanvasNode';
import { SmartflowProperties } from './SmartflowProperties';
import './smartflow-designer.css';

const nodeTypes = { [RF_NODE_TYPE]: SfCanvasNode };

type InnerProps = {
  schemaJson: string;
  syncToken: number;
  onSchemaChange: (schema: SmartflowSchemaBody) => void;
};

function FlowCanvasInner({ schemaJson, syncToken, onSchemaChange }: InnerProps) {
  const { message } = App.useApp();
  const { fitView } = useReactFlow();
  const lastEmit = useRef<string>('');
  const skipEmit = useRef(false);
  const schemaJsonRef = useRef(schemaJson);
  schemaJsonRef.current = schemaJson;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SfCanvasData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** 外部同步：仅 syncToken 变化时从 JSON 重置画布 */
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
    queueMicrotask(() => {
      fitView({ padding: 0.2, duration: 200 });
    });
  }, [syncToken, fitView, setNodes, setEdges]);

  /** 画布变更 → 写回 schema */
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
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges]
  );

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const peerNodes = useMemo(() => nodes, [nodes]);

  const updateSelectedSf = useCallback(
    (nextSf: Record<string, unknown>) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { sfNode: nextSf } } : n))
      );
    },
    [selectedId, setNodes]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }, [selectedId, setNodes, setEdges]);

  const pushNode = useCallback(
    (raw: Record<string, unknown>) => {
      const id = String(raw.id);
      setNodes((nds) => {
        const offset = nds.length * 24;
        const newNode: Node<SfCanvasData> = {
          id,
          type: RF_NODE_TYPE,
          position: { x: 120 + offset, y: 120 + offset },
          data: { sfNode: raw },
        };
        return [...nds, newNode];
      });
      setSelectedId(id);
    },
    [setNodes]
  );

  const addNode = useCallback(
    (kind: Parameters<typeof createDefaultNode>[0]) => {
      const hasStart = nodes.some((n) => String(n.data.sfNode.type) === 'start');
      const hasEnd = nodes.some((n) => String(n.data.sfNode.type) === 'end');
      if (kind === 'start' && hasStart) {
        message.info('已存在开始节点');
        return;
      }
      if (kind === 'end' && hasEnd) {
        message.info('已存在结束节点');
        return;
      }
      pushNode(createDefaultNode(kind));
    },
    [nodes, pushNode]
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

  const onNodeClick = useCallback((_: MouseEvent, node: Node<SfCanvasData>) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => setSelectedId(null), []);

  const validateGraph = useCallback(() => {
    const hasStart = nodes.some((n) => String(n.data.sfNode.type) === 'start');
    const hasEnd = nodes.some((n) => String(n.data.sfNode.type) === 'end');
    if (!hasStart || !hasEnd) {
      message.warning('引擎需要至少一个「开始」与一个「结束」节点');
      return false;
    }
    return true;
  }, [nodes]);

  return (
    <div className="smartflow-designer-root">
      {/* 工具栏：横向排列在画布上方 */}
      <div className="smartflow-designer-toolbar">
        <Space size="small" style={{ flexWrap: 'nowrap' }}>
          <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            流程
          </Typography.Text>
          <Button size="small" onClick={() => addNode('start')}>
            开始
          </Button>
          <Button size="small" onClick={() => addNode('end')}>
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
            业务
          </Typography.Text>
          <Button size="small" onClick={() => addBusiness('writing')}>
            + 业务节点
          </Button>
        </Space>
        <div className="smartflow-toolbar-divider" />
        <Space size="small" style={{ flexWrap: 'nowrap' }}>
          <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            工具
          </Typography.Text>
          <Button size="small" onClick={() => addTool('web_search')}>
            Brave 搜索
          </Button>
          <Button size="small" onClick={() => addTool('web_scraper')}>
            爬虫
          </Button>
          <Button size="small" onClick={() => addTool('embedding')}>
            Embedding
          </Button>
          <Button size="small" onClick={() => addTool('code_js')}>
            Node.js
          </Button>
          <Button size="small" onClick={() => addTool('code_py')}>
            Python
          </Button>
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

      <div
        className="smartflow-designer-canvas-wrap"
        style={{ flex: 1, height: '100%', minHeight: 0 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[12, 12]}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodesDelete={(deleted) => {
            const ids = deleted.map((n) => n.id);
            Modal.confirm({
              title: '确认删除',
              content: `确定删除 ${ids.length} 个节点？`,
              okText: '删除',
              okType: 'danger',
              cancelText: '取消',
              onOk: () => {
                setNodes((nds) => nds.filter((n) => !ids.includes(n.id)));
                setEdges((eds) => eds.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)));
                if (ids.includes(selectedId ?? '')) setSelectedId(null);
              },
            });
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} color="rgba(148,163,184,0.2)" />
          <Controls showInteractive={false} />
          <MiniMap zoomable pannable />
          <Panel position="top-right">
            <Typography.Text type="secondary" style={{ fontSize: 11, maxWidth: 200 }}>
              拖拽连线：从下缘拖到下一节点上缘；Delete 删除选中
            </Typography.Text>
          </Panel>
        </ReactFlow>
      </div>

      {/* 右侧属性面板改为 Drawer */}
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
          onDelete={deleteSelected}
        />
      </Drawer>
    </div>
  );
}

export type SmartflowDesignerProps = {
  schemaJson: string;
  /** 父组件在「加载详情 / 插入模板 / 从 JSON 同步」时 +1 */
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
