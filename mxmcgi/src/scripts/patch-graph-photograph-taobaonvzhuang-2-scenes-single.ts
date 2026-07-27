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

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const existing = await repo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  if (!existing) throw new Error('prompt_engineering_config missing for graph/photograph/taobaonvzhuang-2');

  const extra = (existing.extra ?? {}) as Record<string, unknown>;
  const taskTemplate = ((extra as any).taskTemplate ?? {}) as Record<string, unknown>;
  const formSchema = ((taskTemplate as any).formSchema ?? {}) as Record<string, unknown>;
  const props = ((formSchema as any).properties ?? {}) as Record<string, any>;
  const scenesDef = (props.scenes ?? {}) as Record<string, unknown>;

  const enumVals = [
    'beach_pier',
    'indoor_studio',
    'luxury_hotel',
    'urban_street',
    'cafe_window',
    'rooftop_golden_hour',
    'meadow_forest_edge',
    'minimalist_loft',
    'lakeside_promenade',
    'subway_concourse',
    'flower_shop_lane',
    'art_corridor_white',
    'bright_office_loft',
  ];
  const labels = [
    '海滩码头',
    '室内摄影棚',
    '奢华酒店',
    '街区街拍',
    '咖啡/书店窗景',
    '屋顶露台黄昏',
    '草坪林缘自然光',
    '极简 Loft 居家',
    '湖滨步道城市岸',
    '地铁/车站纵深',
    '花店门头窄巷',
    '白廊/美术馆走道',
    '明亮开放办公室',
  ];

  const patchedScenes = {
    ...(scenesDef || {}),
    type: 'string',
    title: (scenesDef.title as string) || '拍摄场景',
    description:
      '无环境参考图时由该选项主导光线/空间/质感；有环境参考图时作氛围补充。覆盖女装商拍常见外景/生活/通勤/极简空间。',
    'x-ui-type': 'selection',
    enum: enumVals,
    'x-enum-labels': labels,
    default: enumVals[0],
  };

  const nextExtra = {
    ...extra,
    taskTemplate: {
      ...taskTemplate,
      formSchema: {
        ...formSchema,
        properties: {
          ...props,
          scenes: patchedScenes,
        },
        // required 不变（保持 scenes 必填）
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

  console.log('patched graph/photograph/taobaonvzhuang-2 scenes -> selection(single)');
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});

