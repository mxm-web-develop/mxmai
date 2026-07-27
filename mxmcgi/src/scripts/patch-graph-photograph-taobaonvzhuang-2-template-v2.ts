import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

const unifiedTemplateV2 =
  `拍摄场景：\${scenes}\n` +
  `服装材质补充：\${clothing_material}\n` +
  `补充说明：\${prompt}\n` +
  `画幅：\${aspect_ratio}`;

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const existing = await repo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  if (!existing) throw new Error('prompt_engineering_config missing for graph/photograph/taobaonvzhuang-2');

  const extra = (existing.extra ?? {}) as Record<string, unknown>;
  const taskTemplate = ((extra as any).taskTemplate ?? {}) as Record<string, unknown>;
  const formSchema = ((taskTemplate as any).formSchema ?? {}) as Record<string, any>;
  const props = (formSchema.properties ?? {}) as Record<string, any>;
  const prompt = ((taskTemplate as any).prompt ?? {}) as Record<string, unknown>;

  const nextExtra = {
    ...extra,
    taskTemplate: {
      ...taskTemplate,
      formSchema: {
        ...formSchema,
        type: 'object',
        properties: {
          ...props,
          // 确保业务子类型字段存在（用于后端按 subtype 配置路由；不展示亦可）
          type: {
            type: 'string',
            const: 'taobaonvzhuang-2',
            title: '业务子类型',
            default: 'taobaonvzhuang-2',
          },
          // 服装材质补充（可选；若前端不传不影响模板渲染）
          clothing_material: {
            type: 'string',
            title: '服装材质（补充）',
            description: '参考图看不清面料时在此选择，生成英文 prompt 时可强调对应质感与光泽。',
            'x-ui-type': 'selection',
            enum: [
              'use_reference_only',
              'cotton_linen',
              'silk_satin',
              'denim',
              'wool_knit',
              'leather_suede',
              'mesh_lace',
              'synthetic_blend',
              'velvet_corduroy',
              'metal_trim',
            ],
            default: 'use_reference_only',
          },
        },
      },
      prompt: {
        ...prompt,
        unifiedTemplate: unifiedTemplateV2,
        unifiedTemplateMarkup: '\n' + unifiedTemplateV2,
      },
    },
  };

  await repo.upsert({
    id: existing.id,
    scope: 'graph',
    type: 'photograph',
    subtype: 'taobaonvzhuang-2',
    rules_i18n: existing.rules_i18n ?? {},
    output_format_i18n: existing.output_format_i18n ?? {},
    form_options_i18n: existing.form_options_i18n ?? null,
    extra: nextExtra,
    is_active: true,
    updated_by: existing.updated_by ?? null,
  });

  console.log('patched graph/photograph/taobaonvzhuang-2 unifiedTemplate -> v2 concise');
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});

