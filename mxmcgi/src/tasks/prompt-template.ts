import type { JsonSchemaV2, PromptTemplateConfig } from './types';
import { ConfigurationError } from './errors';

/** `${name}` 与 Mustache 风格 `{{name}}` / `{{ name }}` 均支持 */
const VAR_DOLLAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const VAR_MUSTACHE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function isReferenceImageRow(x: unknown): x is { content?: string; type?: string } {
  return x != null && typeof x === 'object' && 'content' in (x as object);
}

function countReferenceImageSlots(v: unknown): number {
  if (!Array.isArray(v)) return 0;
  return v.filter((x) => isReferenceImageRow(x) && typeof x.content === 'string' && x.content.length > 0).length;
}

function summarizeReferenceImages(v: unknown): string {
  if (!Array.isArray(v)) return '';
  const rows = v
    .filter((x) => isReferenceImageRow(x))
    .map((x) => x as any)
    .filter((x) => typeof x.content === 'string' && String(x.content).trim());
  if (rows.length === 0) return '';

  const groupMap = new Map<string, any[]>();
  const groupOrder: string[] = [];
  for (const r of rows) {
    const gk = typeof r.groupKey === 'string' && r.groupKey.trim() ? r.groupKey.trim() : '_ungrouped';
    if (!groupMap.has(gk)) {
      groupMap.set(gk, []);
      groupOrder.push(gk);
    }
    groupMap.get(gk)!.push(r);
  }

  const perGroup: string[] = [];
  for (const gk of groupOrder) {
    const items = groupMap.get(gk) || [];
    if (items.length === 0) continue;
    const sample = items[0];
    const title =
      typeof sample?.groupTitle === 'string' && sample.groupTitle.trim()
        ? sample.groupTitle.trim()
        : gk;
    // description 是 Admin 写给 LLM 的图片用途指令，直接作为指令句输出
    const desc =
      typeof sample?.groupDesc === 'string' && sample.groupDesc.trim()
        ? sample.groupDesc.trim()
        : '';

    const purposes = new Set<string>();
    for (const it of items) {
      const p = typeof it.purpose === 'string' && it.purpose.trim() ? it.purpose.trim() : '';
      if (p) purposes.add(p);
    }
    const purposeText = purposes.size > 0 ? `，用途：${Array.from(purposes).join(' / ')}` : '';
    // 格式："标题（共N张）：用途指令"  —— description 作为正式指令，不是括号补充
    const line = desc
      ? `${title}（共${items.length}张${purposeText}）：${desc}`
      : `${title}: 共${items.length}张${purposeText}`;
    perGroup.push(line);
  }

  return perGroup.join('\n');
}

export type FormatTemplateValueOpts = {
  /** 当前占位符对应字段的 formSchema.properties[key]（可含 x-enum-descriptions 等扩展） */
  fieldSchema?: Record<string, unknown>;
};

/** 参考图常为 data URI / 超长 URL：进文本 prompt 时只给摘要，真实像素仍走 graph 的 image_input */
export function formatTemplateValue(key: string, v: unknown, opts?: FormatTemplateValueOpts): string {
  if (v == null) return '';
  // referenceImages 槽位（含 referenceImage 合并数组及各 schema 动态字段）：
  // 进文本 prompt 时只给摘要，真实像素仍走 graph 的 image_input。
  if (key === 'referenceImage' || (Array.isArray(v) && countReferenceImageSlots(v) > 0)) {
    // V2：参考图像素不应进入文本 prompt（避免噪声/泄漏/冗长），但允许输出“结构化摘要”
    // 以便 Graph prompt 作为“约束来源”传入 text/format，再由 text/format 抽取为 gpt-image-2 可用 prompt。
    if (Array.isArray(v)) {
      return summarizeReferenceImages(v);
    }
    // 单图旧格式：不注入文本（无法表达分组/用途，且容易误把 URL/base64 暴露到 prompt）
    return '';
  }
  if (key === 'aspect_ratio' && typeof v === 'string') {
    const k = v.trim();
    const map: Record<string, string> = {
      '1:1': '1:1（正方形）',
      '3:4': '3:4（竖版商拍常用）',
      '4:3': '4:3（横版）',
      '16:9': '16:9（宽屏横版）',
      '9:16': '9:16（竖屏全屏）',
    };
    return map[k] ?? k;
  }
  if (key === 'scenes' || key === 'shoot_preset') {
    const descMap = opts?.fieldSchema?.['x-enum-descriptions'] as Record<string, string> | undefined;
    const legacyShort: Record<string, string> =
      key === 'scenes'
        ? {
            beach_pier: 'beach_pier（海滩码头：午后暖阳光、海风轻质感、自然高光与适度景深）',
            indoor_studio: 'indoor_studio（室内摄影棚：干净无缝纸/浅灰背景、柔光箱、肤质通透、电商主光）',
            luxury_hotel: 'luxury_hotel（奢华酒店：暖金点缀、轻奢软装层次、低调华丽氛围）',
          }
        : {};
    const one = (raw: string): string => {
      const k = raw.trim();
      const fromSchema = descMap && typeof descMap[k] === 'string' ? descMap[k].trim() : '';
      if (fromSchema) return `${k}（${fromSchema}）`;
      return legacyShort[k] ?? k;
    };
    if (Array.isArray(v)) return v.map((x) => one(String(x))).join(', ');
    if (typeof v === 'string') return one(v);
  }
  if (key === 'model_participation' && typeof v === 'string') {
    const map: Record<string, string> = {
      default: 'default（默认：完整模特，有参考时 identity lock）',
      face_hidden: 'face_hidden（去模特身份：裁切在下巴以下/背影/头顶出画，禁清晰五官）',
      no_model: 'no_model（无模特：仅挂拍/鬼影人台/平铺）',
    };
    const k = v.trim();
    return map[k] ?? k;
  }
  if (key === 'clothing_material' || key === 'garment_material') {
    // use_reference_only 表示“以参考图为准，不额外补充材质”，按未选择处理（用于模板行级裁剪）
    if (v.trim() === 'use_reference_only') return '';
    const hints: Record<string, string> = {
      cotton: 'cotton（纯棉：细织纹、哑光透气、自然软折痕）',
      cotton_linen: 'cotton_linen（棉麻：粗织纹、亚麻结、哑光清爽垂坠）',
      linen: 'linen（亚麻：清晰经纬纹、挺括微皱、自然哑光）',
      silk_satin: 'silk_satin（真丝/缎：柔顺高垂坠、细腻流动高光）',
      chiffon_georgette: 'chiffon_georgette（雪纺/乔其：轻薄半透、飘逸层叠）',
      denim: 'denim（牛仔：斜纹帆布、中厚、微磨白与清晰缝线）',
      wool_knit: 'wool_knit（羊毛/针织：罗纹/针脚、绒感、弹性包裹）',
      cashmere: 'cashmere（羊绒：极细绒感、轻软哑光、柔和垂坠）',
      leather_suede: 'leather_suede（真皮/绒面：颗粒或绒面吸光、挺括轮廓）',
      faux_leather: 'faux_leather（仿皮 PU：均匀人造光泽、硬折痕）',
      mesh_lace: 'mesh_lace（网纱/蕾丝：通透镂空、精致叠层）',
      tulle_organza: 'tulle_organza（欧根纱/硬纱：挺括透明、层叠蓬感）',
      velvet: 'velvet（丝绒：短绒双向光泽、深暗部）',
      corduroy: 'corduroy（灯芯绒：纵向绒条、哑光条带）',
      tweed: 'tweed（粗花呢：杂色混纺颗粒、秋冬编织纹理）',
      down_puffy: 'down_puffy（羽绒/填充：蓬松绗缝、空气感体积）',
      functional_shell: 'functional_shell（机能面料：防风防水涂层、尼龙/聚酯微皱）',
      sequin_embellished: 'sequin_embellished（亮片/珠片：反射点高光、底布结构仍可读）',
      synthetic_blend: 'synthetic_blend（化纤混纺：利落抗皱、适度人造丝光）',
      velvet_corduroy: 'velvet_corduroy（丝绒/灯芯绒：短绒光泽与条纹肌理）',
      metal_trim: 'metal_trim（金属辅料：冷高光、硬边反射）',
    };
    const k = v.trim();
    const descMap = opts?.fieldSchema?.['x-enum-descriptions'] as Record<string, string> | undefined;
    const fromSchema = descMap && typeof descMap[k] === 'string' ? descMap[k].trim() : '';
    if (fromSchema) return `${k}（${fromSchema}）`;
    return hints[k] ?? k;
  }
  if (typeof v === 'boolean') {
    return v ? '是' : '否';
  }
  if (key === 'output_grid' && typeof v === 'string') {
    const map: Record<string, string> = {
      '1x1': '单张（1×1）',
      '2x2': '四宫格（2×2）',
      '3x3': '九宫格（3×3）',
      '4x4': '十六宫格（4×4）',
    };
    const k = v.trim().toLowerCase();
    return map[k] ?? v.trim();
  }
  if (key === 'grid_cell_constraint_preset' && typeof v === 'string') {
    const map: Record<string, string> = {
      strict_seamless: '宫格约束：严格无痕（默认）',
      standard: '宫格约束：标准分界',
      none: '宫格约束：不追加硬条款',
    };
    return map[v.trim()] ?? v.trim();
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function replaceVarPlaceholders(
  template: string,
  vars: Record<string, unknown>,
  schemaProps?: Record<string, unknown>
): string {
  const subst = (_all: string, key: string) => {
    const fieldSchema =
      schemaProps && typeof schemaProps[key] === 'object' && schemaProps[key] != null
        ? (schemaProps[key] as Record<string, unknown>)
        : undefined;
    return formatTemplateValue(key, vars[key], fieldSchema ? { fieldSchema } : undefined);
  };
  return template.replace(VAR_DOLLAR_RE, subst).replace(VAR_MUSTACHE_RE, subst);
}

export function collectTemplateVars(s: string): string[] {
  const out: string[] = [];
  for (const re of [VAR_DOLLAR_RE, VAR_MUSTACHE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      out.push(m[1]);
    }
  }
  return Array.from(new Set(out));
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, unknown>,
  paramsSchema?: JsonSchemaV2
): string {
  const schemaProps = (paramsSchema as any)?.properties as Record<string, unknown> | undefined;
  // 行级裁剪：当某些占位符为空时，自动删除整行「标签：${var}」以避免“补充说明：”这种空壳残留。
  const lines = String(template).split('\n');
  const out: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine;
    // 捕获该行引用了哪些变量（未去重）
    const used = [...line.matchAll(VAR_DOLLAR_RE), ...line.matchAll(VAR_MUSTACHE_RE)].map((m) => m[1]);
    if (used.length === 0) {
      out.push(line);
      continue;
    }

    // 先按老规则插值
    const replaced = replaceVarPlaceholders(line, vars, schemaProps);

    // 若该行形如 “xxx：” 且引用的变量都为空，则丢弃该行
    const looksLikeBareLabel = /^\s*[^：:]{1,40}[：:]\s*$/.test(replaced);
    if (looksLikeBareLabel) {
      let allEmpty = true;
      for (const k of used) {
        const fieldSch =
          schemaProps && typeof schemaProps[k] === 'object' && schemaProps[k] != null
            ? (schemaProps[k] as Record<string, unknown>)
            : undefined;
        const v = formatTemplateValue(k, (vars as any)[k], fieldSch ? { fieldSchema: fieldSch } : undefined);
        if (v && String(v).trim()) {
          allEmpty = false;
          break;
        }
      }
      if (allEmpty) continue;
    }

    out.push(replaced);
  }

  // 清理多余空行（保留段落间单空行）
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 将旧版 system / user / output 三段模板（未插值）合并为单段 unifiedTemplate，
 * 与原先 `renderPromptFromTemplate` 的拼接规则一致。
 */
export function composeLegacyPromptToUnified(p: {
  systemTemplate?: string;
  userTemplate?: string;
  outputFormatTemplate?: string;
  /** 已弃用；仅当 systemTemplate 为空且仍使用旧三段模板时可用 */
  rulesFallback?: string;
  /** 来自 prompt_engineering_config.output_format_i18n 的兜底 */
  outputFormatFallback?: string;
}): string {
  const sys = (p.systemTemplate || p.rulesFallback || '').trim();
  const userTpl =
    p.userTemplate != null && String(p.userTemplate).trim() !== ''
      ? String(p.userTemplate).trim()
      : '${prompt}';
  const out = (p.outputFormatTemplate || p.outputFormatFallback || '').trim();
  const parts: string[] = [];
  if (sys) parts.push(sys);
  parts.push(`【用户需求】\n${userTpl}`);
  if (out) parts.push(`【输出要求】\n${out}`);
  return parts.join('\n\n').trim();
}

export function assertTemplateVarsAllowed(paramsSchema: JsonSchemaV2, varsUsed: string[], allowList: string[] = []): void {
  const props = (paramsSchema as any)?.properties as Record<string, unknown> | undefined;
  const allowed = new Set<string>([...Object.keys(props || {}), ...allowList]);
  const unknown = varsUsed.filter((v) => !allowed.has(v));
  if (unknown.length > 0) {
    throw new ConfigurationError(
      `Prompt 模板引用了未在 formSchema.properties 中声明的变量: ${unknown.join(', ')}`
    );
  }
}

/**
 * Admin 富文本编辑器可能将 HTML template 标签写入 unifiedTemplate，
 * 而运行时只识别 dollar-brace / mustache 占位符。此函数将 HTML 标签占位符转为标准形式。
 */
function sanitizeTemplateTagPlaceholders(tpl: string): string {
  return tpl.replace(
    /<template\s+[^>]*?placeholder="([A-Za-z_][A-Za-z0-9_]*)"[^>]*><\/template>/g,
    (_match, varName) => '$' + '{' + varName + '}'
  );
}

export function renderPromptFromTemplate(args: {
  prompt: PromptTemplateConfig;
  paramsSchema: JsonSchemaV2;
  params: Record<string, unknown>;
  contextVars?: Record<string, unknown>;
}): { finalPrompt: string; varsUsed: string[] } {
  const { prompt, paramsSchema, params, contextVars } = args;
  const vars = { ...(contextVars || {}), ...(params || {}) } as Record<string, unknown>;

  let body = (prompt.unifiedTemplate || '').trim();
  if (!body) {
    body = composeLegacyPromptToUnified({
      systemTemplate: prompt.systemTemplate,
      userTemplate: prompt.userTemplate,
      outputFormatTemplate: prompt.outputFormatTemplate,
    });
  }

  body = sanitizeTemplateTagPlaceholders(body);

  const uniVars = collectTemplateVars(body);
  assertTemplateVarsAllowed(paramsSchema, uniVars, [
    'userId',
    'taskId',
    'date',
    'timestamp',
    'uuid',
    /** 与 Task V2 路由一致，由 task-engine 写入 contextVars，不必出现在 formSchema */
    'subtype',
    'parallel_index',
    'parallel_total',
    'parent_task_id',
    /** 宫格分镜运行时由 prepareStoryboardGridParams 生成，不必出现在 formSchema */
    'storyboard_prompt',
    /** Pre pipeline 结构化输出注入 params，供 writing/resumes 等 Core 模板引用 */
    'resume_profile',
  ]);
  const finalPrompt = interpolateTemplate(body, vars, paramsSchema).trim();

  // 模板声明了 ${prompt} / {{prompt}} 且传入较长 briefing 时，插值结果必须包含 briefing 的稳定前缀，否则多为未在正文承接 ${prompt} 的配置错误（会烧 token 产出无关图）
  if (uniVars.includes('prompt')) {
    const raw = typeof vars.prompt === 'string' ? vars.prompt.replace(/\r\n/g, '\n').trim() : '';
    const minLen = 80;
    if (raw.length >= minLen) {
      const needle = raw.slice(0, Math.min(160, raw.length));
      if (needle && !finalPrompt.includes(needle)) {
        throw new ConfigurationError(
          'unifiedTemplate 引用了 prompt 占位符，但插值后的 finalPrompt 未包含传入的 params.prompt 前缀。' +
            '请确认模板在可见正文中使用 ${prompt}（或 {{prompt}}）承接上游 briefing，且未被仅写在注释/不可达段。'
        );
      }
    }
  }

  return { finalPrompt, varsUsed: uniVars };
}

