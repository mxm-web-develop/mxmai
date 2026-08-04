/**
 * 1) 为 audio / music / video 各 upsert 一条启用的 Task v2 配置（extra.taskTemplate + formSchema + unifiedTemplate）。
 * 2) 扫描 writing / graph 下无法通过 loadTaskDefinition 的行，从同 scope+type 的完整行克隆 taskTemplate，否则写入最小可用模板。
 *
 * 依赖 mxmdata/.env（或仓库根 .env）中的 Supabase 配置。
 *
 *   pnpm --filter @mxmai/mxmcgi run seed:task-v2-media
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PromptEngineeringConfig } from '@mxmai/mxmdata';
import { loadTaskDefinition } from '../tasks/task-definition';
import type { TaskScope } from '../tasks/types';
import type { TaskTemplate } from '../tasks/types';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');
dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, 'mxmdata', '.env') });

const SCOPES: TaskScope[] = ['writing', 'outline', 'graph', 'audio', 'music', 'video'];

function asTaskScope(s: string): TaskScope | null {
  return SCOPES.includes(s as TaskScope) ? (s as TaskScope) : null;
}

function cloneTemplate(t: TaskTemplate): TaskTemplate {
  return JSON.parse(JSON.stringify(t)) as TaskTemplate;
}

/** music：路由 music-default */
function seedMusicDefault(): TaskTemplate {
  return {
    formSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          title: '音乐描述 / 歌词意向',
          minLength: 1,
          'x-user-visible': true,
        },
        title: { type: 'string', title: '曲名（可选）', 'x-user-visible': true },
        tags: { type: 'string', title: '风格标签（可选）', 'x-user-visible': true },
        make_instrumental: { type: 'boolean', title: '纯器乐', default: false, 'x-user-visible': true },
        total_duration_seconds: {
          type: 'integer',
          title: '预估时长（秒，计费参考）',
          minimum: 1,
          default: 60,
          'x-user-visible': false,
        },
        label: { type: 'string', title: '任务名称', 'x-user-visible': true },
        uid: { type: 'string', title: '任务 UID', 'x-user-visible': false },
      },
      required: ['prompt', 'uid'],
    },
    prompt: {
      unifiedTemplate:
        '请根据以下描述生成音乐。\n\n主题/歌词意向：${prompt}\n曲名：${title}\n风格标签：${tags}\n纯器乐：${make_instrumental}',
      unifiedTemplateMarkup:
        '请根据以下描述生成音乐。\n\n主题/歌词意向：${prompt}\n曲名：${title}\n风格标签：${tags}\n纯器乐：${make_instrumental}',
    },
    storage: {
      scope: 'music',
      extension: 'mp3',
      mime: 'audio/mpeg',
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/music/{timestamp}-{randomId}/',
      filenameTemplate: 'music_{taskId}_{randomId}.mp3',
    },
  };
}

/** video：路由 video-short */
function seedVideoShort(): TaskTemplate {
  return {
    formSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          title: '视频创意 / 分镜描述',
          minLength: 1,
          'x-user-visible': true,
        },
        seconds: {
          type: 'integer',
          title: '时长（秒）',
          minimum: 1,
          maximum: 60,
          default: 10,
          'x-user-visible': true,
        },
        size: {
          type: 'string',
          title: '画幅',
          enum: ['720x1280', '1280x720', '1024x1792', '1792x1024'],
          default: '720x1280',
          'x-user-visible': true,
        },
        total_duration_seconds: {
          type: 'integer',
          title: '与 seconds 同步（计费）',
          minimum: 1,
          default: 10,
          'x-user-visible': false,
        },
        label: { type: 'string', title: '任务名称', 'x-user-visible': true },
        uid: { type: 'string', title: '任务 UID', 'x-user-visible': false },
      },
      required: ['prompt', 'uid'],
    },
    prompt: {
      unifiedTemplate: '视频生成需求：\n${prompt}\n\n目标时长约 ${seconds} 秒；画幅 ${size}。',
      unifiedTemplateMarkup: '视频生成需求：\n${prompt}\n\n目标时长约 ${seconds} 秒；画幅 ${size}。',
    },
    storage: {
      scope: 'video',
      extension: 'mp4',
      mime: 'video/mp4',
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/video/{timestamp}-{randomId}/',
      filenameTemplate: 'video_{taskId}_{randomId}.mp4',
    },
  };
}

function defaultInnerTypeForGraph(graphType: string): string {
  if (graphType === 'design') return 'poster';
  if (graphType === 'painting') return 'illustration';
  return 'portrait';
}

function innerTypeEnum(graphType: string): string[] {
  if (graphType === 'design') return ['3d', 'manual', 'poster', 'icon', 'coverImage', 'ui-design'];
  if (graphType === 'painting') return ['illustration', 'comic', 'conceptArt', 'cartoon'];
  return ['portrait', 'landscape', 'cinematic', 'commercial', 'documentary'];
}

/** graph：taskKey（DB type）须为 photograph | design | painting */
function minimalGraphTemplate(graphType: string): TaskTemplate {
  const gt = ['photograph', 'design', 'painting'].includes(graphType) ? graphType : 'photograph';
  const innerDefault = defaultInnerTypeForGraph(gt);
  const innerEnum = innerTypeEnum(gt);
  return {
    formSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        prompt: { type: 'string', title: '画面描述', minLength: 1, 'x-user-visible': true },
        type: {
          type: 'string',
          title: '子类型',
          enum: innerEnum,
          default: innerDefault,
          'x-user-visible': true,
        },
        referenceImage: {
          title: '参考图（可多张）',
          description:
            '支持 URL 或 Base64（data:image/...）。推荐使用数组对象格式：[{content,type,purpose}]。其中 purpose 用于说明这张图的用途（如：主图模特、衣服细节、背景氛围等）。',
          // nano-banana-2/edit：images 最多 14 张；这里对齐上限，避免前端/业务流误传过多参考图
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 14 },
            {
              type: 'array',
              minItems: 1,
              maxItems: 14,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  content: { type: 'string', title: '图片 URL / Base64' },
                  type: {
                    type: 'string',
                    title: '用途类型',
                    enum: ['main-subject', 'background', 'outfits', 'color-reference', 'style-reference'],
                    default: 'main-subject',
                  },
                  purpose: { type: 'string', title: '用途说明（可选）' },
                },
                required: ['content', 'type'],
              },
            },
          ],
          'x-ui-type': 'text',
          'x-user-visible': true,
        },
        aspect_ratio: { type: 'string', title: '宽高比', default: '1:1', 'x-user-visible': true },
        quality: {
          type: 'string',
          title: '质量',
          enum: ['high', 'fast'],
          default: 'fast',
          'x-user-visible': true,
        },
        label: { type: 'string', title: '任务名称', 'x-user-visible': true },
        uid: { type: 'string', title: '任务 UID', 'x-user-visible': false },
      },
      required: ['prompt', 'uid'],
    },
    prompt: {
      unifiedTemplate:
        '请根据以下参数生成图像（业务：${type}）。\n画面描述：${prompt}\n宽高比：${aspect_ratio}\n质量：${quality}',
      unifiedTemplateMarkup:
        '请根据以下参数生成图像（业务：${type}）。\n画面描述：${prompt}\n宽高比：${aspect_ratio}\n质量：${quality}',
    },
    storage: {
      scope: 'graph',
      extension: 'png',
      mime: 'image/png',
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/graph/{timestamp}-{randomId}/',
      filenameTemplate: 'graph_{taskId}_{randomId}.png',
    },
  };
}

function minimalWritingTemplate(taskKey: string): TaskTemplate {
  return {
    formSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        prompt: { type: 'string', title: '写作需求', minLength: 1, 'x-user-visible': true },
        total_textcount: {
          type: 'integer',
          title: '目标字数',
          minimum: 100,
          default: 1200,
          'x-user-visible': true,
        },
        label: { type: 'string', title: '任务名称', 'x-user-visible': true },
        uid: { type: 'string', title: '任务 UID', 'x-user-visible': false },
      },
      required: ['prompt', 'uid'],
    },
    prompt: {
      unifiedTemplate: `你是专业写作助手（业务类型：${taskKey}）。根据用户需求输出内容。

【需求】
\${prompt}

【字数参考】约 \${total_textcount} 字。
请直接输出正文。`,
      unifiedTemplateMarkup: `你是专业写作助手（业务类型：${taskKey}）。根据用户需求输出内容。

【需求】
\${prompt}

【字数参考】约 \${total_textcount} 字。
请直接输出正文。`,
    },
    storage: {
      scope: 'writing',
      extension: 'markdown',
      mime: 'text/markdown; charset=utf-8',
      bucket: 'writing-output',
      pathTemplate: 'writing/{userId}/{date}/',
      filenameTemplate: 'writing_{taskId}_{randomId}.md',
    },
  };
}

async function definitionLoads(scope: TaskScope, taskKey: string, subtype: string | null): Promise<boolean> {
  try {
    await loadTaskDefinition({ scope, taskKey, subtype, lang: 'zh' });
    return true;
  } catch {
    return false;
  }
}

async function findReferenceTemplate(
  items: PromptEngineeringConfig[],
  target: PromptEngineeringConfig,
): Promise<TaskTemplate | null> {
  const scope = asTaskScope(target.scope);
  if (!scope) return null;

  const others = items.filter((r) => r.id !== target.id && r.scope === target.scope);
  const scored = others
    .map((r) => ({
      r,
      score:
        r.type === target.type && (r.subtype ?? null) === (target.subtype ?? null)
          ? 4
          : r.type === target.type
            ? 3
            : 2,
    }))
    .sort((a, b) => b.score - a.score);

  for (const { r } of scored) {
    const rs = asTaskScope(r.scope);
    if (!rs) continue;
    if (!(await definitionLoads(rs, r.type, r.subtype ?? null))) continue;
    const { template } = await loadTaskDefinition({ scope: rs, taskKey: r.type, subtype: r.subtype ?? null, lang: 'zh' });
    return cloneTemplate(template);
  }
  return null;
}

async function main() {
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  // audio 禁止再 seed type=speak；现行 generator|group|series，用 apply:bundle 上架
  const mediaSeeds: Array<{
    scope: TaskScope;
    type: string;
    subtype: null;
    label: string;
    taskTemplate: TaskTemplate;
  }> = [
    { scope: 'music', type: 'default', subtype: null, label: '音乐生成（默认）', taskTemplate: seedMusicDefault() },
    { scope: 'video', type: 'short', subtype: null, label: '短视频', taskTemplate: seedVideoShort() },
  ];

  for (const s of mediaSeeds) {
    await repo.upsert({
      scope: s.scope,
      type: s.type,
      subtype: s.subtype,
      rules_i18n: { zh: `${s.label}（Task v2 种子）` },
      output_format_i18n: { zh: '' },
      form_options_i18n: null,
      extra: { taskTemplate: s.taskTemplate },
      is_active: true,
    });
    console.log(`[seed] upsert ${s.scope}/${s.type}/-`);
  }

  const { items } = await repo.list({ limit: 5000, offset: 0 });
  let patched = 0;

  for (const row of items) {
    if (row.scope !== 'writing' && row.scope !== 'graph') continue;
    const scope = asTaskScope(row.scope);
    if (!scope) continue;
    if (await definitionLoads(scope, row.type, row.subtype ?? null)) continue;

    let tpl = await findReferenceTemplate(items, row);
    if (!tpl) {
      if (row.scope === 'graph') {
        tpl = minimalGraphTemplate(row.type);
      } else {
        tpl = minimalWritingTemplate(row.type);
      }
    }

    const extra = { ...(row.extra ?? {}), taskTemplate: tpl };
    await repo.upsert({
      scope: row.scope,
      type: row.type,
      subtype: row.subtype ?? null,
      rules_i18n: row.rules_i18n ?? {},
      output_format_i18n: row.output_format_i18n ?? {},
      form_options_i18n: row.form_options_i18n ?? null,
      extra,
      is_active: row.is_active !== false,
    });
    patched += 1;
    console.log(`[patch] ${row.scope}/${row.type}/${row.subtype ?? '-'}`);
  }

  console.log(`Done. Media seeds: ${mediaSeeds.length}, writing/graph patched: ${patched}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
