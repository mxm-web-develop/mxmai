import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { resolveGraphModel } from '../core/graph/graph-model-routing';
import { convertLegacyReferenceImage, processReferenceImages } from '../core/graph/reference-image';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
    path.resolve(projectRoot, 'mxmcgi', '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

function out(title: string, data: any) {
  console.log(`\n=== ${title} ===`);
  if (typeof data === 'string') console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

function normalizeGraphParams(input: any) {
  const inner = input?.params || {};
  const merged: any = { ...inner, ...input };
  delete merged.taskType;
  delete merged.graphType;
  delete merged.userId;
  delete merged.provider;
  if (merged.type === undefined || merged.type === null || merged.type === 'undefined' || merged.type === '') merged.type = null;
  return merged;
}

function parseTextFormatOutputFromGeneratedPrompt(generatedPrompt: string): string {
  const s = String(generatedPrompt || '');
  // 支持中文/英文拼接前缀
  const idxZh = s.lastIndexOf('\n生成：');
  const idxEn = s.lastIndexOf('\nGenerate:');
  const idx = Math.max(idxZh, idxEn);
  if (idx >= 0) {
    const marker = idx === idxZh ? '\n生成：' : '\nGenerate:';
    return s.slice(idx + marker.length).trim();
  }
  // 兜底：有些版本可能直接就是英文 prompt
  return s.trim();
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const taskId = process.argv[2];
  if (!taskId) {
    console.error('Usage: tsx src/scripts/print-task-text-and-graph-io.ts <taskId>');
    process.exit(1);
  }

  const repo = RepositoryFactory.createCGITaskRepository();
  const task: any = await repo.findById(taskId, true);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const input = task.input_data || {};
  const inner = input.params || {};
  const graphType = input.graphType || inner.graphType;
  let subType = inner.type ?? input.type ?? null;
  if (subType === undefined || subType === null || subType === 'undefined' || subType === '') subType = null;

  out('task.basic', {
    id: task.id,
    status: task.status,
    task_type: task.task_type,
    model_name: task.model_name,
    model_provider: task.model_provider,
    graphType,
    subType,
    created_at: task.created_at,
    updated_at: task.updated_at,
    result_format: task.result_format,
  });

  // ----- text/format (input -> output) -----
  const textFormatInput = String(input.prompt ?? inner.prompt ?? '');
  out('text.format.input (briefing sent to formatter)', textFormatInput);

  const finalPromptInMetadata = String(task.metadata?.generated_prompt || task.metadata?.generatedPrompt || '');
  out('graph.prompt.final (saved in task.metadata.generated_prompt)', finalPromptInMetadata);

  const textFormatOutput = parseTextFormatOutputFromGeneratedPrompt(finalPromptInMetadata);
  out('text.format.output (extracted final english prompt)', textFormatOutput);

  // ----- graph model call (input -> output) -----
  const graphParams = normalizeGraphParams(input);

  // reference images
  let refs: any[] = [];
  const rawRef = graphParams.referenceImage;
  if (rawRef) {
    if (typeof rawRef === 'string') refs = convertLegacyReferenceImage(rawRef);
    else if (Array.isArray(rawRef)) {
      if (rawRef.length && typeof rawRef[0] === 'string') refs = convertLegacyReferenceImage(rawRef);
      else refs = rawRef;
    } else refs = [rawRef];
  }

  const resolved = await resolveGraphModel(graphType, subType, (input.provider || task.model_provider || undefined) as any);
  out('graph.model.routing (resolved model/provider)', resolved);

  const modelName = (resolved as any).modelName as string;
  const pr = processReferenceImages(refs as any, modelName as any);

  const aspect_ratio = graphParams.aspect_ratio;
  const effectiveAspectRatio = aspect_ratio;

  // 最终“预计会传给生图模型”的入参形状（不触发真实调用）
  const imageParams: any = { prompt: finalPromptInMetadata || textFormatOutput };
  if (modelName === 'seedream-4' || modelName === 'seedream-5') {
    imageParams.size = graphParams.size ? String(graphParams.size).toLowerCase() : '4k';
    if (effectiveAspectRatio) {
      const pl = String(imageParams.prompt || '').toLowerCase();
      const hasAspect =
        pl.includes('aspect') ||
        pl.includes('ratio') ||
        pl.includes('比例') ||
        pl.includes('宽高比') ||
        pl.includes('16:9') ||
        pl.includes('9:16') ||
        pl.includes('1:1');
      if (!hasAspect) imageParams.prompt = String(imageParams.prompt) + `\n\n宽高比要求: ${effectiveAspectRatio}`;
    }
  } else {
    imageParams.aspect_ratio = effectiveAspectRatio;
    imageParams.image_size = '4K';
  }

  if (pr.urls.length === 1) imageParams.image_urls = pr.urls[0];
  else if (pr.urls.length > 1) imageParams.image_urls = pr.urls;
  if (pr.base64s.length === 1) imageParams.image = pr.base64s[0];
  else if (pr.base64s.length > 1) imageParams.image_base64s = pr.base64s;

  // 避免打印超长字段
  const imageParamsSummary = {
    keys: Object.keys(imageParams),
    promptPrefix: String(imageParams.prompt || '').slice(0, 400),
    aspect_ratio: imageParams.aspect_ratio,
    image_size: imageParams.image_size,
    size: imageParams.size,
    image_urls_count: Array.isArray(imageParams.image_urls) ? imageParams.image_urls.length : imageParams.image_urls ? 1 : 0,
    has_image: !!imageParams.image,
    has_image_base64s: !!imageParams.image_base64s,
  };
  out('graph.model.input (reconstructed params summary)', imageParamsSummary);

  out('graph.model.output (task.output_data + storage_info)', {
    output_data: task.output_data || null,
    storage_info: task.storage_info || null,
  });
}

main().catch((e) => {
  console.error('print failed:', e);
  process.exit(1);
});

