/**
 * 【开发期专用，禁止运行时调用】
 * 从 monorepo mxmcgi 业务 / Smartflow bundle 提取 formSchema，写入 src/fixtures/manifests/。
 * 独立部署的 H5 不得依赖本脚本；线上以 GET /api/v1/open/:slug 为准。
 *
 * 运行：pnpm run sync:manifests
 * 规范：docs/DATA_ACCESS.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MXMCGI = path.resolve(ROOT, '..', 'mxmcgi', 'src');
const OUT = path.join(ROOT, 'src', 'fixtures', 'manifests');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeManifest(slug, manifest) {
  const file = path.join(OUT, `${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('wrote', file);
}

function manifestFromBusiness(slug, kind, item) {
  const tt = item.extra?.taskTemplate ?? {};
  const display = item.extra?.display ?? {};
  return {
    slug,
    title: display.taskLabel ?? slug,
    description: display.subtypeLabel ?? null,
    kind,
    schemaVersion: 1,
    platformRef: {
      scope: item.scope,
      type: item.type,
      subtype: item.subtype,
      routeHint: display.routeHint,
    },
    inputSchema: tt.formSchema ?? { type: 'object', properties: {} },
    inputDoc: {},
  };
}

function manifestFromSmartflow(slug, item) {
  const start = item.schema?.nodes?.find((n) => n.type === 'start');
  const formSchema =
    start?.formSchema ??
    (start?.input
      ? {
          type: 'object',
          properties: Object.fromEntries(
            (start.input || []).map((f) => ({
              [f.name]: {
                type: f.type === 'number' ? 'number' : f.type === 'referenceImages' ? 'array' : 'string',
                title: f.name,
                'x-ui-type': f.type,
                default: f.content,
              },
            }))
          ),
        }
      : { type: 'object', properties: {} });

  return {
    slug,
    title: item.name ?? slug,
    description: item.description ?? null,
    kind: 'smartflow',
    schemaVersion: 1,
    platformRef: { smartflowId: item.id },
    inputSchema: formSchema,
    inputDoc: {},
  };
}

// --- graph eshop lines ---
const linesBundle = readJson(path.join(MXMCGI, 'tasks/examples/graph-eshop-lines.business.json'));
for (const item of linesBundle.items) {
  const subtype = item.subtype;
  const slug = `graph-eshop-${subtype}`;
  writeManifest(slug, manifestFromBusiness(slug, 'task_v2', item));
}

// --- HD tool ---
const hdBundle = readJson(path.join(MXMCGI, 'tasks/examples/graph-tools-hd.business.json'));
for (const item of hdBundle.items) {
  writeManifest('graph-tools-hd', manifestFromBusiness('graph-tools-hd', 'task_v2', item));
}

// --- video eshop i2v ---
const videoBundle = readJson(
  path.join(MXMCGI, 'tasks/examples/video-commercial-eshop-model-show.business.json')
);
const i2v = videoBundle.items.find((i) => i.subtype === 'eshop-i2v');
if (i2v) {
  writeManifest('video-eshop-i2v', manifestFromBusiness('video-eshop-i2v', 'task_v2', i2v));
}

// --- smartflows ---
const batchSf = readJson(path.join(MXMCGI, 'smartflow/examples/eshop-clothes-batch-v1.smartflow.json'));
const batchItem = batchSf.items.find((i) => i.id === 'eshop-clothes-batch-v1');
if (batchItem) {
  writeManifest('smartflow-eshop-batch', manifestFromSmartflow('smartflow-eshop-batch', batchItem));
}

const videoSf = readJson(path.join(MXMCGI, 'smartflow/examples/eshop-model-video-v1.smartflow.json'));
const videoItem = videoSf.items.find((i) => i.id === 'eshop-model-video-v1');
if (videoItem) {
  writeManifest('smartflow-eshop-graph-video', manifestFromSmartflow('smartflow-eshop-graph-video', videoItem));
}

console.log('done');
