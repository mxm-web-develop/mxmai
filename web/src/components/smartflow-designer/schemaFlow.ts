import type { Edge, Node } from '@xyflow/react';
import type { SmartflowSchemaBody } from '../../api/client';

/** 画布节点 data */
export type SfCanvasData = {
  sfNode: Record<string, unknown>;
};

const RF_NODE_TYPE = 'sfBlock';

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 业务节点 scope（映射为 business_scope，调用 mxmcgi /api/v2/tasks 动态业务） */
export const BUSINESS_SCOPES = [
  { value: 'writing', label: '写作 (writing)' },
  { value: 'outline', label: '大纲 (outline)' },
  { value: 'text', label: '文本 (text)' },
  { value: 'graph', label: '图文 (graph)' },
  { value: 'audio', label: '音频 (audio)' },
  { value: 'video', label: '视频 (video)' },
] as const;

export type BusinessScope = (typeof BUSINESS_SCOPES)[number]['value'];

export type ToolKind = 'web_search' | 'web_scraper' | 'embedding' | 'code_js' | 'code_py';

export function createDefaultNode(
  kind: 'start' | 'end' | 'business' | 'tools' | 'condition' | 'variable' | 'loop'
): Record<string, unknown> {
  switch (kind) {
    case 'start':
      return {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [{ name: 'topic', type: 'text', content: '' }],
        expected_outputs: [{ type: 'text', name: 'reply', required: true }],
        smartflow_name: '',
      };
    case 'end':
      return {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: { reply: '{{llm.output.text}}' },
        validate_outputs: false,
      };
    case 'business':
      return {
        id: newId('biz'),
        type: 'business',
        name: '业务节点',
        business_scope: 'writing',
        taskKey: '',
        subtype: null,
        params: {},
      };
    case 'tools':
      return {
        id: newId('tool'),
        type: 'tools',
        name: '工具',
        tool_type: 'web_search' as const,
        tool_params: {},
      };
    case 'condition':
      return {
        id: newId('cond'),
        type: 'condition',
        name: '条件分支',
        if: 'true',
        then: '',
        else_if: [] as { condition: string; then: string }[],
        else: '',
      };
    case 'variable':
      return {
        id: newId('var'),
        type: 'variable',
        name: '变量',
        operation: 'select' as const,
        source_path: '{{nodeId.output.field}}',
        output_name: 'value',
        default_value: '',
      };
    case 'loop':
      return {
        id: newId('loop'),
        type: 'loop',
        name: '循环',
        iterable: '{{items}}',
        item_variable: 'item',
        max_iterations: 10,
      };
    default:
      return { id: newId('node'), type: 'model', name: '节点' };
  }
}

/** 业务节点：底层为 business，带 business_scope + taskKey + subtype + params（v2 动态业务） */
export function createBusinessNode(scope: BusinessScope = 'writing'): Record<string, unknown> {
  const id = newId('biz');
  return {
    id,
    type: 'business',
    name: `业务 · ${BUSINESS_SCOPES.find((s) => s.value === scope)?.label ?? scope}`,
    business_scope: scope,
    taskKey: '',
    subtype: null,
    params: {} as Record<string, unknown>,
  };
}

/** 工具类：web_search / embedding 都用 tools */
export function createToolNode(toolKind: ToolKind): Record<string, unknown> {
  const id = newId('tool');
  if (toolKind === 'code_js' || toolKind === 'code_py') {
    return {
      id,
      type: 'tools',
      name: toolKind === 'code_js' ? '工具 · Node.js 执行器' : '工具 · Python 执行器',
      tool_type: 'code_executor' as const,
      tool_params: {} as Record<string, unknown>,
      custom_language: toolKind === 'code_js' ? ('javascript' as const) : ('python' as const),
      custom_code: '',
      custom_nl_prompt: '',
    };
  }
  return {
    id,
    type: 'tools',
    name:
      toolKind === 'web_search'
        ? '工具 · Brave 搜索'
        : toolKind === 'web_scraper'
          ? '工具 · 爬虫搜索'
          : '工具 · Embedding',
    tool_type: toolKind,
    tool_params: {} as Record<string, unknown>,
  };
}

function layoutPosition(index: number, pos?: { x?: number; y?: number }): { x: number; y: number } {
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    return { x: pos.x, y: pos.y };
  }
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: 40 + col * 260, y: 40 + row * 160 };
}

export function schemaToFlowNodesEdges(schema: SmartflowSchemaBody): { nodes: Node<SfCanvasData>[]; edges: Edge[] } {
  const rawNodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const rawEdges = Array.isArray(schema.edges) ? schema.edges : [];

  const nodes: Node<SfCanvasData>[] = rawNodes.map((n, i) => {
    const sn = n as Record<string, unknown>;
    const id = String(sn.id ?? `n${i}`);
    const pos = layoutPosition(i, sn.position as { x?: number; y?: number } | undefined);
    const sfNode = { ...sn, id } as Record<string, unknown> & { position?: unknown };
    delete sfNode.position;
    return {
      id,
      type: RF_NODE_TYPE,
      position: pos,
      data: { sfNode },
    };
  });

  const edges: Edge[] = rawEdges.map((e, i) => {
    const from = String((e as { from?: string }).from ?? '');
    const to = String((e as { to?: string }).to ?? '');
    return {
      id: (e as { id?: string }).id ?? `e-${from}-${to}-${i}`,
      source: from,
      target: to,
      animated: true,
    };
  });

  return { nodes, edges };
}

export function flowToSchema(
  nodes: Node<SfCanvasData>[],
  edges: Edge[],
  base: SmartflowSchemaBody
): SmartflowSchemaBody {
  const sfNodes = nodes.map((n) => {
    const data = n.data;
    const sn = { ...(data?.sfNode ?? {}) } as Record<string, unknown>;
    sn.id = n.id;
    sn.position = { x: n.position.x, y: n.position.y };
    return sn;
  });

  const sfEdges = edges.map((e) => ({
    from: e.source,
    to: e.target,
    id: e.id,
  }));

  return {
    ...base,
    nodes: sfNodes as SmartflowSchemaBody['nodes'],
    edges: sfEdges as SmartflowSchemaBody['edges'],
  };
}

export function parseSchemaJson(json: string): SmartflowSchemaBody | null {
  try {
    const s = JSON.parse(json) as SmartflowSchemaBody;
    if (!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges)) return null;
    return s;
  } catch {
    return null;
  }
}

export { RF_NODE_TYPE };
