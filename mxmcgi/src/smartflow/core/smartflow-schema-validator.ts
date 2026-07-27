/**
 * Smartflow schema 校验（CRUD / bundle 导入共用）
 */

import type { NodeType } from './models/types';

const ALLOWED_NODE_TYPES = new Set<NodeType>([
  'start',
  'end',
  'model',
  'business',
  'tools',
  'condition',
  'variable',
  'loop',
  'plan_execute',
  'reflection',
  'react',
  'research',
]);

export type SmartflowSchemaValidation = { ok: true } | { ok: false; message: string };

export type SmartflowSchemaValidationOptions = {
  /** business 节点必须配置 business_scope + taskKey + subtype */
  requireBusinessSubtype?: boolean;
  /** 禁止裸 model 节点（产品规范：LLM 应走 text 业务或 Agent） */
  forbidModelNodes?: boolean;
};

export function validateSmartflowSchema(
  schema: unknown,
  opts: SmartflowSchemaValidationOptions = {}
): SmartflowSchemaValidation {
  if (!schema || typeof schema !== 'object') return { ok: false, message: 'schema 必须是对象' };
  const s = schema as { nodes?: unknown; edges?: unknown };
  const nodes = s.nodes;
  const edges = s.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { ok: false, message: 'schema 必须包含 nodes / edges 数组' };
  }

  const ids = new Set<string>();
  let hasStart = false;
  let hasEnd = false;

  for (const n of nodes) {
    if (!n || typeof n !== 'object') return { ok: false, message: 'nodes 中存在非对象节点' };
    const node = n as Record<string, unknown>;
    if (typeof node.id !== 'string' || !node.id.trim()) {
      return { ok: false, message: '节点 id 必须是非空字符串' };
    }
    if (ids.has(node.id)) return { ok: false, message: `节点 id 重复: ${node.id}` };
    ids.add(node.id);

    const t = String(node.type ?? '');
    if (!ALLOWED_NODE_TYPES.has(t as NodeType)) {
      return {
        ok: false,
        message: `不支持的节点类型: ${t}（允许: ${Array.from(ALLOWED_NODE_TYPES).join(', ')}）`,
      };
    }
    if (t === 'start') hasStart = true;
    if (t === 'end') hasEnd = true;

    if (opts.forbidModelNodes && t === 'model') {
      return {
        ok: false,
        message: `节点 ${node.id} 为裸 model 节点；请改用 business 节点（text 细分业务）或 Agent 模式`,
      };
    }

    if (t === 'business' && opts.requireBusinessSubtype !== false) {
      const scope = String(node.business_scope ?? '').trim();
      const taskKey = String(node.taskKey ?? '').trim();
      const subtype = node.subtype != null ? String(node.subtype).trim() : '';
      if (!scope) return { ok: false, message: `business 节点 ${node.id} 缺少 business_scope` };
      if (!taskKey) return { ok: false, message: `business 节点 ${node.id} 缺少 taskKey` };
      if (!subtype) {
        return { ok: false, message: `business 节点 ${node.id} 缺少 subtype（须精确到细分业务）` };
      }
    }
  }

  if (!hasStart) return { ok: false, message: 'schema 必须包含 start 节点' };
  if (!hasEnd) return { ok: false, message: 'schema 必须包含 end 节点' };

  for (const e of edges) {
    if (!e || typeof e !== 'object') return { ok: false, message: 'edges 中存在非对象边' };
    const edge = e as Record<string, unknown>;
    const from = String(edge.from ?? '');
    const to = String(edge.to ?? '');
    if (!from || !to) return { ok: false, message: 'edge 必须包含 from/to' };
    if (!ids.has(from)) return { ok: false, message: `edge.from 不存在: ${from}` };
    if (!ids.has(to)) return { ok: false, message: `edge.to 不存在: ${to}` };
  }

  return { ok: true };
}

/** 收集 business 节点引用，供 bundle 文档 / 依赖检查 */
export function collectBusinessRefs(schema: unknown): Array<{ nodeId: string; scope: string; taskKey: string; subtype: string }> {
  if (!schema || typeof schema !== 'object') return [];
  const nodes = (schema as { nodes?: unknown[] }).nodes;
  if (!Array.isArray(nodes)) return [];
  const refs: Array<{ nodeId: string; scope: string; taskKey: string; subtype: string }> = [];
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    if (String(node.type) !== 'business') continue;
    refs.push({
      nodeId: String(node.id),
      scope: String(node.business_scope ?? ''),
      taskKey: String(node.taskKey ?? ''),
      subtype: String(node.subtype ?? ''),
    });
  }
  return refs;
}
