/**
 * 解析 SKILL.md YAML frontmatter（最小实现，避免强依赖 js-yaml）
 */
import type { ParsedSkillMd, SkillFrontmatter } from './types';

function parseSimpleYamlValue(raw: string): unknown {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * 仅支持：标量、单层 key: value、loadReferences 列表、inputs 嵌套 map
 */
function parseFrontmatterBlock(block: string): SkillFrontmatter {
  const fm: SkillFrontmatter = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i += 1;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1]!;
    const rest = m[2]!.trim();
    if (key === 'loadReferences' && rest === '') {
      const list: string[] = [];
      i += 1;
      while (i < lines.length) {
        const l = lines[i]!;
        const lm = l.match(/^\s+-\s+(.+)$/);
        if (!lm) break;
        list.push(String(parseSimpleYamlValue(lm[1]!)));
        i += 1;
      }
      fm.loadReferences = list;
      continue;
    }
    if (key === 'inputs' && rest === '') {
      const inputs: Record<string, string> = {};
      i += 1;
      while (i < lines.length) {
        const l = lines[i]!;
        const im = l.match(/^\s+([A-Za-z0-9_-]+):\s*(.+)$/);
        if (!im) break;
        inputs[im[1]!] = String(parseSimpleYamlValue(im[2]!));
        i += 1;
      }
      fm.inputs = inputs;
      continue;
    }
    const val = parseSimpleYamlValue(rest);
    if (key === 'name' && typeof val === 'string') fm.name = val;
    else if (key === 'description' && typeof val === 'string') fm.description = val;
    else if (key === 'loadReferences' && typeof val === 'string') fm.loadReferences = [val];
    i += 1;
  }
  return fm;
}

export function parseSkillMd(raw: string): ParsedSkillMd {
  const text = raw.replace(/^\uFEFF/, '');
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end >= 0) {
      const block = text.slice(3, end).replace(/^\r?\n/, '');
      const body = text.slice(end + 4).replace(/^\r?\n/, '');
      return {
        frontmatter: parseFrontmatterBlock(block),
        body: body.trim(),
        raw: text,
      };
    }
  }
  return { frontmatter: {}, body: text.trim(), raw: text };
}
