/**
 * Smartflow 节点目录（左栏与右键快速添加共用）
 */

import type { TFunction } from 'i18next';
import type { BusinessScope, CompositeKind, ToolKind } from './schemaFlow';

export type NodeCatalogGroup = 'flow' | 'agent' | 'business' | 'tools';

export type CatalogContext = {
  addNode: (kind: 'start' | 'end' | 'condition' | 'variable' | 'loop') => void;
  addBusiness: (scope: BusinessScope) => void;
  addTool: (kind: ToolKind) => void;
  addComposite: (kind: CompositeKind) => void;
};

export type NodeCatalogItem = {
  id: string;
  group: NodeCatalogGroup;
  label: string;
  description: string;
  run: (ctx: CatalogContext) => void;
};

export function buildNodeCatalogGroups(t: TFunction): { key: NodeCatalogGroup; title: string }[] {
  return [
    { key: 'flow', title: t('smartflow.designer.flow') },
    { key: 'agent', title: t('smartflow.designer.agentMode') },
    { key: 'business', title: t('smartflow.designer.business') },
    { key: 'tools', title: t('smartflow.designer.tools') },
  ];
}

export function buildNodeCatalog(
  businessScopes: ReadonlyArray<{ value: BusinessScope; label: string }>,
  t: TFunction
): NodeCatalogItem[] {
  const flowItems: NodeCatalogItem[] = [
    {
      id: 'start',
      group: 'flow',
      label: t('smartflow.designer.start'),
      description: t('smartflow.designer.catalog.startDesc'),
      run: (c) => c.addNode('start'),
    },
    {
      id: 'end',
      group: 'flow',
      label: t('smartflow.designer.end'),
      description: t('smartflow.designer.catalog.endDesc'),
      run: (c) => c.addNode('end'),
    },
    {
      id: 'condition',
      group: 'flow',
      label: t('smartflow.designer.condition'),
      description: t('smartflow.designer.catalog.conditionDesc'),
      run: (c) => c.addNode('condition'),
    },
    {
      id: 'variable',
      group: 'flow',
      label: t('smartflow.designer.variable'),
      description: t('smartflow.designer.catalog.variableDesc'),
      run: (c) => c.addNode('variable'),
    },
    {
      id: 'loop',
      group: 'flow',
      label: t('smartflow.designer.loop'),
      description: t('smartflow.designer.catalog.loopDesc'),
      run: (c) => c.addNode('loop'),
    },
  ];

  const agentItems: NodeCatalogItem[] = [
    {
      id: 'plan_execute',
      group: 'agent',
      label: t('smartflow.designer.planExecute'),
      description: t('smartflow.designer.catalog.planExecuteDesc'),
      run: (c) => c.addComposite('plan_execute'),
    },
    {
      id: 'reflection',
      group: 'agent',
      label: t('smartflow.designer.reflection'),
      description: t('smartflow.designer.catalog.reflectionDesc'),
      run: (c) => c.addComposite('reflection'),
    },
    {
      id: 'react',
      group: 'agent',
      label: 'ReAct',
      description: t('smartflow.designer.catalog.reactDesc'),
      run: (c) => c.addComposite('react'),
    },
    {
      id: 'research',
      group: 'agent',
      label: t('smartflow.designer.research'),
      description: t('smartflow.designer.catalog.researchDesc'),
      run: (c) => c.addComposite('research'),
    },
  ];

  const toolItems: NodeCatalogItem[] = [
    {
      id: 'deep_search',
      group: 'tools',
      label: t('smartflow.designer.deepSearch'),
      description: t('smartflow.designer.catalog.deepSearchDesc'),
      run: (c) => c.addTool('deep_search'),
    },
    {
      id: 'domain_search',
      group: 'tools',
      label: t('smartflow.designer.domainSearch'),
      description: t('smartflow.designer.catalog.domainSearchDesc'),
      run: (c) => c.addTool('domain_search'),
    },
    {
      id: 'stock_lookup',
      group: 'tools',
      label: t('smartflow.designer.stockLookup'),
      description: t('smartflow.designer.catalog.stockLookupDesc'),
      run: (c) => c.addTool('stock_lookup'),
    },
    {
      id: 'crypto_lookup',
      group: 'tools',
      label: t('smartflow.designer.cryptoLookup'),
      description: t('smartflow.designer.catalog.cryptoLookupDesc'),
      run: (c) => c.addTool('crypto_lookup'),
    },
    {
      id: 'web_scraper',
      group: 'tools',
      label: t('smartflow.designer.scraper'),
      description: t('smartflow.designer.catalog.webScraperDesc'),
      run: (c) => c.addTool('web_scraper'),
    },
    {
      id: 'code_js',
      group: 'tools',
      label: t('smartflow.designer.nodeJs'),
      description: t('smartflow.designer.catalog.codeJsDesc'),
      run: (c) => c.addTool('code_js'),
    },
    {
      id: 'code_py',
      group: 'tools',
      label: t('smartflow.designer.python'),
      description: t('smartflow.designer.catalog.codePyDesc'),
      run: (c) => c.addTool('code_py'),
    },
    {
      id: 'vector_store',
      group: 'tools',
      label: t('smartflow.designer.vectorStore'),
      description: t('smartflow.designer.catalog.vectorStoreDesc'),
      run: (c) => c.addTool('vector_store'),
    },
    {
      id: 'vector_recall',
      group: 'tools',
      label: t('smartflow.designer.vectorRecall'),
      description: t('smartflow.designer.catalog.vectorRecallDesc'),
      run: (c) => c.addTool('vector_recall'),
    },
  ];

  const businessItems: NodeCatalogItem[] = businessScopes.map((s) => ({
    id: `biz_${s.value}`,
    group: 'business' as const,
    label: s.label.replace(/\s*\([^)]*\)\s*/, ''),
    description: `Task V2 · scope=${s.value}`,
    run: (c) => c.addBusiness(s.value),
  }));

  return [...flowItems, ...agentItems, ...businessItems, ...toolItems];
}

/** 画布上已有 start/end 时，对应目录项应禁用（系统不允许多个开始或结束） */
export function getDisabledFlowCatalogIds(hasStart: boolean, hasEnd: boolean): string[] {
  const ids: string[] = [];
  if (hasStart) ids.push('start');
  if (hasEnd) ids.push('end');
  return ids;
}

export function catalogByGroup(items: NodeCatalogItem[]): Record<NodeCatalogGroup, NodeCatalogItem[]> {
  const map: Record<NodeCatalogGroup, NodeCatalogItem[]> = {
    flow: [],
    agent: [],
    business: [],
    tools: [],
  };
  for (const item of items) {
    map[item.group].push(item);
  }
  return map;
}
