/**
 * 冒烟：audio/group/multi-voice 预填交互卡，跑到 enrich 人工审核（验证 claimPaths 硬门禁已过）。
 *
 *   cd mxmcgi && pnpm exec tsx src/scripts/smoke-audio-multi-voice.ts
 *
 * 可选：SMOKE_USER_ID / SMOKE_TIMEOUT_MS / SMOKE_STOP_AT_REVIEW=1（默认）
 */
import { createClient } from '@supabase/supabase-js';
import { loadMonorepoEnv, RepositoryFactory } from '@mxmai/mxmdata';
import { clearSearchProviderCooldowns } from '../core/search/search-config';
import { runTaskV2 } from '../tasks/task-engine';
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
RepositoryFactory.init();

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 600_000;
const POLL_MS = 3_000;
const STOP_AT_REVIEW = String(process.env.SMOKE_STOP_AT_REVIEW ?? '1') !== '0';
const FAILED_REF = process.env.SMOKE_SOURCE_TASK_ID || 'aad603f52b0b0d08425e3';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveUserId(): Promise<string> {
  if (process.env.SMOKE_USER_ID?.trim()) return process.env.SMOKE_USER_ID.trim();
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(process.env.SUPABASE_URL!, key!);
  const { data } = await sb.from('cgi_tasks').select('user_id').eq('id', FAILED_REF).maybeSingle();
  const uid = String((data as { user_id?: string } | null)?.user_id ?? '').trim();
  if (uid) return uid;
  // 本地开发常用测试用户
  return '8ee5db88-b157-4ce5-ab98-fcf7f2880f3b';
}

function buildParams(): Record<string, unknown> {
  return {
    source_material:
      '主持人：今天聊一下周末去哪玩。\n嘉宾：我觉得海边不错，晒太阳、走走。\n主持人：那交通呢？\n嘉宾：高铁两小时，挺方便。',
    dialogue_format: 'topic_discuss',
    speaker_count: 2,
    broadcast_style: 'chat_show',
    supplement: '冒烟测试，短稿即可',
    content_scan: {
      suggested_format: 'topic_discuss',
      suggested_speakers: 2,
      content_type: '闲聊',
      reason: '两人闲聊周末出行',
      suggested_broadcast_style: 'chat_show',
      alternatives: [],
    },
    cast: [
      {
        id: 'host',
        name: '主持人',
        roleHint: 'host',
        voice: { mode: 'system', voice_id: 'presenter_male', label: '男性主持人' },
        persona: '性格：活泼\n常用语气词：嗯\n口头语：你看',
      },
      {
        id: 'guest',
        name: '嘉宾',
        roleHint: 'guest',
        voice: { mode: 'system', voice_id: 'female-yujie', label: '御姐音色' },
        persona: '性格：沉稳\n常用语气词：哈哈\n口头语：其实',
      },
    ],
    label: `多人语音-smoke-${Date.now()}`,
  };
}

async function autoApproveTextReview(taskId: string): Promise<boolean> {
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
  const taskParams = task.requestParams as Record<string, any>;
  const bps = (taskParams?.businessPipelineState ?? {}) as Record<string, unknown>;
  const draft = bps.__pendingManualReviewDraft as { text?: string; json?: Record<string, unknown> } | undefined;
  const script =
    String(draft?.text ?? '').trim() ||
    String((bps.contract as any)?.business?.script_draft ?? '').trim() ||
    '【主持人】周末去哪玩？\n【嘉宾】海边不错。';

  const reviewPayload = {
    version: 1 as const,
    gateId,
    phase: (gateMeta?.phase ?? 'enrich') as 'pre' | 'enrich' | 'post',
    kind: 'text' as const,
    text: script,
    json: draft?.json ?? { script_draft: script },
    editable: true,
  };

  let reviewStep = null;
  const taskV2 = (taskParams.taskV2 ?? meta.taskV2) as
    | { scope?: string; taskKey?: string; subtype?: string | null }
    | undefined;
  if (taskV2?.scope && taskV2.taskKey && gateMeta) {
    const def = await loadTaskDefinition(
      taskV2.scope as any,
      taskV2.taskKey,
      taskV2.subtype ?? null
    );
    reviewStep = resolveManualReviewStepFromTemplate(def.taskTemplate, {
      phase: gateMeta.phase,
      stepIndex: gateMeta.stepIndex,
      gateId,
    });
  }

  await applyApprovedManualReview({
    taskId,
    userId: String(task.userId),
    review: reviewPayload,
    reviewStep: reviewStep ?? undefined,
  });
  await enqueueTaskWake(taskId);
  return true;
}

async function main() {
  const userId = await resolveUserId();
  const params = buildParams();
  console.log('[smoke-multi-voice] userId=', userId);
  console.log('[smoke-multi-voice] runTaskV2 …');

  const res = await runTaskV2(
    {
      scope: 'audio',
      taskKey: 'group',
      subtype: 'multi-voice',
      params,
      options: { async: true },
    },
    userId
  );
  const taskId = String((res as any)?.data?.taskId ?? (res as any)?.taskId ?? '').trim();
  if (!taskId) throw new Error(`无 taskId: ${JSON.stringify(res).slice(0, 400)}`);
  console.log('[smoke-multi-voice] taskId=', taskId);

  const taskManager = taskExecutor.getTaskManager();
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const { task } = await taskManager.getTask(taskId);
    const status = String(task.status);
    const err = String((task.progress as any)?.error ?? task.error ?? '').trim();
    console.log(`[smoke-multi-voice] status=${status} progress=${(task.progress as any)?.progress ?? '-'}`);

    if (err.includes('禁止整包') || err.includes('claimPaths')) {
      throw new Error(`claimPaths 门禁仍失败: ${err}`);
    }
    if (status === 'failed') {
      throw new Error(`任务失败: ${err || JSON.stringify(task.progress)}`);
    }
    if (status === 'awaiting_user_input' || status === 'awaiting_review') {
      const meta = task.metadata as Record<string, unknown>;
      const gateId = resolveGateIdFromTaskMetadata(meta);
      console.log('[smoke-multi-voice] gate=', gateId);
      if (STOP_AT_REVIEW && gateId === 'multi-voice-script-review') {
        console.log('[smoke-multi-voice] OK：已过 nestedText，停在台词本审核');
        process.exit(0);
      }
      await autoApproveTextReview(taskId);
      await sleep(POLL_MS);
      continue;
    }
    if (status === 'completed' || status === 'success') {
      console.log('[smoke-multi-voice] OK：任务完成');
      process.exit(0);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`超时 ${TIMEOUT_MS}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
