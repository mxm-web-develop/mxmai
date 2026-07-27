import type { Edge, Node } from '@xyflow/react';
import type { SmartflowSchemaBody } from '../../api/client';
import i18n from '../../i18n/config';

/** 画布节点 data */
export type SfCanvasUi = {
  loopBodyHighlight?: boolean;
  loopBodyMember?: boolean;
  loopBodyOwners?: { loopId: string; loopName: string }[];
  loopBodyConflict?: boolean;
};

export type SfCanvasData = {
  sfNode: Record<string, unknown>;
  ui?: SfCanvasUi;
};

const RF_NODE_TYPE = 'sfBlock';

/** 循环体虚拟边 ID 前缀（不写入 schema.edges） */
export const LOOP_BODY_EDGE_PREFIX = 'loop-body:';

/** Loop 节点右侧循环体出口（虚线，配置 loop_nodes） */
export const LOOP_BODY_SOURCE_HANDLE = 'loop-body';

/** Loop 节点底部主流程出口（实线，连 end 等） */
export const LOOP_MAIN_SOURCE_HANDLE = 'main';

export function isLoopBodyEdgeId(id?: string | null): boolean {
  return typeof id === 'string' && id.startsWith(LOOP_BODY_EDGE_PREFIX);
}

/** 解析 loop-body:loopId->bodyId */
export function parseLoopBodyEdgeId(id: string): { loopId: string; bodyId: string } | null {
  if (!isLoopBodyEdgeId(id)) return null;
  const rest = id.slice(LOOP_BODY_EDGE_PREFIX.length);
  const arrow = rest.indexOf('->');
  if (arrow <= 0) return null;
  return { loopId: rest.slice(0, arrow), bodyId: rest.slice(arrow + 2) };
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 业务节点 scope（映射为 business_scope，调用 mxmcgi /api/v2/tasks 动态业务） */
export const BUSINESS_SCOPE_VALUES = [
  'writing',
  'text',
  'graph',
  'audio',
  'video',
] as const;

export type BusinessScope = (typeof BUSINESS_SCOPE_VALUES)[number];

export function getBusinessScopes(): Array<{ value: BusinessScope; label: string }> {
  return BUSINESS_SCOPE_VALUES.map((value) => ({
    value,
    label: i18n.t(`smartflow.designer.scopes.${value}`),
  }));
}

/** @deprecated Prefer getBusinessScopes() for localized labels */
export const BUSINESS_SCOPES = getBusinessScopes();

// 前端创建入口的工具节点：与产品定义对齐（高级工具可在属性面板手动切换）
export type ToolKind =
  | 'deep_search'
  | 'web_scraper'
  | 'code_js'
  | 'code_py'
  | 'vector_store'
  | 'vector_recall'
  | 'domain_search'
  | 'stock_lookup'
  | 'crypto_lookup';

export type CompositeKind = 'plan_execute' | 'reflection' | 'react' | 'research';

export function createCompositeNode(kind: CompositeKind): Record<string, unknown> {
  const id = newId(kind.slice(0, 4));
  switch (kind) {
    case 'plan_execute':
      return {
        id,
        type: 'plan_execute',
        name: i18n.t('smartflow.designer.defaultNames.planExecute'),
        goal: '{{input.goal}}',
        context: '',
        max_steps: 6,
        max_replans: 2,
        replan_on_failure: true,
        planner: { kind: 'text', taskKey: 'plan', subtype: 'task-breakdown' },
        executor: { kind: 'model', model: 'gpt-4o-mini' },
      };
    case 'reflection':
      return {
        id,
        type: 'reflection',
        name: i18n.t('smartflow.designer.defaultNames.reflection'),
        task: '{{input.task}}',
        artifact: '{{input.artifact}}',
        max_rounds: 3,
        pass_pattern: 'PASS',
        critic: { kind: 'text', taskKey: 'think', subtype: 'critique' },
        reviser: { kind: 'model', model: 'gpt-4o-mini' },
      };
    case 'react':
      return {
        id,
        type: 'react',
        name: 'ReAct',
        goal: '{{input.goal}}',
        model: 'gpt-4o-mini',
        tools: ['deep_search', 'web_search'],
        max_steps: 10,
      };
    case 'research':
      return {
        id,
        type: 'research',
        name: i18n.t('smartflow.designer.defaultNames.research'),
        topic: '{{input.topic}}',
        search_depth: 'standard',
        summarizer_model: 'gpt-4o-mini',
        query_generator: { kind: 'text', taskKey: 'think', subtype: 'analysis' },
      };
    default:
      return { id, type: kind, name: kind };
  }
}

export function createDefaultNode(
  kind: 'start' | 'end' | 'business' | 'tools' | 'condition' | 'variable' | 'loop'
): Record<string, unknown> {
  switch (kind) {
    case 'start':
      return {
        id: 'start',
        type: 'start',
        name: i18n.t('smartflow.designer.defaultNames.start'),
        input: [{ name: 'topic', type: 'text', content: '' }],
        expected_outputs: [{ type: 'text', name: 'reply', required: true }],
        smartflow_name: '',
      };
    case 'end':
      return {
        id: 'end',
        type: 'end',
        name: i18n.t('smartflow.designer.defaultNames.end'),
        output_mapping: { reply: '{{llm.output.text}}' },
        validate_outputs: false,
      };
    case 'business':
      return {
        id: newId('biz'),
        type: 'business',
        name: i18n.t('smartflow.designer.defaultNames.business'),
        business_scope: 'writing',
        taskKey: '',
        subtype: null,
        params: {},
      };
    case 'tools':
      return {
        id: newId('tool'),
        type: 'tools',
        name: i18n.t('smartflow.designer.defaultNames.tool'),
        tool_type: 'web_search' as const,
        tool_params: {},
      };
    case 'condition':
      return {
        id: newId('cond'),
        type: 'condition',
        name: i18n.t('smartflow.designer.defaultNames.condition'),
        if: 'true',
        then: '',
        else_if: [] as { condition: string; then: string }[],
        else: '',
      };
    case 'variable':
      return {
        id: newId('var'),
        type: 'variable',
        name: i18n.t('smartflow.designer.defaultNames.variable'),
        operation: 'select' as const,
        source_path: '{{nodeId.output.field}}',
        output_name: 'value',
        default_value: '',
      };
    case 'loop':
      return {
        id: newId('loop'),
        type: 'loop',
        name: i18n.t('smartflow.designer.defaultNames.loop'),
        iterable: '{{items}}',
        item_variable: 'item',
        max_iterations: 10,
        loop_nodes: [] as string[],
        parallel_iterations: false,
        max_concurrency: 3,
        on_iteration_error: 'collect_errors',
        collect_output: true,
        output_variable: 'results',
      };
    default:
      return { id: newId('node'), type: kind, name: i18n.t('smartflow.designer.defaultNames.node') };
  }
}

/** 业务节点：底层为 business，带 business_scope + taskKey + subtype + params（v2 动态业务） */
export function createBusinessNode(scope: BusinessScope = 'writing'): Record<string, unknown> {
  const id = newId('biz');
  return {
    id,
    type: 'business',
    name: i18n.t('smartflow.designer.defaultNames.businessPrefix', {
      label: getBusinessScopes().find((s) => s.value === scope)?.label ?? scope,
    }),
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
      name:
        toolKind === 'code_js'
          ? i18n.t('smartflow.designer.defaultNames.toolNodeJs')
          : i18n.t('smartflow.designer.defaultNames.toolPython'),
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
      toolKind === 'deep_search'
        ? i18n.t('smartflow.designer.defaultNames.toolDeepSearch')
        : toolKind === 'web_scraper'
          ? i18n.t('smartflow.designer.defaultNames.toolScraper')
          : toolKind === 'vector_store'
            ? i18n.t('smartflow.designer.defaultNames.toolVectorStore')
            : toolKind === 'vector_recall'
              ? i18n.t('smartflow.designer.defaultNames.toolVectorRecall')
              : toolKind === 'domain_search'
                ? i18n.t('smartflow.designer.defaultNames.toolDomainSearch')
                : toolKind === 'stock_lookup'
                  ? i18n.t('smartflow.designer.defaultNames.toolStock')
                  : toolKind === 'crypto_lookup'
                    ? i18n.t('smartflow.designer.defaultNames.toolCrypto')
                    : i18n.t('smartflow.designer.defaultNames.toolPrefix', { kind: toolKind }),
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

/** 从所有 loop 节点的 loop_nodes 生成展示用虚线边 */
export function buildLoopBodyEdges(nodes: Node<SfCanvasData>[]): Edge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];

  for (const n of nodes) {
    const sn = n.data?.sfNode ?? {};
    if (String(sn.type) !== 'loop') continue;
    const loopNodes = Array.isArray(sn.loop_nodes) ? (sn.loop_nodes as string[]) : [];
    const parallel = Boolean(sn.parallel_iterations);
    const bodyLabel = parallel
      ? i18n.t('smartflow.designer.concurrentExec')
      : i18n.t('smartflow.designer.sequentialExec');
    for (const bodyId of loopNodes) {
      if (!bodyId || !nodeIds.has(bodyId)) continue;
      edges.push({
        id: `${LOOP_BODY_EDGE_PREFIX}${n.id}->${bodyId}`,
        source: n.id,
        sourceHandle: LOOP_BODY_SOURCE_HANDLE,
        target: bodyId,
        type: 'loopBody',
        animated: false,
        selectable: false,
        focusable: false,
        deletable: false,
        zIndex: 0,
        data: { label: bodyLabel, kind: 'loop-body' },
      });
    }
  }
  return edges;
}

export type LoopBodyConflict = {
  bodyId: string;
  bodyName: string;
  loopIds: string[];
  loopNames: string[];
};

/** 检测多个 Loop 共用同一循环体节点 */
export function findLoopBodyConflicts(nodes: Node<SfCanvasData>[]): LoopBodyConflict[] {
  const bodyToLoops = new Map<string, { loopIds: string[]; loopNames: string[] }>();
  const nodeNameById = new Map(nodes.map((n) => [n.id, String(n.data?.sfNode?.name ?? n.id)]));

  for (const n of nodes) {
    const sn = n.data?.sfNode ?? {};
    if (String(sn.type) !== 'loop') continue;
    const loopName = String(sn.name ?? n.id);
    const loopNodes = Array.isArray(sn.loop_nodes) ? (sn.loop_nodes as string[]) : [];
    for (const bodyId of loopNodes) {
      if (!bodyId) continue;
      const entry = bodyToLoops.get(bodyId) ?? { loopIds: [], loopNames: [] };
      entry.loopIds.push(n.id);
      entry.loopNames.push(loopName);
      bodyToLoops.set(bodyId, entry);
    }
  }

  const conflicts: LoopBodyConflict[] = [];
  for (const [bodyId, { loopIds, loopNames }] of bodyToLoops) {
    if (loopIds.length <= 1) continue;
    conflicts.push({
      bodyId,
      bodyName: nodeNameById.get(bodyId) ?? bodyId,
      loopIds,
      loopNames,
    });
  }
  return conflicts;
}

/** 节点 id → 所属循环节点列表（用于循环体角标） */
export function collectLoopBodyMemberMap(
  nodes: Node<SfCanvasData>[]
): Map<string, { loopId: string; loopName: string }[]> {
  const map = new Map<string, { loopId: string; loopName: string }[]>();
  for (const n of nodes) {
    const sn = n.data?.sfNode ?? {};
    if (String(sn.type) !== 'loop') continue;
    const loopName = String(sn.name ?? n.id);
    const loopNodes = Array.isArray(sn.loop_nodes) ? (sn.loop_nodes as string[]) : [];
    for (const bodyId of loopNodes) {
      if (!bodyId) continue;
      const owners = map.get(bodyId) ?? [];
      owners.push({ loopId: n.id, loopName });
      map.set(bodyId, owners);
    }
  }
  return map;
}

export function applyCanvasUiState(
  nodes: Node<SfCanvasData>[],
  selectedId: string | null
): Node<SfCanvasData>[] {
  const highlightIds = new Set<string>();
  if (selectedId) {
    const sel = nodes.find((n) => n.id === selectedId);
    if (sel && String(sel.data?.sfNode?.type) === 'loop') {
      const loopNodes = Array.isArray(sel.data.sfNode.loop_nodes)
        ? (sel.data.sfNode.loop_nodes as string[])
        : [];
      for (const id of loopNodes) highlightIds.add(id);
    }
  }
  const memberMap = collectLoopBodyMemberMap(nodes);
  return nodes.map((n) => {
    const owners = memberMap.get(n.id);
    const conflict = (owners?.length ?? 0) > 1;
    return {
    ...n,
    data: {
      ...n.data,
      ui: {
        loopBodyHighlight: highlightIds.has(n.id),
        loopBodyMember: (owners?.length ?? 0) > 0,
        loopBodyOwners: owners,
        loopBodyConflict: conflict,
      },
    },
  };
  });
}

export function schemaToFlowNodesEdges(schema: SmartflowSchemaBody): { nodes: Node<SfCanvasData>[]; edges: Edge[] } {
  const rawNodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const rawEdges = (Array.isArray(schema.edges) ? schema.edges : []).filter(
    (e) => !isLoopBodyEdgeId(String((e as { id?: string }).id ?? ''))
  );

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

  const nodeTypeById = new Map(
    rawNodes.map((n, i) => {
      const sn = n as { id?: string; type?: string };
      return [String(sn.id ?? `n${i}`), String(sn.type ?? '')];
    })
  );

  const edges: Edge[] = rawEdges.map((e, i) => {
    const from = String((e as { from?: string }).from ?? '');
    const to = String((e as { to?: string }).to ?? '');
    const rawHandle = (e as { sourceHandle?: string }).sourceHandle;
    const sourceHandle =
      rawHandle ??
      (nodeTypeById.get(from) === 'loop' ? LOOP_MAIN_SOURCE_HANDLE : undefined);
    return {
      id: (e as { id?: string }).id ?? `e-${from}-${to}-${i}`,
      source: from,
      target: to,
      sourceHandle,
      animated: true,
      selectable: true,
      interactionWidth: 24,
      zIndex: 2,
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

  const sfEdges = edges
    .filter((e) => !isLoopBodyEdgeId(e.id))
    .map((e) => ({
      from: e.source,
      to: e.target,
      id: e.id,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
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
