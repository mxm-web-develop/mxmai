/**
 * 生成 graph-eshop-lines.business.json（6 条细分电商 Graph 业务线）
 *
 * 用法（mxmcgi 目录）：
 *   pnpm run build:eshop-lines-bundle
 *   pnpm run seed:graph-eshop-lines
 */

import * as fs from 'fs';
import { join } from 'path';
import { ESHOP_LINE_DEFINITIONS, buildBundleItem } from '../tasks/examples/eshop-lines/definitions';

const MXMCGI_ROOT = process.cwd();
const OUT = join(MXMCGI_ROOT, 'src/tasks/examples/graph-eshop-lines.business.json');

const bundle = {
  schemaVersion: 1,
  kind: 'mxm-business-bundle',
  exportedAt: new Date().toISOString(),
  items: ESHOP_LINE_DEFINITIONS.map(buildBundleItem),
};

fs.writeFileSync(OUT, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

console.log(`[build:eshop-lines-bundle] wrote ${OUT}`);
console.log(`  items (${bundle.items.length}):`);
for (const item of bundle.items) {
  console.log(`    - graph/eshop/${item.subtype} → ${item.routing.logical_model}`);
}
