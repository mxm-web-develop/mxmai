/**
 * 从 contractSchema 生成只读 references/contract.md
 */
import type { JsonSchemaV2 } from '../types';

function asProps(schema: JsonSchemaV2 | undefined): Record<string, unknown> {
  const p = schema?.properties;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  return p as Record<string, unknown>;
}

function zoneOf(prop: Record<string, unknown>): string {
  const z = prop['x-zone'];
  return typeof z === 'string' && z.trim() ? z.trim() : 'business';
}

function lineForField(name: string, prop: Record<string, unknown>): string {
  const title = typeof prop.title === 'string' ? prop.title.trim() : name;
  const desc = typeof prop.description === 'string' ? prop.description.trim() : '';
  const typ = typeof prop.type === 'string' ? prop.type : Array.isArray(prop.type) ? prop.type.join('|') : 'any';
  const enumVals = Array.isArray(prop.enum) ? prop.enum.map(String).join(' | ') : '';
  const bits = [`\`${name}\``, `(${typ})`, title !== name ? title : ''];
  if (enumVals) bits.push(`enum: ${enumVals}`);
  if (desc) bits.push(`— ${desc}`);
  return `- ${bits.filter(Boolean).join(' ')}`;
}

/**
 * 生成合同形态说明（无运行时填值）。Schema 变更时整文件替换。
 */
export function buildContractReferenceMarkdown(contractSchema: JsonSchemaV2 | undefined): string {
  const props = asProps(contractSchema);
  const basic: string[] = [];
  const business: string[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const prop = raw as Record<string, unknown>;
    const line = lineForField(name, prop);
    if (zoneOf(prop) === 'basic') basic.push(line);
    else business.push(line);
  }

  const lines = [
    '# Business contract shape',
    '',
    'This file is **platform-generated** from `contractSchema`. It is read-only in the editor.',
    'Runtime filled values are injected separately by the skill executor (data plane).',
    '',
    '## Zones',
    '',
    '- `basic` — user-facing / input-stage fields',
    '- `business` — enrich / expert-filled fields',
    '- `sources` / `enrich_search` — pipeline evidence (not schema properties; present at runtime)',
    '',
    '## basic',
    '',
    ...(basic.length ? basic : ['- _(no basic fields)_']),
    '',
    '## business',
    '',
    ...(business.length ? business : ['- _(no business fields)_']),
    '',
  ];
  return lines.join('\n');
}
