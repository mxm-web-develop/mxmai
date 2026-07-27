/** 宫格 Prompt Plan 与 QA 元数据类型 */

export interface GridCellSlot {
  pose: string;
  framing: string;
  shotType: string;
  action: string;
  lens?: string;
}

export interface GridCellPlan {
  index: number;
  row: number;
  col: number;
  slots: GridCellSlot;
  directiveEn: string;
}

export interface GridTextQaResult {
  passed: boolean;
  retries: number;
  conflicts?: Array<{ i: number; j: number; score: number; reason: string }>;
}

export interface GridPromptPlan {
  gridN: number;
  totalCells: number;
  outputGrid: string;
  frozenParamsHash: string;
  sharedBlockEn: string;
  cells: GridCellPlan[];
  contactSheetPromptEn: string;
  textQa: GridTextQaResult;
  seamAppendEn?: string;
}

export interface GridPixelConflict {
  i: number;
  j: number;
  hamming: number;
}

export interface GridPixelQaResult {
  passed: boolean;
  conflicts: GridPixelConflict[];
  delivery?: 'ok' | 'warning' | 'blocked';
}

export interface GridCellMetadata {
  index: number;
  row: number;
  col: number;
  url: string;
  width: number;
  height: number;
}

export interface ApplyGridPipelineResult {
  plan: GridPromptPlan;
  /** 注入 text/format 前的 briefing 块 */
  contactSheetBriefing: string;
}
