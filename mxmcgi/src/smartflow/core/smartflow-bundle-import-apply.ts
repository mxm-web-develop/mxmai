/**
 * mxm-smartflow-bundle 导入 / 导出逻辑（HTTP 与 CLI 共用）
 */

import type { Smartflow } from './models/types';
import type {
  SmartflowBundle,
  SmartflowBundleImportPolicy,
  SmartflowBundleImportResult,
  SmartflowBundleItem,
} from './smartflow-bundle-types';
import { collectBusinessRefs, validateSmartflowSchema } from './smartflow-schema-validator';
import type { ISmartflowRepository } from './engine/repository';

export function isSmartflowBundle(raw: unknown): raw is SmartflowBundle {
  if (!raw || typeof raw !== 'object') return false;
  const b = raw as Record<string, unknown>;
  return b.kind === 'mxm-smartflow-bundle' && b.schemaVersion === 1 && Array.isArray(b.items);
}

export function smartflowToBundleItem(sf: Smartflow): SmartflowBundleItem {
  return {
    id: sf.id,
    name: sf.name,
    description: sf.description,
    category: sf.category,
    icon: sf.icon,
    tags: sf.tags,
    status: sf.status,
    version: sf.version,
    is_public: sf.is_public,
    schema: sf.schema,
  };
}

export function buildSmartflowBundle(items: SmartflowBundleItem[]): SmartflowBundle {
  return {
    schemaVersion: 1,
    kind: 'mxm-smartflow-bundle',
    exportedAt: new Date().toISOString(),
    items,
  };
}

function validateBundleItem(item: SmartflowBundleItem, index: number): string[] {
  const errors: string[] = [];
  const prefix = `items[${index}]`;
  if (!item.id?.trim()) errors.push(`${prefix}.id 必填`);
  if (!item.name?.trim()) errors.push(`${prefix}.name 必填`);
  if (!item.schema) {
    errors.push(`${prefix}.schema 必填`);
    return errors;
  }
  const schemaCheck = validateSmartflowSchema(item.schema, {
    requireBusinessSubtype: true,
    forbidModelNodes: true,
  });
  if (!schemaCheck.ok) errors.push(`${prefix}: ${schemaCheck.message}`);
  return errors;
}

export async function applyMxmSmartflowBundleImport(args: {
  bundle: SmartflowBundle;
  conflictPolicy: SmartflowBundleImportPolicy;
  repository: ISmartflowRepository;
  authorId?: string | null;
}): Promise<SmartflowBundleImportResult> {
  const { bundle, conflictPolicy, repository, authorId } = args;
  const result: SmartflowBundleImportResult = {
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };

  if (!isSmartflowBundle(bundle)) {
    throw new Error('无效的 bundle：需要 kind=mxm-smartflow-bundle、schemaVersion=1 且 items 为数组');
  }

  const seenIds = new Set<string>();
  for (let i = 0; i < bundle.items.length; i++) {
    const item = bundle.items[i];
    const errors = validateBundleItem(item, i);
    if (errors.length) throw new Error(errors.join('; '));
    if (seenIds.has(item.id)) throw new Error(`bundle 内 id 重复: ${item.id}`);
    seenIds.add(item.id);

    const refs = collectBusinessRefs(item.schema);
    for (const ref of refs) {
      if (!ref.scope || !ref.taskKey || !ref.subtype) {
        result.warnings.push(
          `节点 ${ref.nodeId} 业务引用不完整: ${ref.scope}/${ref.taskKey}/${ref.subtype || '(无 subtype)'}`
        );
      }
    }
  }

  if (conflictPolicy === 'dry-run') {
    for (const item of bundle.items) {
      const existing = await repository.findById(item.id);
      if (existing) result.updated.push(item.id);
      else result.created.push(item.id);
    }
    return result;
  }

  for (const item of bundle.items) {
    const existing = await repository.findById(item.id);
    if (existing) {
      if (conflictPolicy === 'skip') {
        result.skipped.push(item.id);
        continue;
      }
      await repository.update(item.id, {
        name: item.name,
        description: item.description,
        category: item.category,
        icon: item.icon,
        tags: item.tags,
        status: item.status,
        version: item.version,
        schema: item.schema,
      });
      result.updated.push(item.id);
    } else {
      await repository.create({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        icon: item.icon,
        tags: item.tags,
        status: item.status ?? 'draft',
        version: item.version ?? '1.0.0',
        is_public: item.is_public ?? false,
        author_id: authorId ?? undefined,
        schema: item.schema,
      });
      result.created.push(item.id);
    }
  }

  return result;
}
