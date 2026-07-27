/**
 * mxm-warp entityDive：顺着已检索到的内容（不限话题），
 * 让 LLM 一次性抽实体 + 派生「第二层」查询，再跨 Providers 跑搜索。
 *
 * 设计原则：
 * - **不写死业务 key**：不依赖 contract.business.founder / subject_company 等具体字段
 * - **来源是"已扒出来的内容"**：sources.websource.items / sources.websource.extracted /
 *   enrich_search.result / state.coreArtifact.text / params.main_topic 等话题线索
 * - **LLM 决定第二层角度**：人物会抽履历/争议，公司会抽产品/财务，事件会抽参与方/背景
 *
 * params:
 * - maxEntities?: 默认 3；1～5
 * - queriesPerEntity?: 默认 2；1～4
 * - depth?: quick | standard | deep
 * - maxResults?: 默认 8
 * - extractContent?: 是否抓全文（默认 true）
 * - language?: zh | en | all（默认跟随 params.language）
 * - llm?: 注入 LLM（test 友好；生产由 warp-runner 注入 state._inputLlm/_outputLlm）
 *
 * 写入 contract.enrich_search.entity_dive。
 */
import type { PipelineStep, TaskContext } from '../types';
import { ConfigurationError } from '../errors';
import { SearchService } from '../../core/search/search-service';
import { listUsableSearchProviderNames } from '../../core/search/search-config';
import { getContract, withContract } from './input-stage';
import type { MxmWarpContract } from './contract-types';
import type {
  EntityDiveEntity,
  EntityDiveEvidence,
  EntityDivePayload,
  EntityDiveRecord,
  EntityDiveKind,
} from './contract-types';
import { registerInputStep, registerOutputStep } from '../pipeline-registry';
import { parseLlmStructuredOutput } from '../parse-llm-json';

const MAX_ENTITIES = 5;
const MAX_QUERIES_PER_ENTITY = 4;
const DEFAULT_QUERIES_PER_ENTITY = 2;

const VALID_KINDS: ReadonlySet<EntityDiveKind> = new Set([
  'person',
  'company',
  'product',
  'event',
  'other',
]);

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.max(min, Math.min(max, n));
}

const ENTITY_EXTRACT_SYSTEM = `You are an information-mining assistant.
The user gives you text already retrieved from the web (titles, snippets, sometimes extracted content) about ONE topic.
Your job: identify the concrete **entities** that appear in the text and, for each, propose 1-3 second-layer search queries to deepen understanding.

Return ONE JSON object:
{
  "entities": [
    {
      "name": "string (proper noun, not pronoun)",
      "kind": "person" | "company" | "product" | "event" | "other",
      "queries": ["search query 1", "search query 2"]
    }
  ]
}

Guidelines for second-layer queries (this is the key value-add — do NOT just rephrase the original text):
- For a **person**: dive into background, education, career history, prior roles, public controversies, partner/family if relevant.
- For a **company**: dive into product line, financials, key customers, competitors, regulatory/compliance issues, recent strategic moves.
- For a **product**: dive into technical specs, key features, market share, competitors, recent updates.
- For an **event**: dive into participants, root causes, follow-up impacts, official responses.
- Use the user's selected language.
- Each query should be self-contained and discoverable from a search engine.
- Skip pronouns, generic nouns, and stop words.
- Output NO markdown fences, NO prose — JSON only.`;

export type EntityDiveLlmFn = (args: { system: string; user: string }) => Promise<string>;

async function defaultLlmPlan(
  ctx: TaskContext,
  text: string,
  language: string,
  topicHint: string,
  llmOverride?: EntityDiveLlmFn
): Promise<Array<{ name: string; kind: EntityDiveKind; queries: string[] }>> {
  const languageName = language === 'en' ? 'English' : '简体中文';
  const sys = `${ENTITY_EXTRACT_SYSTEM}\nOutput language for "queries": ${languageName}.`;
  const user = JSON.stringify({
    topic: topicHint || '',
    language,
    already_retrieved_text: text.slice(0, 6000),
  });
  const fn = llmOverride ?? readLlmFromCtx(ctx);
  if (!fn) {
    console.warn(
      '[entityDive] 平台 LLM 未注入（state._inputLlm / _outputLlm 不存在），跳过实体+二跳查询派生'
    );
    return [];
  }
  try {
    const raw = await fn({ system: sys, user });
    const parsed = parseLlmStructuredOutput(raw, 'entity-dive.plan');
    const obj =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const list = obj && Array.isArray(obj.entities) ? obj.entities : [];
    const out: Array<{ name: string; kind: EntityDiveKind; queries: string[] }> = [];
    for (const x of list) {
      if (!x || typeof x !== 'object') continue;
      const o = x as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const kindRaw =
        typeof o.kind === 'string' ? o.kind.trim().toLowerCase() : 'other';
      const kind = (
        VALID_KINDS.has(kindRaw as EntityDiveKind) ? kindRaw : 'other'
      ) as EntityDiveKind;
      const queries = Array.isArray(o.queries)
        ? (o.queries
            .map((q) => (typeof q === 'string' ? q.trim() : ''))
            .filter((q) => q.length >= 2 && q.length <= 200)
            .slice(0, 4) as string[])
        : [];
      if (name.length >= 2 && name.length <= 64 && queries.length > 0) {
        out.push({ name, kind, queries });
      }
    }
    return out;
  } catch (err) {
    console.warn(`[entityDive] LLM 抽实体失败：${(err as Error).message}`);
    return [];
  }
}

/** warp-runner 在 pre/enrich/post 前会把 inputLlm/outputLlm 写入 state */
function readLlmFromCtx(ctx: TaskContext): EntityDiveLlmFn | undefined {
  const s = ctx.state as Record<string, unknown>;
  for (const k of ['_inputLlm', '_outputLlm', '_warpLlm', 'warpLlm']) {
    const c = s[k];
    if (typeof c === 'function') return c as EntityDiveLlmFn;
  }
  return undefined;
}

export type EntityDiveRunDeps = {
  search?: (args: {
    query: string;
    depth: 'quick' | 'standard' | 'deep';
    numResults: number;
    language?: 'zh' | 'en' | 'all';
    extractContent: boolean;
  }) => Promise<{
    items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
    providers: string[];
    extractedContent?: Array<{
      url: string;
      title: string;
      content?: string;
      summary?: string;
      keyPoints?: string[];
    }>;
  }>;
  llm?: EntityDiveLlmFn;
};

async function defaultSearch(args: {
  query: string;
  depth: 'quick' | 'standard' | 'deep';
  numResults: number;
  language?: 'zh' | 'en' | 'all';
  extractContent: boolean;
}): Promise<{
  items: Array<{ title?: string; url?: string; snippet?: string; domain?: string }>;
  providers: string[];
  extractedContent?: Array<{
    url: string;
    title: string;
    content?: string;
    summary?: string;
    keyPoints?: string[];
  }>;
}> {
  const usable = await listUsableSearchProviderNames();
  if (usable.length === 0) {
    throw new ConfigurationError(
      'entityDive：当前无可用搜索引擎，请在 Admin 搜索配置中启用至少一个信息源'
    );
  }
  const searchService = new SearchService();
  const req = {
    query: args.query,
    dimensions: ['general', 'news', 'official'] as Array<'general' | 'news' | 'official'>,
    depth: args.depth,
    numResults: args.numResults,
    language: args.language,
    extractContent: args.extractContent,
    maxExtractCount: args.extractContent ? Math.min(args.numResults, 3) : undefined,
  };
  const result = args.extractContent
    ? await searchService.deepSearchWithExtract(req)
    : await searchService.deepSearch(req);
  const providers = [
    ...new Set(
      Object.values(result.dimensionResults)
        .map((r) => r?.provider)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
    ),
  ];
  return {
    items: result.aggregated ?? [],
    providers,
    extractedContent: result.extractedContent,
  };
}

/**
 * 汇总「已扒出来的内容」给 LLM 当输入：
 *  - sources.websource.items（pre 检索标题 + snippet）
 *  - sources.websource.extracted（全文 + 摘要）
 *  - enrich_search.result / result_supplement
 *  - state.coreArtifact.text（已生成文本，可作为补充语料）
 *  - params.main_topic / topic / core_topic（话题锚点）
 *
 * **完全业务无关**：不读 contract.business.* 任何特定 key
 */
function assembleRetrievedText(ctx: TaskContext, contract: MxmWarpContract): {
  text: string;
  topicHint: string;
} {
  const parts: string[] = [];
  let topicHint = '';

  const params = ctx.params as Record<string, unknown>;
  for (const k of ['main_topic', 'core_topic', 'topic', 'subject', 'industry_custom']) {
    const v = params[k];
    if (typeof v === 'string' && v.trim()) {
      topicHint = topicHint || v.trim();
      break;
    }
  }

  const ws = contract.sources?.websource;
  if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
    const o = ws as Record<string, unknown>;
    const query = typeof o.query === 'string' ? o.query.trim() : '';
    if (query) parts.push(`[检索 query] ${query}`);
    if (Array.isArray(o.items)) {
      for (const it of o.items.slice(0, 16)) {
        const x = it as Record<string, unknown>;
        const title = typeof x.title === 'string' ? x.title : '';
        const snippet = typeof x.snippet === 'string' ? x.snippet : '';
        if (title || snippet) parts.push(`- ${title}\n  ${snippet}`.trim());
      }
    }
    if (Array.isArray(o.extracted)) {
      for (const e of o.extracted.slice(0, 6)) {
        const x = e as Record<string, unknown>;
        const title = typeof x.title === 'string' ? x.title : '';
        const summary = typeof x.summary === 'string' ? x.summary : '';
        const kp = Array.isArray(x.keyPoints) ? x.keyPoints.join('；') : '';
        if (title || summary || kp) {
          parts.push(`【全文摘要】${title}\n${summary}${kp ? `\n要点：${kp}` : ''}`.trim());
        }
      }
    }
  }

  const enrich = contract.enrich_search ?? {};
  for (const k of ['result', 'result_supplement']) {
    const v = (enrich as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const query = typeof o.query === 'string' ? o.query.trim() : '';
      const text = typeof o.text === 'string' ? o.text : '';
      if (query || text) parts.push(`[enrich_search.${k}] ${query}\n${text}`.trim());
    }
  }

  const core = ctx.state.coreArtifact;
  if (core && typeof core === 'object' && (core as { text?: unknown }).text) {
    parts.push(
      `【已生成文本片段】\n${String((core as { text: unknown }).text).slice(0, 2000)}`
    );
  }

  return {
    text: parts.join('\n\n'),
    topicHint,
  };
}

export async function runEntityDiveStep(
  ctx: TaskContext,
  step: PipelineStep,
  deps?: EntityDiveRunDeps
): Promise<TaskContext> {
  const contract = getContract(ctx);
  if (!contract) {
    throw new ConfigurationError('entityDive：缺少 contract，先跑 input 段');
  }
  const params = (step.params ?? {}) as Record<string, unknown>;
  const maxEntities = clampInt(params.maxEntities, 3, 1, MAX_ENTITIES);
  const queriesPerEntity = clampInt(
    params.queriesPerEntity,
    DEFAULT_QUERIES_PER_ENTITY,
    1,
    MAX_QUERIES_PER_ENTITY
  );
  const depth = (() => {
    const d = String(params.depth ?? '').trim();
    return d === 'quick' || d === 'deep' ? d : 'standard';
  })();
  const maxResults = clampInt(params.maxResults, 8, 2, 20);
  const extractContent = params.extractContent === false ? false : true;
  const language = (() => {
    const l = String(params.language ?? '').trim();
    if (l === 'zh' || l === 'en' || l === 'all') return l;
    const p = String((ctx.params as Record<string, unknown>)?.language ?? '').trim();
    return p === 'en' || p === 'all' ? p : 'zh';
  })();

  const { text: sourceText, topicHint } = assembleRetrievedText(ctx, contract);

  // 1) LLM 一次性：抽实体 + 派生第二层查询
  if (sourceText.length < 40) {
    const empty: EntityDivePayload = {
      entities: [],
      records: [],
      generatedAt: new Date().toISOString(),
      diagnostics: {
        queriesGenerated: 0,
        providers: [],
      },
    };
    return withContract(ctx, {
      ...contract,
      enrich_search: { ...contract.enrich_search, entity_dive: empty },
    });
  }
  const planned = await defaultLlmPlan(ctx, sourceText, language, topicHint, deps?.llm);
  const entities: EntityDiveEntity[] = planned.slice(0, maxEntities).map((p) => ({
    name: p.name,
    kind: p.kind,
  }));
  if (entities.length === 0) {
    const empty: EntityDivePayload = {
      entities: [],
      records: [],
      generatedAt: new Date().toISOString(),
      diagnostics: {
        queriesGenerated: 0,
        providers: [],
        extractionModel: 'entity-dive.plan',
      },
    };
    return withContract(ctx, {
      ...contract,
      enrich_search: { ...contract.enrich_search, entity_dive: empty },
    });
  }

  const searchFn = deps?.search ?? defaultSearch;
  const allProviders = new Set<string>();
  const records: EntityDiveRecord[] = [];
  let totalQueries = 0;

  for (let i = 0; i < planned.length && records.length < maxEntities; i++) {
    const p = planned[i]!;
    const queries = p.queries.slice(0, queriesPerEntity);
    const evidences: EntityDiveEvidence[] = [];
    for (const q of queries) {
      totalQueries += 1;
      try {
        const r = await searchFn({
          query: q,
          depth,
          numResults: maxResults,
          language,
          extractContent,
        });
        for (const prov of r.providers) allProviders.add(prov);
        if (r.items.length === 0) {
          evidences.push({
            query: q,
            provider: r.providers.join(',') || 'unknown',
            hits: [],
          });
          continue;
        }
        const summary = r.extractedContent?.find((e) => e.summary)?.summary;
        const keyPoints = r.extractedContent
          ?.flatMap((e) => e.keyPoints ?? [])
          .slice(0, 6);
        evidences.push({
          query: q,
          provider: r.providers.join(',') || 'unknown',
          hits: r.items.slice(0, maxResults).map((it) => ({
            title: String(it.title ?? ''),
            url: String(it.url ?? ''),
            snippet: String(it.snippet ?? '').slice(0, 240),
            domain: String(it.domain ?? ''),
          })),
          summary,
          keyPoints,
        });
      } catch (err) {
        console.warn(
          `[entityDive] 实体 ${p.name} 子查询失败：${q}（${(err as Error).message}）`
        );
        evidences.push({ query: q, provider: 'failed', hits: [] });
      }
    }
    const status: EntityDiveRecord['status'] = evidences.some((e) => e.hits.length > 0)
      ? 'ok'
      : evidences.some((e) => e.provider !== 'failed')
        ? 'low_quality'
        : 'no_result';
    records.push({ entity: { name: p.name, kind: p.kind }, status, evidences });
  }

  const payload: EntityDivePayload = {
    entities,
    records,
    diagnostics: {
      queriesGenerated: totalQueries,
      providers: [...allProviders],
      extractionModel: 'entity-dive.plan',
    },
    generatedAt: new Date().toISOString(),
  };

  return withContract(ctx, {
    ...contract,
    enrich_search: { ...contract.enrich_search, entity_dive: payload },
  });
}

let registered = false;
export function registerEntityDiveStep(): void {
  if (registered) return;
  registered = true;
  const runner = async (ctx: TaskContext, step: PipelineStep) =>
    runEntityDiveStep(ctx, step);
  registerInputStep('entityDive', runner);
  registerOutputStep('entityDive', runner);
}

registerEntityDiveStep();