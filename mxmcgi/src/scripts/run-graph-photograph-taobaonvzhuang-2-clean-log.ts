import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { providerFactory } from '../core/providers';
import { loadTaskDefinition } from '../tasks/task-definition';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

type CapturedLog = { level: 'log' | 'warn' | 'error'; text: string };

function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; logs: CapturedLog[] }> {
  const logs: CapturedLog[] = [];
  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  const push = (level: CapturedLog['level'], args: unknown[]) => {
    try {
      const parts = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));
      logs.push({ level, text: parts.join(' ') });
    } catch {
      logs.push({ level, text: String(args[0] ?? '') });
    }
  };
  console.log = (...args: unknown[]) => push('log', args);
  console.warn = (...args: unknown[]) => push('warn', args);
  console.error = (...args: unknown[]) => push('error', args);

  return fn()
    .then((result) => ({ result, logs }))
    .finally(() => {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
    });
}

function pickDeerEditDebug(logs: CapturedLog[]): { header?: string; json?: string } {
  for (let i = 0; i < logs.length; i++) {
    const t = logs[i]?.text || '';
    if (t.includes('请求参数调试(openai/images/edits)')) {
      const next = logs[i + 1]?.text || '';
      if (next.trim().startsWith('{') && next.trim().endsWith('}')) {
        return { header: t, json: next };
      }
      return { header: t };
    }
  }
  return {};
}

function filterAuditLogs(logs: CapturedLog[]): string {
  return logs
    .filter((l) => l.text.includes('[GraphService][AUDIT]'))
    .map((l) => l.text)
    .join('\n');
}

function tryDigDeerapi(): string {
  try {
    return execFileSync('dig', ['+short', 'api.deerapi.com', 'A'], { encoding: 'utf8', maxBuffer: 256 * 1024 }).trim();
  } catch (e) {
    return `(dig failed: ${e instanceof Error ? e.message : String(e)})`;
  }
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  // 必须在加载 graph-service 之前设置（ESM 静态 import 会提升，故 graph 用动态 import）
  process.env.GRAPH_AUDIT_STEPS = '1';

  loadEnvOnce();
  RepositoryFactory.init();
  await providerFactory.loadProviderCatalog();

  const { generateGraphImage, generateGraphPrompt } = await import('../core/graph/graph-service');

  // 强制开启 DeerAPI 请求元信息打印（但脚本会捕获并整理成“干净日志”）
  process.env.DEBUG_DEERAPI_REQUEST = process.env.DEBUG_DEERAPI_REQUEST || 'true';
  if (process.env.DEERAPI_OPENAI_IMAGE_EDIT_MAX_RETRIES === undefined) {
    process.env.DEERAPI_OPENAI_IMAGE_EDIT_MAX_RETRIES = '0';
  }

  const userId = process.argv[2] || 'a32b2843-6c58-4dc9-8ce3-335471ca196b';

  const modelUrls = [
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063067955-5e66194c.jpg',
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063058472-aef79ba4.jpg',
  ];
  const clothingUrls = [
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063078233-4672251d.png',
    'https://pub-63b3ac2159304aa2a96decc0ae78bde0.r2.dev/1778063100804-a12d6114.png',
  ];

  const params: Record<string, any> = {
    type: 'taobaonvzhuang-2',
    scenes: 'beach_pier',
    aspect_ratio: '3:4',
    clothing_material: 'use_reference_only',
    prompt: '',
    model_images: modelUrls.map((u) => ({ content: u, type: 'main-subject', purpose: 'model reference' })),
    clothing_images: clothingUrls.map((u) => ({ content: u, type: 'outfits', purpose: 'garment reference' })),
  };

  params.referenceImage = [
    ...params.model_images.map((x: any) => ({
      content: x.content,
      type: x.type,
      purpose: x.purpose,
      groupKey: 'model_images',
      groupTitle: '模特参考图',
      groupDesc: '至少一张：脸部、身形、发型或姿态参考；对应 main-subject。',
    })),
    ...params.clothing_images.map((x: any) => ({
      content: x.content,
      type: x.type,
      purpose: x.purpose,
      groupKey: 'clothing_images',
      groupTitle: '服饰参考图',
      groupDesc: '至少一张：服装平铺、细节、面料或款式；建议类型选 outfits。',
    })),
  ];

  const startedAt = new Date().toISOString();

  const peRepo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const graphRow = await peRepo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  const graphExtra = (graphRow?.extra ?? {}) as Record<string, unknown>;
  const rulesZh = String((graphRow?.rules_i18n as Record<string, string> | undefined)?.zh ?? '');

  let taskDefLines = '';
  try {
    const { template } = await loadTaskDefinition({
      scope: 'graph',
      taskKey: 'photograph',
      subtype: 'taobaonvzhuang-2',
      lang: 'zh',
    });
    const uni = (template.prompt?.unifiedTemplate ?? '').trim();
    taskDefLines = [`unifiedTemplate_chars: ${uni.length}`, '--- unifiedTemplate (full) ---', uni || '(empty)'].join('\n');
  } catch (e) {
    taskDefLines = `loadTaskDefinition failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  const { result: promptResult, logs: promptLogs } = await captureConsole(async () => {
    return await generateGraphPrompt('photograph', params as any, userId, undefined, undefined);
  });

  const { result: imageResult, logs: imageLogs } = await captureConsole(async () => {
    try {
      return await generateGraphImage('photograph', params as any, promptResult.prompt, undefined);
    } catch (e) {
      return { error: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } } as any;
    }
  });

  const deerEditDebug = pickDeerEditDebug([...promptLogs, ...imageLogs]);
  const auditBlock = filterAuditLogs([...promptLogs, ...imageLogs]);

  const outLines: string[] = [];
  outLines.push('=== taobaonvzhuang-2 clean fullflow log (GRAPH_AUDIT_STEPS=1) ===');
  outLines.push(`started_at: ${startedAt}`);
  outLines.push(`userId: ${userId}`);
  outLines.push('');

  outLines.push('--- [ENV] dig +short api.deerapi.com A ---');
  outLines.push(tryDigDeerapi());
  outLines.push('(若出现 198.18.x.x 多为 Clash fake-ip；multipart edits 易断流)');
  outLines.push('');

  outLines.push('--- [DB] prompt_engineering graph/photograph/taobaonvzhuang-2 ---');
  outLines.push(
    JSON.stringify(
      {
        row_found: !!graphRow,
        is_active: graphRow?.is_active,
        promptTextTaskKey: graphExtra.promptTextTaskKey,
        use_knowledge: graphExtra.use_knowledge,
        prompt_text_mode: graphExtra.prompt_text_mode,
        rules_zh_chars: rulesZh.length,
      },
      null,
      2
    )
  );
  outLines.push('--- [DB] rules 列正文（遗留字段，通常为空；full）---');
  outLines.push(rulesZh || '(empty)');
  outLines.push('');

  outLines.push('--- [TASK_DEF] graph/photograph/taobaonvzhuang-2 (extra.taskTemplate.prompt; runTaskV2 graph 用) ---');
  outLines.push(
    '说明：V2 主契约来自 unifiedTemplate 插值 +（可选）text/format；上节 rules 列仅历史兼容，非空时才会参与旧式拼装。'
  );
  outLines.push(taskDefLines);
  outLines.push('');

  outLines.push('--- [INPUT] graph params (subset) ---');
  outLines.push(
    JSON.stringify(
      {
        type: params.type,
        scenes: params.scenes,
        aspect_ratio: params.aspect_ratio,
        clothing_material: params.clothing_material,
        prompt: params.prompt,
        model_images_count: Array.isArray(params.model_images) ? params.model_images.length : 0,
        clothing_images_count: Array.isArray(params.clothing_images) ? params.clothing_images.length : 0,
        model_images: (params.model_images || []).map((x: any) => ({ type: x.type, content: x.content, purpose: x.purpose })),
        clothing_images: (params.clothing_images || []).map((x: any) => ({ type: x.type, content: x.content, purpose: x.purpose })),
      },
      null,
      2
    )
  );
  outLines.push('');

  outLines.push('--- [AUDIT] GraphService 逐步参数（GRAPH_AUDIT_STEPS）---');
  outLines.push(auditBlock || '(no [GraphService][AUDIT] lines captured)');
  outLines.push('');

  outLines.push('--- [OUTPUT] text/format 清洗后（promptTextFormatOnly，即最终生图 prompt 正文）---');
  outLines.push(promptResult.promptTextFormatOnly || '');
  outLines.push('');

  outLines.push('--- [OUTPUT] final prompt 与上节一致（V2 不再拼 referenceImagePrompt 前缀）---');
  outLines.push(promptResult.prompt || '');
  outLines.push('');

  outLines.push('--- [REQUEST] /v1/images/edits meta (from DEBUG_DEERAPI_REQUEST) ---');
  if (deerEditDebug.header) outLines.push(deerEditDebug.header);
  if (deerEditDebug.json) outLines.push(deerEditDebug.json);
  if (!deerEditDebug.header) outLines.push('(not found in captured logs)');
  outLines.push('');

  outLines.push('--- [OUTPUT] image result ---');
  outLines.push(JSON.stringify(imageResult, null, 2));
  outLines.push('');

  const errLines = imageLogs.filter((l) => l.level === 'error').map((l) => l.text);
  if (errLines.length > 0) {
    outLines.push('--- [ERROR] captured errors (last 10) ---');
    outLines.push(errLines.slice(-10).join('\n'));
  }

  const runlogsDir = path.resolve(process.cwd(), 'runlogs');
  fs.mkdirSync(runlogsDir, { recursive: true });
  const outPath = path.join(runlogsDir, `${nowStamp()}_taobaonvzhuang-2_clean.txt`);
  fs.writeFileSync(outPath, outLines.join('\n'), 'utf8');

  process.stdout.write(`${outPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
