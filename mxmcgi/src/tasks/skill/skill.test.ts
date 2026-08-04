import { describe, expect, it } from 'vitest';
import { buildContractReferenceMarkdown } from './contract-ref';
import { parseSkillMd } from './parse';
import {
  ensureLockedSkillFiles,
  ensureSkillMdSeed,
  mergeSkillPackForSave,
  readSkillPack,
} from './pack';
import { isCoreSkillSlice, isLockedSkillPath } from './index';
import { sliceContractForSkill } from './context';

describe('core skill pack', () => {
  it('parses SKILL.md frontmatter', () => {
    const parsed = parseSkillMd(`---
name: industry-daily
description: Write industry daily
loadReferences:
  - references/contract.md
  - references/blacklist.md
inputs:
  topic: contract.basic.main_topic
---

You are the writer.
`);
    expect(parsed.frontmatter.name).toBe('industry-daily');
    expect(parsed.frontmatter.loadReferences).toEqual([
      'references/contract.md',
      'references/blacklist.md',
    ]);
    expect(parsed.frontmatter.inputs?.topic).toBe('contract.basic.main_topic');
    expect(parsed.body).toContain('You are the writer.');
  });

  it('locks contract and invoke paths', () => {
    expect(isLockedSkillPath('references/contract.md')).toBe(true);
    expect(isLockedSkillPath('scripts/invoke-generator.mjs')).toBe(true);
    expect(isLockedSkillPath('scripts/invoke-group.mjs')).toBe(true);
    expect(isLockedSkillPath('references/style.md')).toBe(false);
    expect(isLockedSkillPath('SKILL.md')).toBe(false);
  });

  it('merges save without overwriting locked files', () => {
    const previous = ensureLockedSkillFiles({
      pack: ensureSkillMdSeed({
        pack: { version: 1, files: [] },
        seedBody: 'old body',
        name: 't',
        description: 'd',
      }),
      contractSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', title: '话题', 'x-zone': 'basic' },
        },
      } as any,
      scope: 'writing',
      taskKey: 'generator',
    });
    const incoming = {
      version: 1 as const,
      files: [
        { path: 'SKILL.md', content: '---\nname: t\n---\n\nnew body\n' },
        { path: 'references/contract.md', content: 'HACKED' },
        { path: 'scripts/invoke-generator.mjs', content: 'HACKED' },
        { path: 'references/style.md', content: 'style tip' },
      ],
    };
    const merged = mergeSkillPackForSave({
      incoming,
      previous,
      contractSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', title: '话题', 'x-zone': 'basic' },
        },
      } as any,
      scope: 'writing',
      taskKey: 'generator',
    });
    const contract = merged.files.find((f) => f.path === 'references/contract.md');
    const invoke = merged.files.find((f) => f.path === 'scripts/invoke-generator.mjs');
    const skill = merged.files.find((f) => f.path === 'SKILL.md');
    const style = merged.files.find((f) => f.path === 'references/style.md');
    expect(contract?.content).toContain('话题');
    expect(contract?.content).not.toContain('HACKED');
    expect(invoke?.content).toContain('invoke-generator');
    expect(invoke?.content).not.toContain('HACKED');
    expect(skill?.content).toContain('new body');
    expect(style?.content).toBe('style tip');
  });

  it('slices contract to structure view without corpus', () => {
    const sliced = sliceContractForSkill({
      basic: { topic: 'AI' },
      business: { title: 't' },
      assets: { cards: { writing_summary: '冷静' } },
      sources: { websource: { query: 'q', text: 'x'.repeat(8000), hitCount: 3, evidenceKey: 'websource' } },
      enrich_search: { query: 'q2', result: { text: 'y'.repeat(8000), evidenceKey: 'enrich_result' } },
    });
    const ws = (sliced.sources as any).websource;
    expect(ws.query).toBe('q');
    expect(ws.text).toBeUndefined();
    expect(JSON.stringify(sliced)).not.toContain('x'.repeat(100));
    expect((sliced.assets as any).cards.writing_summary).toBe('冷静');
  });

  it('matches vertical slice keys', () => {
    expect(
      isCoreSkillSlice({ scope: 'writing', taskKey: 'generator', subtype: 'industry-daily' })
    ).toBe(true);
    expect(isCoreSkillSlice({ scope: 'writing', taskKey: 'group', subtype: 'deck' })).toBe(true);
    expect(isCoreSkillSlice({ scope: 'writing', taskKey: 'group', subtype: 'seek' })).toBe(false);
    expect(
      isCoreSkillSlice({ scope: 'text', type: 'expert', subtype: 'industry-daily-structure' })
    ).toBe(true);
    expect(isCoreSkillSlice({ scope: 'writing', taskKey: 'articles', subtype: 'other' })).toBe(false);
  });

  it('buildContractReferenceMarkdown lists zones', () => {
    const md = buildContractReferenceMarkdown({
      type: 'object',
      properties: {
        industry: { type: 'string', title: '行业', 'x-zone': 'basic' },
        report_title: { type: 'string', title: '标题', 'x-zone': 'business' },
      },
    } as any);
    expect(md).toContain('## basic');
    expect(md).toContain('`industry`');
    expect(md).toContain('## business');
    expect(md).toContain('`report_title`');
  });

  it('readSkillPack normalizes readonly flags', () => {
    const pack = readSkillPack({
      skillPack: {
        version: 1,
        files: [{ path: 'references/contract.md', content: 'c' }],
      },
    });
    expect(pack?.files[0]?.readonly).toBe(true);
  });
});
