/**
 * Admin Core Skill 包工具（与 mxmcgi/src/tasks/skill 约定对齐）
 */
export type SkillPackFile = {
  path: string;
  content: string;
  readonly?: boolean;
};

export type SkillPack = {
  version: 1;
  files: SkillPackFile[];
};

export const SKILL_MODE_CORE = 'core-skill';
export const SKILL_MD_PATH = 'SKILL.md';
export const CONTRACT_REF_PATH = 'references/contract.md';

export type SkillSliceKey = { scope: string; kind: string; subtype: string };

export const CORE_SKILL_HOST_SLICES: SkillSliceKey[] = [
  { scope: 'writing', kind: 'generator', subtype: 'industry-daily' },
  { scope: 'writing', kind: 'group', subtype: 'deck' },
  { scope: 'audio', kind: 'generator', subtype: 'voice-over-test' },
  { scope: 'audio', kind: 'group', subtype: 'multi-voice' },
];

export const CORE_SKILL_TEXT_SLICES: SkillSliceKey[] = [
  { scope: 'text', kind: 'expert', subtype: 'industry-search-track' },
  { scope: 'text', kind: 'expert', subtype: 'industry-daily-structure' },
  { scope: 'text', kind: 'expert', subtype: 'industry-daily-body' },
  { scope: 'text', kind: 'transform', subtype: 'md-polish-daily' },
  { scope: 'text', kind: 'transform', subtype: 'md-format' },
  { scope: 'text', kind: 'expert', subtype: 'deck-plan-recommend' },
  { scope: 'text', kind: 'expert', subtype: 'deck-visual-plan' },
  { scope: 'text', kind: 'expert', subtype: 'deck-slide-fill' },
  { scope: 'text', kind: 'transform', subtype: 'writing-review-summary' },
  { scope: 'text', kind: 'transform', subtype: 'voice-script-draft' },
  { scope: 'text', kind: 'expert', subtype: 'voice-persona-sketch' },
  { scope: 'text', kind: 'transform', subtype: 'voice-script-tts-markup' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-content-scan' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-script-draft' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-tts-markup' },
  { scope: 'text', kind: 'expert', subtype: 'dialogue-timeline-cues' },
];

export function isCoreSkillSlice(args: {
  scope: string;
  type?: string | null;
  subtype?: string | null;
}): boolean {
  const subtype = String(args.subtype ?? '').trim();
  if (!subtype) return false;
  const scope = String(args.scope ?? '').trim();
  const kind = String(args.type ?? '').trim();
  const list = scope === 'text' ? CORE_SKILL_TEXT_SLICES : CORE_SKILL_HOST_SLICES;
  return list.some((s) => s.scope === scope && s.kind === kind && s.subtype === subtype);
}

export function isLockedSkillPath(path: string): boolean {
  const p = path.replace(/^\.\//, '').replace(/\\/g, '/');
  if (p === CONTRACT_REF_PATH || p.startsWith('references/contract.')) return true;
  if (/^scripts\/invoke-(generator|group|series|text)(\.[a-z0-9]+)?$/i.test(p)) return true;
  return false;
}

export function readSkillPackFromDraftExtra(extra: Record<string, unknown> | undefined): SkillPack | null {
  if (!extra) return null;
  const raw = extra.skillPack;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const files = (raw as { files?: unknown }).files;
  if (!Array.isArray(files)) return null;
  const out: SkillPackFile[] = [];
  for (const f of files) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    const path = String((f as SkillPackFile).path ?? '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '');
    if (!path) continue;
    out.push({
      path,
      content: typeof (f as SkillPackFile).content === 'string' ? (f as SkillPackFile).content : '',
      readonly: Boolean((f as SkillPackFile).readonly) || isLockedSkillPath(path),
    });
  }
  return { version: 1, files: out };
}

function asProps(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  const p = schema?.properties;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  return p as Record<string, unknown>;
}

export function buildContractReferenceMarkdown(contractSchema: Record<string, unknown> | undefined): string {
  const props = asProps(contractSchema);
  const basic: string[] = [];
  const business: string[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const prop = raw as Record<string, unknown>;
    const title = typeof prop.title === 'string' ? prop.title.trim() : name;
    const desc = typeof prop.description === 'string' ? prop.description.trim() : '';
    const typ =
      typeof prop.type === 'string'
        ? prop.type
        : Array.isArray(prop.type)
          ? prop.type.join('|')
          : 'any';
    const zone = typeof prop['x-zone'] === 'string' ? prop['x-zone'] : 'business';
    const line = `- \`${name}\` (${typ}) ${title}${desc ? ` — ${desc}` : ''}`;
    if (zone === 'basic') basic.push(line);
    else business.push(line);
  }
  return [
    '# Business contract shape',
    '',
    'This file is **platform-generated** from `contractSchema`. Read-only in the editor.',
    '',
    '## basic',
    '',
    ...(basic.length ? basic : ['- _(no basic fields)_']),
    '',
    '## business',
    '',
    ...(business.length ? business : ['- _(no business fields)_']),
    '',
  ].join('\n');
}

function invokeScript(taskKey: string, scope: string): { path: string; content: string } {
  if (scope === 'text') {
    return {
      path: 'scripts/invoke-text.mjs',
      content: `/** @readonly platform text invoke */\nexport const invokeMode = 'text';\n`,
    };
  }
  const tk = taskKey === 'group' || taskKey === 'series' ? taskKey : 'generator';
  return {
    path: `scripts/invoke-${tk}.mjs`,
    content: `/** @readonly platform invoke-${tk} */\nexport const invokeMode = '${tk}';\n`,
  };
}

export function upsertSkillFile(pack: SkillPack, file: SkillPackFile): SkillPack {
  const path = file.path.replace(/\\/g, '/').replace(/^\.\//, '');
  const next = pack.files.filter((f) => f.path !== path);
  next.push({
    path,
    content: file.content,
    readonly: Boolean(file.readonly) || isLockedSkillPath(path),
  });
  next.sort((a, b) => a.path.localeCompare(b.path));
  return { version: 1, files: next };
}

export function ensureCoreSkillPack(args: {
  pack: SkillPack | null;
  contractSchema?: Record<string, unknown>;
  scope: string;
  type: string;
  subtype: string;
  seedBody: string;
}): SkillPack {
  let pack = args.pack ?? { version: 1 as const, files: [] };
  const name = `${args.scope}-${args.type}-${args.subtype}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const skill = pack.files.find((f) => f.path === SKILL_MD_PATH);
  if (!skill?.content?.trim()) {
    const body = args.seedBody.trim() || 'Produce the deliverable for this business.';
    pack = upsertSkillFile(pack, {
      path: SKILL_MD_PATH,
      content: [
        '---',
        `name: ${name}`,
        `description: Core skill for ${args.scope}/${args.type}/${args.subtype}`,
        'loadReferences:',
        `  - ${CONTRACT_REF_PATH}`,
        '---',
        '',
        body,
        '',
      ].join('\n'),
      readonly: false,
    });
  }
  pack = upsertSkillFile(pack, {
    path: CONTRACT_REF_PATH,
    content: buildContractReferenceMarkdown(args.contractSchema),
    readonly: true,
  });
  const inv = invokeScript(args.type, args.scope);
  pack = upsertSkillFile(pack, { path: inv.path, content: inv.content, readonly: true });
  return pack;
}

export function skillBodyFromPack(pack: SkillPack): string {
  const f = pack.files.find((x) => x.path === SKILL_MD_PATH);
  if (!f?.content) return '';
  const text = f.content;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end >= 0) return text.slice(end + 4).replace(/^\r?\n/, '').trim();
  }
  return text.trim();
}

export function buildSkillTreePaths(pack: SkillPack): string[] {
  const paths = new Set<string>(['SKILL.md', 'references/', 'scripts/']);
  for (const f of pack.files) {
    paths.add(f.path);
    const parts = f.path.split('/');
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        paths.add(`${parts.slice(0, i).join('/')}/`);
      }
    }
  }
  return [...paths].sort((a, b) => {
    if (a === 'SKILL.md') return -1;
    if (b === 'SKILL.md') return 1;
    return a.localeCompare(b);
  });
}

/** iOS Files 风格层级树节点 */
export type SkillTreeNode = {
  key: string;
  title: string;
  path: string;
  kind: 'file' | 'folder';
  locked: boolean;
  children?: SkillTreeNode[];
};

export function buildSkillTreeNodes(pack: SkillPack): SkillTreeNode[] {
  const rootFile: SkillTreeNode = {
    key: SKILL_MD_PATH,
    title: 'SKILL.md',
    path: SKILL_MD_PATH,
    kind: 'file',
    locked: false,
  };

  const folderNames = ['references', 'scripts'] as const;
  const folders: SkillTreeNode[] = folderNames.map((name) => {
    const dir = `${name}/`;
    const children = pack.files
      .filter((f) => f.path.startsWith(dir) && f.path !== dir)
      .map((f) => {
        const base = f.path.slice(dir.length);
        // 仅一层：references/x.md；若更深则取相对段
        const title = base.includes('/') ? base.split('/').pop()! : base;
        return {
          key: f.path,
          title,
          path: f.path,
          kind: 'file' as const,
          locked: Boolean(f.readonly) || isLockedSkillPath(f.path),
        };
      })
      .sort((a, b) => {
        // 锁定文件靠前（合同 / invoke），其余按名
        if (a.locked !== b.locked) return a.locked ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
    return {
      key: dir,
      title: name,
      path: dir,
      kind: 'folder' as const,
      locked: false,
      children,
    };
  });

  return [rootFile, ...folders];
}
