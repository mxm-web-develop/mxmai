/**
 * 自选话题真实跑 industry-daily，完成后走质量评估打分。
 *
 *   cd mxmcgi && pnpm exec tsx src/scripts/smoke-industry-daily-ai-eval.ts
 *
 * 环境变量：
 *   SMOKE_INDUSTRY=人工智能
 *   SMOKE_DATE_MODE=today|yesterday|this_week
 *   SMOKE_REGION=cn|global
 *   SMOKE_USER_ID=（默认取历史任务用户）
 */
import { createClient } from '@supabase/supabase-js';
import { Client as MinioClient } from 'minio';
import { loadMonorepoEnv, RepositoryFactory } from '@mxmai/mxmdata';
import { providerFactory } from '../core/providers';
import { SearchService } from '../core/search/search-service';
import { clearSearchProviderCooldowns } from '../core/search/search-config';
import { runTaskV2 } from '../tasks/task-engine';
import { previewIndustryDailyTopics } from '../tasks/mxm-warp/industry-daily-topics';
import { itemMatchesSelectedTopics } from '../tasks/mxm-warp/prune-to-selection';
import { extractTopicChipsViaTextBusiness } from '../tasks/websearch-topic-extract';
import {
  applyApprovedManualReview,
  resolveGateIdFromTaskMetadata,
  resolveManualReviewStepFromTemplate,
} from '../tasks/manual-review';
import { loadTaskDefinition } from '../tasks/task-definition';
import { enqueueTaskWake } from '../task/task-queue';
import { taskExecutor } from '../task/task-executor';
import { runQualityEval } from '../quality-eval/service';
import * as qualityEvalStore from '../quality-eval/store';
import type { QualityEvalDimension } from '../quality-eval/types';
import { industryDailyEvalDimensions } from '../quality-eval/eval-run-context';

loadMonorepoEnv({ service: 'mxmcgi' });
clearSearchProviderCooldowns();

const INDUSTRY = process.env.SMOKE_INDUSTRY || '人工智能';
const DATE_MODE = process.env.SMOKE_DATE_MODE || 'today';
const SEARCH_REGION = process.env.SMOKE_REGION || 'cn';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 1_800_000;
const POLL_MS = 5_000;
const FALLBACK_USER_TASK = '40cae40a9516133612e4e';

const DEFAULT_DIMS: QualityEvalDimension[] = industryDailyEvalDimensions();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeMarkdownArticle(t: string): boolean {
  const s = t.trim();
  if (!s || s.startsWith('{')) return false;
  return /^#\s/m.test(s) || /^##\s/m.test(s) || s.includes('\n## ');
}

function slimWebsource(websource: Record<string, unknown>, selectedRaw: string) {
  const selected = selectedRaw
    .split(/[；;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const items = Array.isArray(websource.items)
    ? (websource.items as Array<Record<string, unknown>>)
    : [];
  const kept =
    selected.length === 0
      ? []
      : items.filter((it) => itemMatchesSelectedTopics(it, selected));
  return {
    ...websource,
    items: kept,
    hitCount: kept.length,
    truncated: true,
    topicChips: selected,
    prunedToSelection: true,
    discoveryHitCount:
      typeof websource.hitCount === 'number' ? websource.hitCount : items.length,
  };
}

function isLowQualityTopicOrTitle(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 8) return true;
  // 频道/集合页当选题：几乎无法鉴真
  if (/cctv\.com|集合页|频道|_ 体育_|首页|导航/i.test(t)) return true;
  if (/^[^\u4e00-\u9fff]{0,6}$/.test(t)) return true;
  return false;
}

/** 从池里挑能剪出足够证据的话题 */
function pickTopicsWithEvidence(
  pool: string[],
  websource: Record<string, unknown>,
  maxTopics = 2,
  minItems = 2
): { coreTopic: string; mainTopic: string; slimmed: Record<string, unknown> } {
  const cleanPool = pool.filter((t) => !isLowQualityTopicOrTitle(t));
  const picked: string[] = [];
  let slimmed: Record<string, unknown> = slimWebsource(websource, '');
  for (const t of cleanPool) {
    const trial = [...picked, t].join('；');
    const next = slimWebsource(websource, trial);
    if ((next.items as unknown[]).length > (slimmed.items as unknown[]).length) {
      picked.push(t);
      slimmed = next;
      if (picked.length >= maxTopics && (slimmed.items as unknown[]).length >= minItems) break;
    } else if ((next.items as unknown[]).length >= minItems && picked.length === 0) {
      picked.push(t);
      slimmed = next;
    }
  }
  if ((slimmed.items as unknown[]).length < minItems) {
    const items = Array.isArray(websource.items)
      ? (websource.items as Array<Record<string, unknown>>)
      : [];
    // 优先有实质 path 的 URL 条目标题
    const ranked = [...items].sort((a, b) => {
      const ua = String(a.url || '');
      const ub = String(b.url || '');
      const score = (u: string) => (u.match(/\//g) || []).length + (/\d{4}|article|news|html/i.test(u) ? 3 : 0);
      return score(ub) - score(ua);
    });
    picked.length = 0;
    slimmed = slimWebsource(websource, '');
    for (const it of ranked.slice(0, 16)) {
      const title = String(it.title || '').trim();
      if (isLowQualityTopicOrTitle(title)) continue;
      const trial = [...picked, title.slice(0, 48)].join('；');
      const next = slimWebsource(websource, trial);
      if ((next.items as unknown[]).length > (slimmed.items as unknown[]).length) {
        picked.push(title.slice(0, 48));
        slimmed = next;
      }
      if ((slimmed.items as unknown[]).length >= minItems && picked.length >= 1) break;
    }
  }
  if (picked.length < 1 || (slimmed.items as unknown[]).length < 1) {
    throw new Error('无法从检索池选出能命中证据的话题');
  }
  if ((slimmed.items as unknown[]).length < minItems) {
    console.warn(
      `[smoke-ai-eval] 警告：剪枝后仅 ${(slimmed.items as unknown[]).length} 条证据（期望≥${minItems}），仍继续`
    );
  }
  const coreTopic = picked.join('；');
  return {
    coreTopic,
    mainTopic: picked[0]!,
    slimmed,
  };
}

async function resolveUserId(): Promise<string> {
  if (process.env.SMOKE_USER_ID?.trim()) return process.env.SMOKE_USER_ID.trim();
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data: hist } = await sb
    .from('cgi_tasks')
    .select('user_id')
    .eq('id', FALLBACK_USER_TASK)
    .maybeSingle();
  if (hist?.user_id) return String(hist.user_id);

  const { data: admin } = await sb
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (admin?.id) return String(admin.id);

  throw new Error('无法解析 userId：请设置 SMOKE_USER_ID');
}

async function fetchFinalMarkdown(task: any): Promise<string> {
  const out = task?.output_data ?? {};
  for (const c of [out?.text, out?.content, out?.markdown, out?.result?.text]) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  const storage = task?.storage_info as { bucket?: string; key?: string } | null;
  const mediaUrls: string[] = Array.isArray(out?.mediaUrls) ? out.mediaUrls : [];
  let bucket = storage?.bucket;
  let key = storage?.key;
  if ((!bucket || !key) && mediaUrls[0]) {
    const u = new URL(mediaUrls[0]);
    const parts = u.pathname.replace(/^\//, '').split('/');
    bucket = parts[0];
    key = parts.slice(1).join('/');
  }
  if (!bucket || !key) return '';

  const endPoint = (process.env.MINIO_ENDPOINT || 'localhost').replace(/^https?:\/\//, '');
  const client = new MinioClient({
    endPoint,
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
  const stream = await client.getObject(bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function autoResumeIfGate(taskId: string, formParams: Record<string, any>) {
  const taskManager = taskExecutor.getTaskManager();
  const { task } = await taskManager.getTask(taskId);
  const status = String(task.status);
  if (status !== 'awaiting_user_input' && status !== 'awaiting_review') return false;

  const meta = task.metadata as Record<string, unknown>;
  const gateId = resolveGateIdFromTaskMetadata(meta);
  if (!gateId) throw new Error(`闸门无 gateId status=${status}`);

  const gateMeta = meta.manualReviewGate as
    | { phase?: 'pre' | 'enrich' | 'post'; kind?: string; stepIndex?: number }
    | undefined;
  const kind = (gateMeta?.kind || 'interactive-card') as
    | 'interactive-card'
    | 'basic-form'
    | 'json'
    | 'text';

  const reviewJson = {
    industry: formParams.industry,
    search_region: formParams.search_region,
    date_mode: formParams.date_mode,
    language: formParams.language || 'zh',
    subjective_analysis: formParams.subjective_analysis,
    analysis_stance: formParams.analysis_stance,
    core_topic: formParams.core_topic,
    main_topic: formParams.main_topic,
    article_length: formParams.article_length ?? 'standard',
  };

  const reviewPayload = {
    version: 1 as const,
    gateId,
    phase: (gateMeta?.phase ?? 'pre') as 'pre' | 'enrich' | 'post',
    kind: (kind === 'text' ? 'json' : kind) as 'interactive-card' | 'basic-form' | 'json',
    json: reviewJson,
    text: String(formParams.core_topic || JSON.stringify(reviewJson)),
    editable: true,
  };

  let reviewStep = null;
  const taskParams = task.requestParams as Record<string, any>;
  const taskV2 = (taskParams.taskV2 ?? meta.taskV2) as
    | { scope?: string; taskKey?: string; subtype?: string | null }
    | undefined;
  if (taskV2?.scope && taskV2.taskKey && gateMeta) {
    const { row, template } = await loadTaskDefinition({
      scope: taskV2.scope as any,
      taskKey: taskV2.taskKey,
      subtype: taskV2.subtype ?? null,
    });
    reviewStep = resolveManualReviewStepFromTemplate(
      template,
      taskV2.scope,
      gateMeta as any,
      (row.extra ?? null) as Record<string, unknown> | null
    );
  }

  const nextParams = applyApprovedManualReview(
    taskParams,
    reviewPayload as any,
    reviewStep,
    task.type
  );
  await taskManager.updateTaskRequestParams(taskId, nextParams);
  const storage = (taskManager as any).storage;
  if (storage) {
    await storage.update(taskId, { metadata: { ...meta, manualReviewGate: undefined } });
  }
  const phase = gateMeta?.phase ?? 'pre';
  await taskManager.updateTaskStatus(taskId, 'pending', {
    progress: phase === 'post' ? 88 : 0,
    logs: [`[smoke-ai-eval] auto-approved gate ${gateId} (${kind})`],
    error: undefined,
  });
  await enqueueTaskWake(taskId);
  console.log(`[smoke-ai-eval] resumed gate ${gateId} kind=${kind} phase=${phase}`);
  return true;
}

async function ensureRubric() {
  const rubric = await qualityEvalStore.upsertRubric({
    scope: 'writing',
    task_key: 'generator',
    subtype: 'industry-daily',
    dimensions: DEFAULT_DIMS,
    business_brief:
      '行业日报：屏幕可读 Markdown 报道体；事实优先、来源可核。评分必须相对用户选项：article_length 篇幅带、subjective_analysis/analysis_stance 文风、语感文风包。幽默开则语法/自然度按诙谐稿评判；关分析则禁止研报腔小结。不要求文末参考来源链接列表。',
    provider: 'atlascloud',
    model_key: 'openai/gpt-5.6-terra',
    auto_on_complete: false,
    is_active: true,
  });
  console.log(`[smoke-ai-eval] rubric upserted id=${rubric.id}`);
  return rubric;
}

async function main() {
  RepositoryFactory.init();
  await providerFactory.loadProviderCatalog();
  await ensureRubric();

  const userId = await resolveUserId();
  console.log(
    JSON.stringify(
      {
        industry: INDUSTRY,
        date_mode: DATE_MODE,
        search_region: SEARCH_REGION,
        userId,
      },
      null,
      2
    )
  );

  const service = new SearchService();
  console.log('[smoke-ai-eval] 真实检索 + 热点提炼 …');
  const preview = await previewIndustryDailyTopics(
    {
      industry: INDUSTRY,
      dateMode: DATE_MODE,
      searchRegion: SEARCH_REGION,
      language: 'zh',
      maxResults: 100,
      topicCount: 40,
      userId,
    },
    async (args) => {
      const r = await service.deepSearch({
        query: args.query,
        dimensions: args.dimensions,
        depth: args.depth,
        numResults: args.numResults,
        timeRange: args.timeRange,
        startDate: args.startDate,
        endDate: args.endDate,
        includeDomains: args.includeDomains,
        language: args.language,
      });
      const providers = [
        ...new Set(
          (r.aggregated ?? [])
            .map((it) => String((it as { source?: string }).source ?? '').trim())
            .filter(Boolean)
        ),
      ];
      return {
        aggregated: r.aggregated ?? [],
        providers,
        depth: String(r.depth ?? args.depth),
      };
    },
    {
      extractTopics: async ({ items, industry, ymd, dateLabel, query, maxTopics, language }) => {
        const extracted = await extractTopicChipsViaTextBusiness({
          textKey: 'text/expert/industry-hot-topics',
          userId,
          industry,
          ymd,
          dateLabel,
          language: language || 'zh',
          websource: { query, hitCount: items.length, items },
          maxTopics,
          maxInputItems: Math.min(items.length, 80),
        });
        console.log(
          `[smoke-ai-eval] 热点提炼 ${extracted.topics.length} 条 taskId=${extracted.textTaskId}`
        );
        return extracted.topics;
      },
    }
  );

  console.log(
    `[smoke-ai-eval] 检索 hitCount=${preview.hitCount} pool=${preview.topicPool.length} chips=${preview.topicChips.length} providers=${(preview.providers || []).join(',')}`
  );
  if (preview.hitCount < 1 || preview.items.length < 1) {
    throw new Error(`检索无可用条目 hitCount=${preview.hitCount}`);
  }

  const pool = [
    ...new Set(
      [...(preview.topicPool || []), ...(preview.topicChips || [])]
        .map((t) => String(t ?? '').trim())
        .filter(Boolean)
    ),
  ];
  console.log('[smoke-ai-eval] 话题池前 8:', pool.slice(0, 8));

  const websource = {
    query: preview.query,
    depth: preview.depth,
    providers: preview.providers,
    hitCount: preview.hitCount,
    truncated: preview.truncated,
    text: preview.text,
    items: preview.items,
    topicChips: preview.topicChips,
    topicPool: preview.topicPool,
  };

  const maxTopics = Math.max(1, Math.min(5, Number(process.env.SMOKE_MAX_TOPICS) || 3));
  const { coreTopic, mainTopic, slimmed } = pickTopicsWithEvidence(pool, websource, maxTopics, 2);
  if ((slimmed.items as unknown[]).length < 2) {
    throw new Error(
      `选题证据不足 items=${(slimmed.items as unknown[]).length}（本地选题剪枝后为空）；换行业或日期再试`
    );
  }
  console.log(
    `[smoke-ai-eval] 选定话题(${maxTopics}) main=${mainTopic} | core=${coreTopic.slice(0, 200)} | items=${(slimmed.items as unknown[]).length}`
  );

  const subjectiveRaw = String(process.env.SMOKE_SUBJECTIVE_ANALYSIS ?? 'false').trim().toLowerCase();
  const subjectiveOn = ['1', 'true', 'yes', 'on'].includes(subjectiveRaw);
  const analysisStance = String(
    process.env.SMOKE_ANALYSIS_STANCE || (subjectiveOn ? '基于数据客观分析' : '')
  ).trim();

  const formParams = {
    industry: INDUSTRY,
    search_region: SEARCH_REGION,
    date_mode: DATE_MODE,
    article_length: process.env.SMOKE_ARTICLE_LENGTH || 'brief',
    language: 'zh',
    subjective_analysis: subjectiveOn,
    analysis_stance: analysisStance,
    core_topic: coreTopic,
    main_topic: mainTopic,
  };
  console.log(
    `[smoke-ai-eval] form article_length=${formParams.article_length} subjective=${subjectiveOn} stance=${analysisStance || '—'}`
  );

  const params: Record<string, unknown> = {
    label: `【smoke-ai-eval】${INDUSTRY}·${DATE_MODE}`,
    ...formParams,
    search_track: preview.search_track,
    sources: { websource: slimmed },
    __adminPipelineDebug: true,
    adminPipelineDebug: true,
  };

  console.log('[smoke-ai-eval] runTaskV2 …');
  const res = await runTaskV2(
    {
      scope: 'writing',
      taskKey: 'generator',
      subtype: 'industry-daily',
      params,
      options: { adminPipelineDebug: true },
    } as any,
    userId
  );

  const taskId = (res as any).taskId as string;
  console.log('[smoke-ai-eval] created taskId=', taskId);
  if (!taskId) throw new Error('未返回 taskId');

  const repo = RepositoryFactory.createCGITaskRepository();
  const deadline = Date.now() + TIMEOUT_MS;
  let last = '';
  let finalText = '';

  while (Date.now() < deadline) {
    const task = await repo.findById(taskId, true);
    const status = String(task?.status || '');
    if (status !== last) {
      console.log(
        `[smoke-ai-eval] ${new Date().toISOString()} status=${status} progress=${(task as any)?.progress} err=${(task as any)?.error_message || ''}`
      );
      last = status;
    }

    if (status === 'awaiting_user_input' || status === 'awaiting_review') {
      await autoResumeIfGate(taskId, formParams);
      await sleep(2500);
      continue;
    }

    if (status === 'completed') {
      finalText = await fetchFinalMarkdown(task);
      console.log('\n======== FINAL (head 1200) ========\n');
      console.log(finalText.slice(0, 1200));
      console.log('\n======== FINAL (tail 400) ========\n');
      console.log(finalText.slice(-400));
      if (!finalText.trim()) throw new Error('终稿为空');
      if (!looksLikeMarkdownArticle(finalText)) {
        throw new Error(`终稿不像 Markdown head=${finalText.slice(0, 180)}`);
      }
      break;
    }

    if (status === 'failed' || status === 'network_error' || status === 'cancelled') {
      throw new Error(`任务失败: ${(task as any)?.error_message || status}`);
    }

    await sleep(POLL_MS);
  }

  if (!finalText) throw new Error('timeout waiting for manuscript');

  console.log('[smoke-ai-eval] 开始质量评估 …');
  const evalRun = await runQualityEval({
    scope: 'writing',
    taskKey: 'generator',
    subtype: 'industry-daily',
    sourceKind: 'task',
    sourceRef: { taskId },
    createdBy: userId,
  });

  const scores = evalRun.scores;
  const summary = {
    ok: evalRun.status === 'completed',
    taskId,
    evalRunId: evalRun.id,
    industry: INDUSTRY,
    coreTopic,
    manuscriptChars: finalText.length,
    overall: scores?.overall ?? null,
    articleTypeFit: scores?.articleTypeFit ?? null,
    summary: scores?.summary ?? null,
    dimensions: (scores?.dimensions || []).map((d) => ({
      key: d.key,
      label: d.label,
      score: d.score,
      failed: d.failed,
      comment: d.comment,
    })),
    attributionSummary: evalRun.attribution?.summary ?? null,
    evalError: evalRun.error,
  };

  console.log('\n======== QUALITY EVAL ========\n');
  console.log(JSON.stringify(summary, null, 2));

  if (evalRun.status !== 'completed' || scores == null) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[smoke-ai-eval] fatal', e);
  process.exit(1);
});
