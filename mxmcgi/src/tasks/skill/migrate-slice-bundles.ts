/**
 * 按 Core Skill 规范重写切片 bundle：
 * - SKILL.md：短入口 + frontmatter（loadReferences）
 * - references/rules.md：原巨石规范全文（可编）
 * - references/contract.md / scripts/invoke-*：平台锁定
 *
 * text 业务保留 ${field_specs}/${contract}/${input}/… 插值在 SKILL 正文底部。
 *
 *   pnpm exec tsx ./src/tasks/skill/migrate-slice-bundles.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCoreSkillSlice } from './slice';
import { ensureLockedSkillFiles, SKILL_MODE_CORE, upsertSkillFile } from './pack';
import { CONTRACT_REF_PATH, SKILL_MD_PATH, type SkillPack } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(__dirname, '../examples');

const FILES = [
  'writing-generator-industry-daily.business.json',
  'writing-group-deck.business.json',
  'audio-generator-voice-over-test.business.json',
  'audio-group-multi-voice.business.json',
];

const PLACEHOLDER_HINTS = ['skipOutputLlm', '勿依赖本模板', 'groupOutput 并发成稿'];

function isPlaceholderPrompt(s: string): boolean {
  const t = s.trim();
  if (t.length < 80) return true;
  return PLACEHOLDER_HINTS.some((h) => t.includes(h));
}

function extractSeed(item: Record<string, unknown>): string {
  const extra = (item.extra && typeof item.extra === 'object' ? item.extra : {}) as Record<
    string,
    unknown
  >;
  const taskTemplate = (extra.taskTemplate && typeof extra.taskTemplate === 'object'
    ? extra.taskTemplate
    : {}) as Record<string, unknown>;
  const prompt = (taskTemplate.prompt && typeof taskTemplate.prompt === 'object'
    ? taskTemplate.prompt
    : {}) as Record<string, unknown>;
  const tplExtra = (taskTemplate.extra && typeof taskTemplate.extra === 'object'
    ? taskTemplate.extra
    : {}) as Record<string, unknown>;

  let seed = typeof prompt.unifiedTemplate === 'string' ? prompt.unifiedTemplate : '';
  const go = tplExtra.groupOutput as
    | { itemManuscript?: { systemPrompt?: string } }
    | undefined;
  const ms = go?.itemManuscript?.systemPrompt?.trim() ?? '';
  if (ms && (isPlaceholderPrompt(seed) || ms.length > seed.length)) {
    seed = ms;
  }
  return seed.trim();
}

/** 从长文抽一句话角色作 SKILL 入口 */
function shortIntro(seed: string, scope: string, type: string, subtype: string): string {
  if (seed && !isPlaceholderPrompt(seed)) {
    const flat = seed.replace(/\s+/g, ' ').trim();
    const clipped = flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
    return clipped.replace(/^#+\s*/, '');
  }
  if (scope === 'text') {
    return `You are the \`${type}/${subtype}\` text skill. Follow references/rules.md. Fill only requested fields.`;
  }
  if (type === 'group') {
    return `You are the group manuscript writer for \`${scope}/${subtype}\`. Follow references/rules.md. Write publishable Markdown for this route only.`;
  }
  return `You produce the final deliverable for \`${scope}/${type}/${subtype}\`. Follow references/rules.md and the contract.`;
}

function textInterpolationFooter(seed: string): string {
  const keys = ['field_specs', 'contract', 'input', 'instruction', 'prompt'];
  const found = keys.filter((k) => seed.includes(`\${${k}}`));
  if (found.length === 0) {
    // expert/transform 常见约定
    if (seed.toLowerCase().includes('field_specs') || seed.includes('contract')) {
      return ['', 'field_specs:', '${field_specs}', '', 'contract:', '${contract}', ''].join('\n');
    }
    if (seed.includes('${input}') || seed.toLowerCase().includes('instruction')) {
      return ['', 'Instruction:', '${instruction}', '', 'Input:', '${input}', ''].join('\n');
    }
    return '';
  }
  return (
    '\n' +
    found
      .map((k) => {
        if (k === 'field_specs') return `field_specs:\n\${field_specs}`;
        if (k === 'contract') return `contract:\n\${contract}`;
        if (k === 'instruction') return `Instruction:\n\${instruction}`;
        if (k === 'input') return `Input:\n\${input}`;
        return `${k}:\n\${${k}}`;
      })
      .join('\n\n') +
    '\n'
  );
}

function stripInterpolationBlocks(seed: string): string {
  let s = seed;
  // 去掉文末常见插值块，避免进 references 后未替换
  s = s.replace(/\nfield_specs:\s*\n\$\{field_specs\}\s*$/i, '');
  s = s.replace(/\ncontract:\s*\n\$\{contract\}\s*$/i, '');
  s = s.replace(/\nInstruction:\s*\n\$\{instruction\}\s*/gi, '\n');
  s = s.replace(/\nInput:\s*\n\$\{input\}\s*/gi, '\n');
  s = s.replace(/\$\{field_specs\}/g, '_(field_specs provided at runtime)_');
  s = s.replace(/\$\{contract\}/g, '_(contract provided at runtime)_');
  s = s.replace(/\$\{instruction\}/g, '_(instruction provided at runtime)_');
  s = s.replace(/\$\{input\}/g, '_(input provided at runtime)_');
  return s.trim() + '\n';
}

function buildSkillPack(args: {
  scope: string;
  type: string;
  subtype: string;
  seed: string;
  contractSchema: unknown;
}): SkillPack {
  const name = `${args.scope}-${args.type}-${args.subtype}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const intro = shortIntro(args.seed, args.scope, args.type, args.subtype);
  const rawRules =
    args.seed && !isPlaceholderPrompt(args.seed)
      ? args.seed
      : `# Rules\n\n(No legacy prompt body; edit this file to add domain rules.)\n`;
  const rulesBody =
    args.scope === 'text' ? stripInterpolationBlocks(rawRules) : rawRules.endsWith('\n') ? rawRules : `${rawRules}\n`;

  const loadRefs = [CONTRACT_REF_PATH, 'references/rules.md'];
  let skillBody = [
    intro,
    '',
    '## Workflow',
    '',
    '1. Read `references/contract.md` for field shape.',
    '2. Read `references/rules.md` for hard constraints.',
    '3. Use bound / provided inputs only — do not invent facts.',
    '',
  ].join('\n');

  if (args.scope === 'text') {
    skillBody += textInterpolationFooter(args.seed);
  }

  const skillMd = [
    '---',
    `name: ${name}`,
    `description: Core skill for ${args.scope}/${args.type}/${args.subtype}. Use when running this business node.`,
    'loadReferences:',
    ...loadRefs.map((r) => `  - ${r}`),
    '---',
    '',
    skillBody.trim(),
    '',
  ].join('\n');

  let pack: SkillPack = { version: 1, files: [] };
  pack = upsertSkillFile(pack, { path: SKILL_MD_PATH, content: skillMd, readonly: false });
  pack = upsertSkillFile(pack, {
    path: 'references/rules.md',
    content: rulesBody.endsWith('\n') ? rulesBody : `${rulesBody}\n`,
    readonly: false,
  });
  pack = ensureLockedSkillFiles({
    pack,
    contractSchema: args.contractSchema as any,
    scope: args.scope,
    taskKey: args.type,
  });
  return pack;
}

function migrateItem(item: Record<string, unknown>): boolean {
  const scope = String(item.scope ?? '');
  const type = String(item.type ?? '');
  const subtype = String(item.subtype ?? '');
  if (!isCoreSkillSlice({ scope, type, taskKey: type, subtype })) return false;

  const extra = (item.extra && typeof item.extra === 'object' ? item.extra : {}) as Record<
    string,
    unknown
  >;
  const taskTemplate = (extra.taskTemplate && typeof extra.taskTemplate === 'object'
    ? { ...extra.taskTemplate }
    : {}) as Record<string, unknown>;
  const tplExtra = (taskTemplate.extra && typeof taskTemplate.extra === 'object'
    ? { ...(taskTemplate.extra as object) }
    : {}) as Record<string, unknown>;

  const seed = extractSeed(item);
  const pack = buildSkillPack({
    scope,
    type,
    subtype,
    seed,
    contractSchema: taskTemplate.contractSchema ?? taskTemplate.formSchema,
  });

  // unifiedTemplate 与 skill 正文同步（兼容旧读取 / 未走 skill 的路径）
  const skillFile = pack.files.find((f) => f.path === SKILL_MD_PATH);
  const rulesFile = pack.files.find((f) => f.path === 'references/rules.md');
  const compatPrompt =
    scope === 'text'
      ? seed || (skillFile?.content ?? '')
      : rulesFile?.content?.trim() || seed || 'Core Skill';

  taskTemplate.prompt = {
    ...((taskTemplate.prompt as object) ?? {}),
    unifiedTemplate: compatPrompt,
  };

  // group：执笔以 skill 为准；清掉旁路真源，避免双源
  if (tplExtra.groupOutput && typeof tplExtra.groupOutput === 'object') {
    const go = { ...(tplExtra.groupOutput as Record<string, unknown>) };
    if (go.itemManuscript && typeof go.itemManuscript === 'object') {
      const ms = { ...(go.itemManuscript as Record<string, unknown>) };
      // 保留 field；systemPrompt 改为空字符串标记「以 SKILL 为准」（runtime 会注入）
      ms.systemPrompt = '';
      ms.skillSource = 'SKILL.md';
      go.itemManuscript = ms;
    }
    tplExtra.groupOutput = go;
  }

  tplExtra.skillMode = SKILL_MODE_CORE;
  tplExtra.skillPack = pack;
  taskTemplate.extra = tplExtra;
  extra.taskTemplate = taskTemplate;
  extra.skillMode = SKILL_MODE_CORE;
  item.extra = extra;
  return true;
}

function main() {
  let total = 0;
  for (const file of FILES) {
    const fp = path.join(examplesDir, file);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8')) as {
      items?: Record<string, unknown>[];
    };
    let n = 0;
    for (const item of data.items ?? []) {
      if (migrateItem(item)) n += 1;
    }
    fs.writeFileSync(fp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    console.log(`${file}: rewritten ${n} items`);
    total += n;
  }
  console.log(`done, total ${total}`);
}

main();
