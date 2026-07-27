import type { GridCellPlan, GridPromptPlan } from './types';

const PANEL_POSITIONS_2X2 = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function panelPosition(index: number, gridN: number): string {
  if (gridN === 2 && index < 4) return PANEL_POSITIONS_2X2[index];
  const row = Math.floor(index / gridN) + 1;
  const col = (index % gridN) + 1;
  return `row ${row} col ${col}`;
}

export function buildSharedBlockEn(args: {
  effectiveUserPrompt: string;
  aspectRatio?: string;
  outputGrid: string;
}): string {
  const lines: string[] = [
    'SHARED CONSTRAINTS (do not change across panels):',
    args.effectiveUserPrompt.trim().slice(0, 6000),
  ];
  if (args.aspectRatio) {
    lines.push(`Aspect ratio locked: ${args.aspectRatio}.`);
  }
  lines.push(`Output grid locked: ${args.outputGrid} contact sheet on one canvas.`);
  return lines.join('\n');
}

export function assembleContactSheetPromptEn(args: {
  gridN: number;
  totalCells: number;
  outputGrid: string;
  aspectRatio?: string;
  sharedBlockEn: string;
  cells: GridCellPlan[];
  seamAppendEn?: string;
}): string {
  const { gridN, totalCells, outputGrid, aspectRatio, sharedBlockEn, cells, seamAppendEn } = args;
  const arPhrase = aspectRatio ? `, aspect ratio ${aspectRatio}` : '';
  const header = [
    `Single ${gridN}x${gridN} contact sheet on one canvas (${totalCells} equal panels)${arPhrase}.`,
    'Same model identity, wardrobe, and environment across all panels; only pose/framing/camera differ per panel.',
    'MANDATORY: each panel must be visually distinct; do not duplicate pose or hand gesture across panels.',
    '',
    sharedBlockEn,
    '',
    'PER-PANEL DIRECTIVES:',
  ];
  const panelLines = cells.map((c) => {
    const pos = panelPosition(c.index, gridN);
    return `Panel ${c.index + 1} (${pos}): ${c.directiveEn}`;
  });
  const parts = [...header, ...panelLines];
  if (seamAppendEn?.trim()) {
    parts.push('', 'GRID SEAM CONSTRAINTS:', seamAppendEn.trim());
  }
  return parts.join('\n');
}

export function buildContactSheetBriefing(plan: GridPromptPlan): string {
  return ['[GRID_CONTACT_SHEET]', plan.contactSheetPromptEn, '[/GRID_CONTACT_SHEET]'].join('\n');
}

/** 校验 format 输出是否保留足够 Panel 行 */
export function countPanelsInPrompt(text: string): number {
  const matches = text.match(/Panel\s+\d+/gi);
  return matches ? matches.length : 0;
}

export function validateFormatPreservedPanels(formatted: string, totalCells: number): boolean {
  return countPanelsInPrompt(formatted) >= totalCells;
}
