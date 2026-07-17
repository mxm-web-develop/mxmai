/**
 * 报告：HK 三个 provider 在线模型的能力分布（不连 DB，纯静态读 hk-provider-modalities.ts）
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run report:hk-modalities
 */

import {
  HK_ATLASCLOUD_MODALITIES,
  HK_MAXPLAN_MODALITIES,
  HK_JIEKOU_MODALITIES,
  HK_ALL_PROVIDER_MODALITIES,
} from './data/hk-provider-modalities';

function report() {
  console.log('=== HK 在线物理模型能力分布报告 ===\n');

  const counts = (obj: Record<string, unknown>) => {
    const c = { total: 0, multiModal: 0, supports3D: 0, supportsEmbed: 0 };
    for (const v of Object.values(obj)) {
      c.total += 1;
      const cap = v as { supported_inputs: string[]; supported_outputs: string[] };
      if (cap.supported_inputs.length > 1 || cap.supported_outputs.length > 1) c.multiModal += 1;
      if (cap.supported_outputs.includes('3d')) c.supports3D += 1;
      if (cap.supported_outputs.includes('embed')) c.supportsEmbed += 1;
    }
    return c;
  };

  for (const [name, table] of [
    ['atlascloud', HK_ATLASCLOUD_MODALITIES],
    ['maxplan', HK_MAXPLAN_MODALITIES],
    ['jiekou', HK_JIEKOU_MODALITIES],
  ] as const) {
    const c = counts(table);
    console.log(`[${name}]  共 ${c.total} 条模型`);
    console.log(`  - 多模态（输入≥2 或 输出≥2）：${c.multiModal}`);
    console.log(`  - 支持 3D 输出：${c.supports3D}`);
    console.log(`  - 支持 embedding 输出：${c.supportsEmbed}`);
  }

  console.log('\n--- 全部 HK 模型 inputs → outputs 分布 ---');
  const dist = new Map<string, number>();
  for (const item of HK_ALL_PROVIDER_MODALITIES) {
    const key = `[${item.capability.supported_inputs.join(',')}] → [${item.capability.supported_outputs.join(',')}]`;
    dist.set(key, (dist.get(key) ?? 0) + 1);
  }
  for (const [k, v] of Array.from(dist.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(2)}×  ${k}`);
  }

  console.log('\n--- 全部 HK 模型 modes 集合（去重） ---');
  const modes = new Set<string>();
  for (const item of HK_ALL_PROVIDER_MODALITIES) {
    for (const m of item.capability.modes ?? []) modes.add(m);
  }
  console.log(`  共 ${modes.size} 种模式：`);
  for (const m of Array.from(modes).sort()) {
    console.log(`    - ${m}`);
  }

  console.log('\n总计 ' + HK_ALL_PROVIDER_MODALITIES.length + ' 条 HK 模型能力配置');
}

report();
