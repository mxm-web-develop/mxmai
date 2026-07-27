/**
 * 从 v1 bundle 生成 eshop-clothes-batch-v2（start.input[] 使用业务传参类型，非 json 滥用）
 */
import * as fs from 'fs';
import * as path from 'path';
import { ESHOP_CLOTHES_BATCH_TYPED_START_INPUT } from '../smartflow/core/eshop-batch-start-input';

const MXMCGI_ROOT = process.cwd();
const V1 = path.join(MXMCGI_ROOT, 'src/smartflow/examples/eshop-clothes-batch-v1.smartflow.json');
const V2 = path.join(MXMCGI_ROOT, 'src/smartflow/examples/eshop-clothes-batch-v2.smartflow.json');

const raw = JSON.parse(fs.readFileSync(V1, 'utf8')) as {
  schemaVersion: number;
  kind: string;
  exportedAt: string;
  items: Array<Record<string, unknown>>;
};

const item = raw.items[0];
item.id = 'eshop-clothes-batch-v2';
item.name = '电商服装批量上架';
item.version = '2.0.0';
item.description =
  '1 组模特参考 + N 款服装 → LLM 按款规划 → 并行 graph/eshop/clothes（v2：start.input[] 与业务 formSchema 类型对齐）';

const schema = item.schema as { nodes: Array<Record<string, unknown>> };
const start = schema.nodes.find((n) => n.id === 'start');
if (!start) throw new Error('start node missing');

start.input = ESHOP_CLOTHES_BATCH_TYPED_START_INPUT;

const out = {
  ...raw,
  exportedAt: new Date().toISOString(),
  items: [item],
};

fs.writeFileSync(V2, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${V2}`);
