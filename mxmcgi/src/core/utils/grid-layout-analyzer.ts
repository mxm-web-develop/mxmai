/**
 * 宫格布局分析：动态检测真实分隔线位置（支持非等宽/非等高格子）
 */

import sharp from 'sharp';
import { loadImageBuffer } from './grid-image-io';

export type GridLayoutLabel = '1x1' | '2x2' | '3x3' | '4x4';
export type ImageOrientation = 'square' | 'landscape' | 'portrait';
export type AnalyzeConfidence = 'high' | 'medium' | 'low';
export type LayoutSource = 'cv' | 'equal_fallback';

export interface GutterSpan {
  start: number;
  end: number;
  center: number;
}

export interface GridAxisRegions {
  starts: number[];
  sizes: number[];
}

export interface GridSeamBounds {
  columns: GridAxisRegions;
  rows: GridAxisRegions;
}

export interface GridLayoutAnalysis {
  width: number;
  height: number;
  orientation: ImageOrientation;
  aspectLabel: string;
  layout: GridLayoutLabel | null;
  gridN: number;
  confidence: AnalyzeConfidence;
  layoutSource: LayoutSource;
  seamBounds: GridSeamBounds | null;
  verticalGutters: GutterSpan[];
  horizontalGutters: GutterSpan[];
}

export interface AnalyzeGridLayoutOptions {
  /** 分析用最长边像素 */
  maxAnalyzeEdge?: number;
  /** 已知每边格数时只取对应数量的最强分隔线（仍按图像实测位置，非等分） */
  gridNHint?: number;
  prominenceWindow?: number;
  minProminence?: number;
  edgeMarginRatio?: number;
}

const DEFAULT_OPTS: Required<AnalyzeGridLayoutOptions> = {
  maxAnalyzeEdge: 1200,
  gridNHint: 0,
  prominenceWindow: 10,
  minProminence: 1.5,
  edgeMarginRatio: 0.02,
};

export function inferAspectRatioLabel(width: number, height: number): string {
  if (!width || !height) return '1:1';
  const r = width / height;
  const candidates: Array<{ label: string; ratio: number }> = [
    { label: '1:1', ratio: 1 },
    { label: '3:4', ratio: 3 / 4 },
    { label: '4:3', ratio: 4 / 3 },
    { label: '16:9', ratio: 16 / 9 },
    { label: '9:16', ratio: 9 / 16 },
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(r - best.ratio);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(r - c.ratio);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best.label;
}

export function classifyOrientation(width: number, height: number): ImageOrientation {
  const ratio = width / height;
  if (ratio >= 0.92 && ratio <= 1.08) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

function layoutLabelFromN(gridN: number): GridLayoutLabel {
  if (gridN <= 1) return '1x1';
  if (gridN === 2) return '2x2';
  if (gridN === 3) return '3x3';
  return '4x4';
}

function computeAxisMeans(
  pixels: Buffer,
  width: number,
  height: number,
): { colMean: number[]; rowMean: number[] } {
  const colMean = new Array<number>(width).fill(0);
  const rowMean = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      colMean[x] += pixels[rowOff + x];
    }
  }
  for (let x = 0; x < width; x++) colMean[x] /= height;

  for (let y = 0; y < height; y++) {
    let sum = 0;
    const rowOff = y * width;
    for (let x = 0; x < width; x++) sum += pixels[rowOff + x];
    rowMean[y] = sum / width;
  }

  return { colMean, rowMean };
}

/** 全幅贯穿度：该列/行在多少比例像素上呈现为亮线 */
function computeFullSpanScores(
  pixels: Buffer,
  width: number,
  height: number,
  axis: 'vertical' | 'horizontal',
): number[] {
  if (axis === 'vertical') {
    const scores = new Array<number>(width).fill(0);
    for (let x = 1; x < width - 1; x++) {
      let hit = 0;
      for (let y = 0; y < height; y++) {
        const v = pixels[y * width + x];
        const l = pixels[y * width + x - 1];
        const r = pixels[y * width + x + 1];
        if (v >= 235 || (v >= l + 4 && v >= r + 4 && v > 175)) hit++;
      }
      scores[x] = hit / height;
    }
    return scores;
  }

  const scores = new Array<number>(height).fill(0);
  for (let y = 1; y < height - 1; y++) {
    let hit = 0;
    for (let x = 0; x < width; x++) {
      const v = pixels[y * width + x];
      const u = pixels[(y - 1) * width + x];
      const d = pixels[(y + 1) * width + x];
      if (v >= 235 || (v >= u + 4 && v >= d + 4 && v > 175)) hit++;
    }
    scores[y] = hit / width;
  }
  return scores;
}

function computeProminenceProfile(values: number[], window: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  const w = Math.max(3, window);
  for (let i = w; i < n - w; i++) {
    let left = 0;
    let right = 0;
    for (let j = i - w; j < i; j++) left += values[j];
    for (let j = i + 1; j <= i + w; j++) right += values[j];
    left /= w;
    right /= w;
    const prom = values[i] - Math.max(left, right);
    if (prom > 0) out[i] = prom;
  }
  return out;
}

function combineSeamProfiles(
  meanProfile: number[],
  prominence: number[],
  spanScores: number[],
): number[] {
  const n = meanProfile.length;
  const out = new Array<number>(n).fill(0);
  let maxProm = 0;
  for (const p of prominence) if (p > maxProm) maxProm = p;

  for (let i = 0; i < n; i++) {
    const promNorm = maxProm > 0 ? prominence[i] / maxProm : 0;
    // 亮线 prominence + 全幅贯穿；不假设等间距
    out[i] = prominence[i] * (0.35 + 0.65 * spanScores[i]) + promNorm * 2;
  }
  return out;
}

function adaptiveMinProminence(profile: number[], floor: number): number {
  const vals = profile.filter((v) => v > 0).sort((a, b) => b - a);
  if (vals.length === 0) return floor;
  const p90 = vals[Math.floor(vals.length * 0.1)] ?? vals[0];
  return Math.max(floor, p90 * 0.22);
}

function expandGutterSpan(profile: number[], center: number, minProm: number): GutterSpan {
  const half = Math.max(0.4, minProm * 0.3);
  let start = center;
  let end = center;
  while (start > 0 && profile[start - 1] >= half) start--;
  while (end < profile.length - 1 && profile[end + 1] >= half) end++;
  return { start, end, center: Math.round((start + end) / 2) };
}

function pickDynamicGutterCenters(
  profile: number[],
  count: number,
  length: number,
  minProm: number,
  edgeMarginRatio: number,
): number[] {
  if (count <= 0) return [];
  const margin = Math.max(2, Math.floor(length * edgeMarginRatio));
  const minDist = Math.max(10, Math.floor(length / (count + 2)));

  const candidates: Array<{ idx: number; score: number }> = [];
  for (let i = 2; i < profile.length - 2; i++) {
    if (i <= margin || i >= length - margin) continue;
    const score = profile[i];
    if (score < minProm) continue;
    if (score < profile[i - 1] || score < profile[i + 1]) continue;
    candidates.push({ idx: i, score });
  }
  candidates.sort((a, b) => b.score - a.score);

  const picked: number[] = [];
  for (const c of candidates) {
    if (picked.some((p) => Math.abs(p - c.idx) < minDist)) continue;
    picked.push(c.idx);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a - b);
}

function detectGuttersOnAxis(
  combinedProfile: number[],
  gutterCount: number,
  length: number,
  opts: Required<AnalyzeGridLayoutOptions>,
): GutterSpan[] {
  const minProm = adaptiveMinProminence(combinedProfile, opts.minProminence);
  const centers = pickDynamicGutterCenters(
    combinedProfile,
    gutterCount,
    length,
    minProm,
    opts.edgeMarginRatio,
  );
  return centers.map((c) => expandGutterSpan(combinedProfile, c, minProm));
}

function spacingVariance(centers: number[], total: number): number {
  if (centers.length === 0) return 1;
  const steps: number[] = [];
  let prev = 0;
  for (const c of centers) {
    steps.push(c - prev);
    prev = c;
  }
  steps.push(total - prev);
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  if (mean <= 0) return 1;
  const variance = steps.reduce((acc, s) => acc + (s - mean) ** 2, 0) / steps.length;
  return Math.sqrt(variance) / mean;
}

interface GridNCandidateScore {
  gridN: number;
  score: number;
  vertical: GutterSpan[];
  horizontal: GutterSpan[];
  confidence: AnalyzeConfidence;
}

function scoreGridNCandidate(
  vProfile: number[],
  hProfile: number[],
  gridN: number,
  width: number,
  height: number,
  opts: Required<AnalyzeGridLayoutOptions>,
): GridNCandidateScore {
  const need = gridN - 1;
  const vertical = detectGuttersOnAxis(vProfile, need, width, opts);
  const horizontal = detectGuttersOnAxis(hProfile, need, height, opts);

  if (vertical.length < need || horizontal.length < need) {
    return { gridN, score: -1, vertical, horizontal, confidence: 'low' };
  }

  const vCenters = vertical.map((g) => g.center);
  const hCenters = horizontal.map((g) => g.center);
  const avgProm =
    (vCenters.reduce((s, c) => s + vProfile[c], 0) +
      hCenters.reduce((s, c) => s + hProfile[c], 0)) /
    (vCenters.length + hCenters.length);

  const vVar = spacingVariance(vCenters, width);
  const hVar = spacingVariance(hCenters, height);
  const maxVar = Math.max(vVar, hVar);

  let confidence: AnalyzeConfidence = 'low';
  if (maxVar < 0.35) confidence = 'high';
  else if (maxVar < 0.55) confidence = 'medium';

  // 非等分宫格允许较大 spacing 方差，以分隔线实测强度为主
  const score = avgProm * (1 + need * 0.15) - maxVar * 0.5;
  return { gridN, score, vertical, horizontal, confidence };
}

function pickBestGridN(
  vProfile: number[],
  hProfile: number[],
  width: number,
  height: number,
  opts: Required<AnalyzeGridLayoutOptions>,
  hint?: number,
): GridNCandidateScore | null {
  if (hint && hint >= 2 && hint <= 4) {
    const scored = scoreGridNCandidate(vProfile, hProfile, hint, width, height, opts);
    if (scored.vertical.length === hint - 1 && scored.horizontal.length === hint - 1) {
      return scored;
    }
  }

  let best: GridNCandidateScore | null = null;
  for (let n = 4; n >= 2; n--) {
    const scored = scoreGridNCandidate(vProfile, hProfile, n, width, height, opts);
    if (scored.score < 0) continue;
    if (!best || scored.score > best.score) best = scored;
  }
  return best;
}

function buildAxisRegions(total: number, gutters: GutterSpan[], gridN: number): GridAxisRegions {
  if (gutters.length === gridN - 1 && gutters.length > 0) {
    const sorted = [...gutters].sort((a, b) => a.start - b.start);
    const starts: number[] = [];
    const sizes: number[] = [];
    let cursor = 0;
    for (const g of sorted) {
      if (g.start > cursor) {
        starts.push(cursor);
        sizes.push(g.start - cursor);
      }
      cursor = g.end + 1;
    }
    if (cursor < total) {
      starts.push(cursor);
      sizes.push(total - cursor);
    }
    if (starts.length === gridN) {
      const sum = sizes.reduce((a, b) => a + b, 0);
      if (sum !== total && sizes.length > 0) {
        sizes[sizes.length - 1] += total - sum;
      }
      return { starts, sizes };
    }
  }

  const starts: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < gridN; i++) {
    const left = Math.round((total * i) / gridN);
    const right = Math.round((total * (i + 1)) / gridN);
    starts.push(left);
    sizes.push(Math.max(1, right - left));
  }
  return { starts, sizes };
}

export function buildSeamBoundsFromGutters(
  width: number,
  height: number,
  verticalGutters: GutterSpan[],
  horizontalGutters: GutterSpan[],
  gridN: number,
): GridSeamBounds {
  return {
    columns: buildAxisRegions(width, verticalGutters, gridN),
    rows: buildAxisRegions(height, horizontalGutters, gridN),
  };
}

export function buildEqualSeamBounds(width: number, height: number, gridN: number): GridSeamBounds {
  return {
    columns: buildAxisRegions(width, [], gridN),
    rows: buildAxisRegions(height, [], gridN),
  };
}

/**
 * 分析宫格源图：动态检测分隔线 → 非等分裁切区域
 */
export async function analyzeGridLayout(
  imageInput: string | Buffer,
  options?: AnalyzeGridLayoutOptions,
): Promise<GridLayoutAnalysis> {
  const opts = { ...DEFAULT_OPTS, ...options };
  const imageBuffer = await loadImageBuffer(imageInput);

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error('无法获取图片尺寸');
  }

  const orientation = classifyOrientation(width, height);
  const aspectLabel = inferAspectRatioLabel(width, height);

  const longEdge = Math.max(width, height);
  const analyzeScale = longEdge > opts.maxAnalyzeEdge ? opts.maxAnalyzeEdge / longEdge : 1;
  const analyzeW = Math.max(1, Math.round(width * analyzeScale));
  const analyzeH = Math.max(1, Math.round(height * analyzeScale));
  const invScaleX = width / analyzeW;
  const invScaleY = height / analyzeH;

  const gray = await sharp(imageBuffer)
    .resize(analyzeW, analyzeH, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();

  const { colMean, rowMean } = computeAxisMeans(gray, analyzeW, analyzeH);
  const colProm = computeProminenceProfile(colMean, opts.prominenceWindow);
  const rowProm = computeProminenceProfile(rowMean, opts.prominenceWindow);
  const colSpan = computeFullSpanScores(gray, analyzeW, analyzeH, 'vertical');
  const rowSpan = computeFullSpanScores(gray, analyzeW, analyzeH, 'horizontal');

  const vProfile = combineSeamProfiles(colMean, colProm, colSpan);
  const hProfile = combineSeamProfiles(rowMean, rowProm, rowSpan);

  const hint = opts.gridNHint && opts.gridNHint >= 2 ? opts.gridNHint : undefined;
  const picked = pickBestGridN(vProfile, hProfile, analyzeW, analyzeH, opts, hint);

  let gridN = 1;
  let confidence: AnalyzeConfidence = 'low';
  let layoutSource: LayoutSource = 'cv';
  let verticalGutters: GutterSpan[] = [];
  let horizontalGutters: GutterSpan[] = [];
  let seamBounds: GridSeamBounds | null = null;

  if (picked && picked.score >= 0) {
    gridN = picked.gridN;
    confidence = picked.confidence;
    verticalGutters = scaleGutters(picked.vertical, invScaleX);
    horizontalGutters = scaleGutters(picked.horizontal, invScaleY);
    seamBounds = buildSeamBoundsFromGutters(
      width,
      height,
      verticalGutters,
      horizontalGutters,
      gridN,
    );
  } else if (hint && hint >= 2) {
    // 未能检出足够分隔线：仅在有明确布局时均匀回退
    gridN = hint;
    layoutSource = 'equal_fallback';
    seamBounds = buildEqualSeamBounds(width, height, gridN);
  }

  const layout = gridN >= 2 ? layoutLabelFromN(gridN) : null;

  return {
    width,
    height,
    orientation,
    aspectLabel,
    layout,
    gridN,
    confidence,
    layoutSource,
    seamBounds,
    verticalGutters,
    horizontalGutters,
  };
}

function scaleGutters(spans: GutterSpan[], scale: number): GutterSpan[] {
  if (scale === 1) return spans;
  return spans.map((g) => ({
    start: Math.round(g.start * scale),
    end: Math.round(g.end * scale),
    center: Math.round(g.center * scale),
  }));
}

export function layoutToGridN(layout: GridLayoutLabel): number {
  if (layout === '2x2') return 2;
  if (layout === '3x3') return 3;
  if (layout === '4x4') return 4;
  return 1;
}

export function gridNToLayout(gridN: number): GridLayoutLabel {
  return layoutLabelFromN(Math.max(1, Math.min(4, gridN)));
}

export function hasUsableSeamBounds(
  analysis: GridLayoutAnalysis | null | undefined,
  gridN: number,
): boolean {
  if (!analysis?.seamBounds) return false;
  if (analysis.verticalGutters.length !== gridN - 1) return false;
  if (analysis.horizontalGutters.length !== gridN - 1) return false;
  return analysis.layoutSource === 'cv';
}
