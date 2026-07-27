import { describe, it, expect } from 'vitest';
import { parseOutputGrid, buildFrozenUserContract, assertDirectiveRespectsFuc } from './grid-contract';
import { getScriptPool, pickScriptsForGrid } from './grid-pose-scripts';
import { evaluateTextSimilarity, ngramJaccard } from './grid-prompt-similarity';
import { assembleContactSheetPromptEn, countPanelsInPrompt, validateFormatPreservedPanels } from './grid-prompt-assemble';
import type { GridCellPlan } from './types';

describe('grid-contract', () => {
  it('parseOutputGrid 2x2', () => {
    expect(parseOutputGrid('2x2')).toEqual({ outputGrid: '2x2', gridN: 2, totalCells: 4 });
  });

  it('assertDirectiveRespectsFuc rejects wrong aspect', () => {
    const r = assertDirectiveRespectsFuc('wide landscape 16:9 full body', { aspect_ratio: '9:16' });
    expect(r.ok).toBe(false);
  });
});

describe('grid-pose-scripts', () => {
  it('2x2 pool has 4 distinct directives', () => {
    const pool = getScriptPool('2x2');
    expect(pool.length).toBeGreaterThanOrEqual(4);
    const picked = pickScriptsForGrid({ outputGrid: '2x2', totalCells: 4, parallelIndex: 0 });
    expect(picked).toHaveLength(4);
    const cells: GridCellPlan[] = picked.map((p, index) => ({
      index,
      row: Math.floor(index / 2),
      col: index % 2,
      slots: p.slots,
      directiveEn: p.directiveEn,
    }));
    const qa = evaluateTextSimilarity(cells, buildFrozenUserContract({ output_grid: '2x2', aspect_ratio: '9:16' }));
    expect(qa.passed).toBe(true);
  });

  it('parallel offset changes script selection', () => {
    const a = pickScriptsForGrid({ outputGrid: '2x2', totalCells: 4, parallelIndex: 0 })[0].directiveEn;
    const b = pickScriptsForGrid({ outputGrid: '2x2', totalCells: 4, parallelIndex: 1 })[0].directiveEn;
    expect(a).not.toBe(b);
  });

  it('x-grid-pose-scripts string pool passes text QA (taobao-style)', () => {
    const formSchema = {
      properties: {},
      'x-grid-pose-scripts': {
        '2x2': [
          'Full-body establishing shot, model mid-step with natural stride, three-quarter angle, ~28mm equivalent eye-level.',
          'Half-body hero framing from waist up, subtle torso twist, one hand lightly adjusting collar, ~65mm equivalent.',
          'Seated three-quarter view on bench, hands smoothing skirt hem, ~50mm equivalent, seated camera height.',
          'Back three-quarter full-body view, glance over shoulder, highlight back panel, ~35mm equivalent.',
          'Full-body walking away then turning in stride, 32mm equivalent, dynamic hem swing.',
          'Half-body leaning forward, both hands on belt line, 75mm equivalent.',
          'One-knee kneel, pinch fabric at hem, 55mm equivalent.',
          'Clean profile full-body walking freeze, gaze off-camera, 40mm equivalent.',
        ],
      },
    };
    const picked = pickScriptsForGrid({
      outputGrid: '2x2',
      totalCells: 4,
      parallelIndex: 0,
      formSchema,
    });
    const cells: GridCellPlan[] = picked.map((p, index) => ({
      index,
      row: Math.floor(index / 2),
      col: index % 2,
      slots: p.slots,
      directiveEn: p.directiveEn,
    }));
    expect(cells[0].slots.pose).not.toBe('custom');
    const qa = evaluateTextSimilarity(
      cells,
      buildFrozenUserContract({ output_grid: '2x2', aspect_ratio: '9:16', scenes: 'indoor_studio' })
    );
    expect(qa.passed).toBe(true);
    expect(qa.conflicts).toHaveLength(0);
  });
});

describe('grid-prompt-similarity', () => {
  it('detects duplicate directives', () => {
    const cells: GridCellPlan[] = [
      {
        index: 0,
        row: 0,
        col: 0,
        slots: { pose: 'a', framing: 'f', shotType: 's', action: 'x' },
        directiveEn: 'Full body standing pose with natural stride and eye level camera',
      },
      {
        index: 1,
        row: 0,
        col: 1,
        slots: { pose: 'a', framing: 'f', shotType: 's', action: 'x' },
        directiveEn: 'Full body standing pose with natural stride and eye level camera',
      },
    ];
    const qa = evaluateTextSimilarity(cells, {});
    expect(qa.passed).toBe(false);
  });

  it('ngramJaccard identical is 1', () => {
    const s = 'half body hero framing waist up hand on collar';
    expect(ngramJaccard(s, s)).toBe(1);
  });
});

describe('grid-prompt-assemble', () => {
  it('assemble includes Panel lines', () => {
    const cells: GridCellPlan[] = [
      {
        index: 0,
        row: 0,
        col: 0,
        slots: { pose: 'p1', framing: 'f1', shotType: 's1', action: 'a1' },
        directiveEn: 'Panel one directive unique alpha',
      },
      {
        index: 1,
        row: 0,
        col: 1,
        slots: { pose: 'p2', framing: 'f2', shotType: 's2', action: 'a2' },
        directiveEn: 'Panel two directive unique beta seated',
      },
    ];
    const en = assembleContactSheetPromptEn({
      gridN: 2,
      totalCells: 2,
      outputGrid: '2x2',
      sharedBlockEn: 'shared test',
      cells,
    });
    expect(en).toContain('Panel 1');
    expect(en).toContain('Panel 2');
    expect(validateFormatPreservedPanels(en, 2)).toBe(true);
    expect(countPanelsInPrompt('no panels here')).toBe(0);
  });
});
