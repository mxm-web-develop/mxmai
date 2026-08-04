/**
 * Core Skill 包类型（Anthropic Agent Skill 目录心智，存 DB 虚拟文件树）
 * @see docs/adr/core-skill-output.md
 */

export const SKILL_MODE_CORE = 'core-skill' as const;
export type SkillMode = typeof SKILL_MODE_CORE;

/** 虚拟文件：path 使用 POSIX 风格，相对 skill 根 */
export type SkillPackFile = {
  path: string;
  content: string;
  /** 平台锁定：编辑器不可改；保存时忽略客户端改写 */
  readonly?: boolean;
};

export type SkillPack = {
  /** 包格式版本 */
  version: 1;
  files: SkillPackFile[];
};

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  /**
   * 声明式输入绑定：逻辑名 → 路径（contract.basic.x / params.y / state.z）
   * 缺省时 executor 使用精简合同切片（basic + business，sources 仅 text 摘要）
   */
  inputs?: Record<string, string>;
  /** 默认加载的 references 路径（相对包根） */
  loadReferences?: string[];
};

export type ParsedSkillMd = {
  frontmatter: SkillFrontmatter;
  body: string;
  raw: string;
};

export const SKILL_MD_PATH = 'SKILL.md';
export const CONTRACT_REF_PATH = 'references/contract.md';

export function invokeScriptPath(taskKey: 'generator' | 'group' | 'series'): string {
  return `scripts/invoke-${taskKey}.mjs`;
}

export function isLockedSkillPath(path: string): boolean {
  const p = path.replace(/^\.\//, '').replace(/\\/g, '/');
  if (p === CONTRACT_REF_PATH || p.startsWith('references/contract.')) return true;
  if (/^scripts\/invoke-(generator|group|series)(\.[a-z0-9]+)?$/i.test(p)) return true;
  return false;
}
