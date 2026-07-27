/**
 * 测试用：从 bundle JSON 读取 assemble 表达式（运行时配置以 DB 为准）
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SmartflowBundle } from '../core/smartflow-bundle-types';

const BUNDLE_PATH = path.join(
  __dirname,
  process.env.ESHOP_BATCH_BUNDLE === 'v1'
    ? 'eshop-clothes-batch-v1.smartflow.json'
    : 'eshop-clothes-batch-v2.smartflow.json'
);

function loadBundle(): SmartflowBundle {
  const raw = fs.readFileSync(BUNDLE_PATH, 'utf8');
  return JSON.parse(raw) as SmartflowBundle;
}

export function getEshopBatchAssembleExpression(): string {
  const item = loadBundle().items[0];
  const node = item.schema.nodes.find((n) => n.id === 'assemble_tasks');
  if (!node || node.type !== 'variable' || !node.expression) {
    throw new Error('assemble_tasks expression not found in eshop-clothes-batch bundle');
  }
  return node.expression;
}

/** @deprecated 测试引用；生产环境从 DB 加载 Smartflow */
export const ESHOP_BATCH_ASSEMBLE_EXPRESSION = getEshopBatchAssembleExpression();
