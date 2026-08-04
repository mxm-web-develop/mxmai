/**
 * 真实回放：按 Admin 最近失败单 40cae40a9516133612e4e 的历史参数跑 industry-daily。
 * 含真实联网检索 + 热点提炼 + 历史选题 + 全管线，验收 Markdown 成稿。
 *
 *   cd mxmcgi && pnpm exec tsx src/scripts/smoke-industry-daily.ts
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

loadMonorepoEnv({ service: 'mxmcgi' });
clearSearchProviderCooldowns();

const SOURCE_TASK_ID = process.env.SMOKE_SOURCE_TASK_ID || '40cae40a9516133612e4e';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 1_800_000;
const POLL_MS = 5_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeExpertJson(t: string): boolean {
  const s = t.trim();
  return (
    s.startsWith('{') &&
    (s.includes('"body_sections"') ||
      s.includes('"evidence_refs"') ||
      s.includes('"analysis_beats"') ||
      s.includes('"report_title"'))
  );
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

async function loadHistoricalInput() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data, error } = await sb.from('cgi_tasks').select('*').eq('id', SOURCE_TASK_ID).single();
  if (error || !data) throw new Error(`找不到历史任务 ${SOURCE_TASK_ID}: ${error?.message}`);
  const input = (data.input_data || {}) as Record<string, any>;
  return { userId: String(data.user_id), params: (input.params || {}) as Record<string, any> };
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

async function autoResumeIfGate(taskId: string, histParams: Record<string, any>) {
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
    industry: histParams.industry,
    search_region: histParams.search_region,
    date_mode: histParams.date_mode,
    language: histParams.language || 'zh',
    subjective_analysis: histParams.subjective_analysis,
    analysis_stance: histParams.analysis_stance,
    core_topic: histParams.core_topic,
    main_topic: histParams.main_topic,
    article_length: histParams.article_length ?? 'standard',
  };

  const reviewPayload = {
    version: 1 as const,
    gateId,
    phase: (gateMeta?.phase ?? 'pre') as 'pre' | 'enrich' | 'post',
    kind: (kind === 'text' ? 'json' : kind) as 'interactive-card' | 'basic-form' | 'json',
    json: reviewJson,
    text: String(histParams.core_topic || JSON.stringify(reviewJson)),
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
    logs: [`[smoke] auto-approved gate ${gateId} (${kind})`],
    error: undefined,
  });
  await enqueueTaskWake(taskId);
  console.log(`[smoke] resumed gate ${gateId} kind=${kind} phase=${phase}`);
  return true;
}

async function main() {
  RepositoryFactory.init();
  await providerFactory.loadProviderCatalog();

  const hist = await loadHistoricalInput();
  const { userId, params: hp } = hist;

  console.log('[smoke] 历史参数来源', SOURCE_TASK_ID);
  console.log(
    JSON.stringify(
      {
        userId,
        industry: hp.industry,
        search_region: hp.search_region,
        date_mode: hp.date_mode,
        article_length: hp.article_length ?? 'standard',
        language: hp.language,
        subjective_analysis: hp.subjective_analysis,
        analysis_stance: hp.analysis_stance,
        core_topic: hp.core_topic,
        main_topic: hp.main_topic,
      },
      null,
      2
    )
  );

  const service = new SearchService();
  console.log('[smoke] 真实检索 + 热点提炼 …');
  const preview = await previewIndustryDailyTopics(
    {
      industry: String(hp.industry),
      dateMode: String(hp.date_mode || 'this_week'),
      searchRegion: String(hp.search_region || 'cn'),
      language: String(hp.language || 'zh'),
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
        console.log(`[smoke] 热点提炼 ${extracted.topics.length} 条 taskId=${extracted.textTaskId}`);
        return extracted.topics;
      },
    }
  );

  console.log(
    `[smoke] 检索 hitCount=${preview.hitCount} pool=${preview.topicPool.length} chips=${preview.topicChips.length} providers=${(preview.providers || []).join(',')}`
  );
  if (preview.hitCount < 1 || preview.items.length < 1) {
    throw new Error(
      `检索无可用条目 hitCount=${preview.hitCount}（需至少 1 条才能真实跑通；检查 Provider 兜底）`
    );
  }

  // 表单参数沿用历史；选题必须能在本次检索池里剪出证据，否则改用本轮真实热点（模拟用户从 chips 点选）
  const histCore = String(hp.core_topic || '');
  const histMain = String(hp.main_topic || '');
  const pool = [
    ...new Set(
      [...(preview.topicPool || []), ...(preview.topicChips || [])]
        .map((t) => String(t ?? '').trim())
        .filter(Boolean)
    ),
  ];
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

  let coreTopic = histCore;
  let mainTopic = histMain;
  let slimmed = slimWebsource(websource, coreTopic);
  let topicMode: 'historical' | 'fresh-pool' = 'historical';

  if ((slimmed.items as unknown[]).length < 1) {
    const pick = pool.slice(0, Math.min(3, Math.max(1, pool.length)));
    if (pick.length < 1) {
      throw new Error('话题池为空，无法选题');
    }
    coreTopic = pick.join('；');
    mainTopic = pick[0]!;
    slimmed = slimWebsource(websource, coreTopic);
    topicMode = 'fresh-pool';
    console.warn(
      `[smoke] 历史选题在本轮检索中无命中条目，改用本轮热点选题（${pick.length} 条）：${coreTopic.slice(0, 120)}`
    );
  }

  console.log(
    `[smoke] 选题模式=${topicMode} 剪枝后 items=${(slimmed.items as unknown[]).length}（discovery=${preview.hitCount}）`
  );
  if ((slimmed.items as unknown[]).length < 1) {
    throw new Error('剪枝后仍无检索条目，拒绝空证据开跑');
  }

  const params: Record<string, unknown> = {
    label: `【smoke】影视综·${topicMode}`,
    industry: hp.industry,
    search_region: hp.search_region,
    date_mode: hp.date_mode,
    article_length: String(hp.article_length ?? 'standard'),
    language: hp.language || 'zh',
    subjective_analysis: hp.subjective_analysis,
    analysis_stance: hp.analysis_stance,
    core_topic: coreTopic,
    main_topic: mainTopic,
    search_track: preview.search_track || hp.search_track,
    sources: { websource: slimmed },
    __adminPipelineDebug: true,
    adminPipelineDebug: true,
  };

  console.log('[smoke] runTaskV2 …');
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
  console.log('[smoke] created taskId=', taskId);
  if (!taskId) throw new Error('未返回 taskId');

  const repo = RepositoryFactory.createCGITaskRepository();
  const deadline = Date.now() + TIMEOUT_MS;
  let last = '';

  while (Date.now() < deadline) {
    const task = await repo.findById(taskId, true);
    const status = String(task?.status || '');
    if (status !== last) {
      console.log(
        `[smoke] ${new Date().toISOString()} status=${status} progress=${(task as any)?.progress} err=${(task as any)?.error_message || ''}`
      );
      last = status;
    }

    if (status === 'awaiting_user_input' || status === 'awaiting_review') {
      await autoResumeIfGate(taskId, {
        ...hp,
        core_topic: coreTopic,
        main_topic: mainTopic,
      });
      await sleep(2500);
      continue;
    }

    if (status === 'completed') {
      const text = await fetchFinalMarkdown(task);
      console.log('\n======== FINAL (head 1500) ========\n');
      console.log(text.slice(0, 1500));
      console.log('\n======== FINAL (tail 500) ========\n');
      console.log(text.slice(-500));
      if (!text.trim()) throw new Error('终稿为空');
      if (looksLikeExpertJson(text)) throw new Error('终稿仍是 expert JSON');
      if (!looksLikeMarkdownArticle(text)) {
        throw new Error(`终稿不像 Markdown 报道 head=${text.slice(0, 180)}`);
      }
      if (text.length < 600) throw new Error(`终稿过短 chars=${text.length}`);
      if (/enrich检索未返回可验证/.test(text)) {
        throw new Error('终稿自陈无独立来源——检索/深挖未真正喂到成稿');
      }
      const { looksLikeLlmScratchpad } = await import('../tasks/llm-output-hygiene');
      if (looksLikeLlmScratchpad(text)) {
        throw new Error('终稿是模型英文思考草稿，不是可读报道');
      }
      const h2 = (text.match(/^##\s/gm) || []).length;
      if (h2 < 1) throw new Error('终稿缺少 ## 章节');
      console.log(
        JSON.stringify(
          {
            ok: true,
            taskId,
            chars: text.length,
            h2,
            topicMode,
            prunedItems: (slimmed.items as unknown[]).length,
            sourceTask: SOURCE_TASK_ID,
          },
          null,
          2
        )
      );
      process.exit(0);
    }

    if (status === 'failed' || status === 'network_error' || status === 'cancelled') {
      console.error('[smoke] FAILED', (task as any)?.error_message);
      process.exit(1);
    }

    await sleep(POLL_MS);
  }

  throw new Error('timeout');
}

main().catch((e) => {
  console.error('[smoke] fatal', e);
  process.exit(1);
});
