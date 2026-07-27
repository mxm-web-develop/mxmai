import { GRID_TEXT_NGRAM_JACCARD_MAX } from './grid-config';
import type { GridCellPlan } from './types';
import { assertDirectiveRespectsFuc } from './grid-contract';

export interface TextSimilarityPairResult {
  i: number;
  j: number;
  score: number;
  reason: string;
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ngrams(text: string, n: number): Set<string> {
  const tokens = normalizeText(text).split(' ').filter(Boolean);
  const set = new Set<string>();
  if (tokens.length < n) {
    if (tokens.length) set.add(tokens.join(' '));
    return set;
  }
  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '));
  }
  return set;
}

export function ngramJaccard(a: string, b: string, n = 3): number {
  const sa = ngrams(a, n);
  const sb = ngrams(b, n);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) {
    if (sb.has(x)) inter++;
  }
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function slotsDistinctEnough(a: GridCellPlan, b: GridCellPlan): boolean {
  const keys: Array<keyof GridCellPlan['slots']> = ['pose', 'framing', 'shotType', 'action'];
  let diff = 0;
  for (const k of keys) {
    if (a.slots[k] !== b.slots[k]) diff++;
  }
  return diff >= 2;
}

export function evaluateTextSimilarity(
  cells: GridCellPlan[],
  fuc: Record<string, unknown>
): { passed: boolean; conflicts: TextSimilarityPairResult[] } {
  const conflicts: TextSimilarityPairResult[] = [];

  for (let i = 0; i < cells.length; i++) {
    const di = cells[i].directiveEn.trim();
    if (!di) {
      conflicts.push({ i, j: i, score: 1, reason: 'empty directive' });
      continue;
    }
    const fucCheck = assertDirectiveRespectsFuc(di, fuc);
    if (!fucCheck.ok) {
      conflicts.push({ i, j: i, score: 1, reason: fucCheck.reason ?? 'fuc violation' });
    }
  }

  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i].directiveEn;
      const b = cells[j].directiveEn;
      const na = normalizeText(a);
      const nb = normalizeText(b);
      if (na.length > 20 && nb.length > 20) {
        if (na.includes(nb) || nb.includes(na)) {
          conflicts.push({ i, j, score: 1, reason: 'substring containment' });
          continue;
        }
      }
      const score = ngramJaccard(a, b);
      if (score > GRID_TEXT_NGRAM_JACCARD_MAX) {
        conflicts.push({ i, j, score, reason: `ngram jaccard ${score.toFixed(3)} > ${GRID_TEXT_NGRAM_JACCARD_MAX}` });
        continue;
      }
      // 文案已足够区分时不再因槽位元数据重复而失败（避免 x-grid-pose-scripts 纯字符串历史数据）
      if (!slotsDistinctEnough(cells[i], cells[j]) && score > 0.35) {
        conflicts.push({ i, j, score, reason: 'slot fields not distinct enough' });
      }
    }
  }

  return { passed: conflicts.length === 0, conflicts };
}

/** 可选：embedding cosine QA（需 Deer API） */
export async function evaluateTextSimilarityWithEmbedding(
  cells: GridCellPlan[],
  fuc: Record<string, unknown>
): Promise<{ passed: boolean; conflicts: TextSimilarityPairResult[] }> {
  const base = evaluateTextSimilarity(cells, fuc);
  if (!base.passed) return base;

  try {
    const { DeerEmbeddingProvider } = await import('../../../knowledge/embedding/providers/deer.provider');
    const provider = DeerEmbeddingProvider.fromEnv(process.env.GRID_QA_EMBEDDING_MODEL);
    const texts = cells.map((c) => c.directiveEn);
    const res = await provider.embed({ input: texts });
    const vectors = res.data?.map((d) => d.embedding) ?? [];
    if (vectors.length !== cells.length) return base;

    const conflicts = [...base.conflicts];
    const maxCosine = 0.92;
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const cos = cosineSimilarity(vectors[i], vectors[j]);
        if (cos > maxCosine) {
          conflicts.push({ i, j, score: cos, reason: `embedding cosine ${cos.toFixed(3)} > ${maxCosine}` });
        }
      }
    }
    return { passed: conflicts.length === 0, conflicts };
  } catch (e) {
    console.warn('[GridQA] embedding similarity skipped:', e instanceof Error ? e.message : e);
    return base;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
