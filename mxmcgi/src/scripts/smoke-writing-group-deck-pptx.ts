/**
 * 冒烟：跳过 LLM，直接跑 renderPptx → MinIO presentationStorage 落库。
 *
 *   cd mxmcgi && pnpm exec tsx src/scripts/smoke-writing-group-deck-pptx.ts
 *
 * 可选：
 *   SMOKE_USER_ID=...  （默认用 .env 里的测试用户或 a32b…）
 *   PPTX_COMPILER_URL=http://127.0.0.1:4010
 */
import dotenv from 'dotenv';
import { join } from 'path';
import { writeFileSync } from 'fs';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');
process.env.DOTENV_CONFIG_DEBUG = 'false';
dotenv.config({ path: join(MXMCGI_ROOT, '.env'), override: false });
dotenv.config({ path: join(PROJECT_ROOT, '.env'), override: false });

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('缺少 SUPABASE_URL / SUPABASE_ANON_KEY');
  }
  if (!process.env.PPTX_COMPILER_URL) {
    process.env.PPTX_COMPILER_URL = 'http://127.0.0.1:4010';
  }

  const { RepositoryFactory } = await import('@mxmai/mxmdata');
  const { runRenderPptxStep } = await import('../core/presentation/render-pptx-step');
  const { attachPresentationSidecarToWritingResult } = await import(
    '../core/writing/writing-task'
  );

  RepositoryFactory.init();

  const userId =
    process.env.SMOKE_USER_ID?.trim() ||
    process.env.DEV_USER_ID?.trim() ||
    'a32b2843-6c58-4dc9-8ce3-335471ca196b';
  const taskId = `smoke-deck-pptx-${Date.now().toString(36)}`;

  const slides = [
    {
      id: 's1',
      order: 1,
      role: 'cover',
      title: '演示文稿冒烟',
      subtitle: 'PPTX 落库验证',
      bullets: ['编译服务', 'MinIO sidecar', 'resultKind=presentation-deck'],
    },
    {
      id: 's2',
      order: 2,
      role: 'content',
      title: '语义澄清',
      bullets: ['学术语义与通俗语义', '版式密度与行高', '页码与引用区隔'],
    },
    {
      id: 's3',
      order: 3,
      role: 'content',
      title: '落地检查',
      body: '确认 presentationStorage.key 可读且文件头为 PK（zip/pptx）。',
    },
  ];

  const ctx = {
    scope: 'writing',
    taskKey: 'group',
    subtype: 'deck',
    userId,
    taskId,
    params: {},
    state: {
      contract: {
        basic: {
          title: '演示文稿冒烟',
          usage_direction: 'product_handbook',
        },
        business: {
          slides,
          visual_system: {
            palette: {
              background: '#0F172A',
              foreground: '#F8FAFC',
              accent: '#C43E1C',
              muted: '#94A3B8',
            },
            ratio: '16:9',
          },
        },
      },
      coreArtifact: {
        kind: 'text' as const,
        text: '# 演示文稿冒烟\n\n1. 语义澄清\n2. 落地检查\n',
        metadata: {
          resultKind: 'writing-collection',
          collectionTitle: '演示文稿冒烟',
          collectionItemCount: slides.length,
          collectionReadyCount: slides.length,
          collectionResult: {
            title: '演示文稿冒烟',
            itemCount: slides.length,
            items: slides.map((s, i) => ({
              id: s.id,
              order: i,
              title: s.title,
              status: 'ready',
              manuscript: `# ${s.title}\n`,
            })),
          },
        },
      },
    },
  };

  console.log(`[smoke-deck-pptx] compiler=${process.env.PPTX_COMPILER_URL}`);
  console.log(`[smoke-deck-pptx] userId=${userId} taskId=${taskId}`);

  const health = await fetch(`${process.env.PPTX_COMPILER_URL!.replace(/\/$/, '')}/health`);
  if (!health.ok) throw new Error(`pptx compiler health ${health.status}`);
  console.log('[smoke-deck-pptx] compiler health', await health.json());

  const out = await runRenderPptxStep(ctx, {
    step: 'renderPptx',
    params: { failSoft: false, maxPages: 16 },
  });

  const storage = out.state.presentationStorage as
    | { key?: string; bucket?: string; url?: string }
    | undefined;
  const status = out.state.renderPptxStatus;
  console.log('[smoke-deck-pptx] renderPptxStatus=', status);
  console.log('[smoke-deck-pptx] presentationStorage=', storage);

  if (status !== 'ok' || !storage?.key || !storage.bucket) {
    throw new Error(
      `renderPptx 未落库：status=${status} error=${String(out.state.renderPptxError ?? '')}`
    );
  }

  const repo = RepositoryFactory.createStorageRepository();
  const buf = await repo.downloadFile(storage.bucket, storage.key);
  if (!buf || buf.length < 64) throw new Error('下载的 PPTX 过小或为空');
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error(`PPTX 魔数异常：期望 PK，收到 ${buf.subarray(0, 4).toString('hex')}`);
  }

  const localOut = join(PROJECT_ROOT, 'artifacts', `smoke-deck-${Date.now()}.pptx`);
  try {
    writeFileSync(localOut, buf);
    console.log(`[smoke-deck-pptx] wrote local copy ${localOut} (${buf.length} bytes)`);
  } catch {
    console.log(`[smoke-deck-pptx] pptx bytes=${buf.length} (skip local write)`);
  }

  const attached = attachPresentationSidecarToWritingResult(
    {
      text: '# deck',
      format: 'markdown',
      metadata: {
        ...(out.state.coreArtifact as { metadata?: Record<string, unknown> })?.metadata,
      },
    },
    out.state as Record<string, unknown>
  );
  console.log('[smoke-deck-pptx] attached metadata=', {
    resultKind: attached.metadata?.resultKind,
    reading_format: attached.metadata?.reading_format,
    presentationRenderStatus: attached.metadata?.presentationRenderStatus,
    presentationSlideCount: attached.metadata?.presentationSlideCount,
    presentationStorage: attached.metadata?.presentationStorage,
  });

  if (attached.metadata?.resultKind !== 'presentation-deck') {
    throw new Error('attachPresentationSidecar 未设置 resultKind=presentation-deck');
  }

  // 写入一条已完成 writing 任务，便于前端列表直接点开验证（避免 createTask 入队被 worker 抢走）
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const label = `演示文稿-smoke_${stamp}`;
  const uiTaskId = `smoke${stamp}`.slice(0, 21);
  const now = new Date().toISOString();
  const outputData = {
    text: '# 演示文稿冒烟\n\n1. 语义澄清\n2. 落地检查\n',
    format: 'markdown',
    metadata: {
      ...(attached.metadata as Record<string, unknown>),
      type: 'group',
      mxmWarp: true,
      label,
      collectionTitle: '演示文稿冒烟',
      collectionItemCount: slides.length,
      collectionReadyCount: slides.length,
      collectionTeasers: slides.map((s) => ({ id: s.id, title: s.title })),
      collectionResult: {
        title: '演示文稿冒烟',
        itemCount: slides.length,
        items: slides.map((s, i) => ({
          id: s.id,
          order: i,
          title: s.title,
          status: 'ready',
          manuscript: `# ${s.title}\n`,
        })),
      },
    },
  };
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
  );
  const row = {
    id: uiTaskId,
    user_id: userId,
    task_type: 'writing',
    model_name: 'MiniMax-M3',
    model_provider: 'maxplan',
    status: 'completed',
    progress: 100,
    prompt: 'smoke deck pptx',
    input_data: {
      params: {
        taskV2: { scope: 'writing', taskKey: 'group', subtype: 'deck' },
        smoke: true,
      },
    },
    output_data: outputData,
    result_format: 'markdown',
    queued_at: now,
    started_at: now,
    completed_at: now,
    created_at: now,
    updated_at: now,
    metadata: {
      label,
      taskLabel: label,
      userId,
      taskV2: { scope: 'writing', taskKey: 'group', subtype: 'deck' },
      subtypeLabel: '演示文稿',
      typeLabel: '方案',
      creationSource: 'smoke',
      writingBusinessType: 'group',
      listContentPreview: slides.map((s, i) => `${i + 1}. ${s.title}`).join('\n'),
      resultKind: 'presentation-deck',
      reading_format: 'pptx',
      presentationStorage: storage,
      presentationRenderStatus: 'ok',
      presentationSlideCount: slides.length,
      collectionTitle: '演示文稿冒烟',
      collectionItemCount: slides.length,
      collectionReadyCount: slides.length,
      collectionTeasers: slides.map((s) => ({ id: s.id, title: s.title })),
    },
  };
  console.log('[smoke-deck-pptx] inserting UI task', uiTaskId, 'input_data keys', Object.keys(row.input_data));
  const { error: upsertErr, data: upsertData } = await sb.from('cgi_tasks').insert(row).select('id');
  if (upsertErr) {
    console.warn('[smoke-deck-pptx] UI 任务写入失败:', upsertErr.message, upsertErr);
  } else {
    console.log(`[smoke-deck-pptx] UI task completed id=${uiTaskId} label=${label}`, upsertData);
  }

  console.log('\n✅ smoke-writing-group-deck-pptx OK');
  console.log(`   bucket=${storage.bucket}`);
  console.log(`   key=${storage.key}`);
  console.log(`   url=${storage.url ?? '(none)'}`);
  console.log(`   size=${buf.length}`);
  if (!upsertErr) console.log(`   taskId=${uiTaskId}`);
}

main().catch((e) => {
  console.error('\n❌ smoke-writing-group-deck-pptx FAILED');
  console.error(e);
  process.exit(1);
});
