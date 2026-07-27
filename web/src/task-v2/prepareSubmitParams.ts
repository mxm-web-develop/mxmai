import { prepareGraphReferenceSubmitParams } from './graphSubmitParams';

/** 提交前剔除 SchemaForm 内部字段（如 __uploading） */
export function stripPrivateUiFields<T>(input: T): T {
  if (Array.isArray(input)) return input.map((item) => stripPrivateUiFields(item)) as T;
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith('__')) continue;
      out[key] = stripPrivateUiFields(value);
    }
    return out as T;
  }
  return input;
}

const LEGACY_RENDER_PLAN_LABEL_TO_VALUE: Record<string, string> = {
  'GSAP 动画': 'static-image',
  '静态图片': 'static-image',
  'AI 视频': 'ai-video-gen',
  '素材引入': 'static-image',
  'AI 生成': 'ai-video-gen',
  '全 GSAP 动画': 'static-image',
  '全静态图片': 'static-image',
  '全 AI 视频': 'ai-video-gen',
  '混合（推荐）': 'static-image',
};

const LEGACY_RENDER_PLAN_VALUE_ALIASES: Record<string, string> = {
  'gsap-html-animation': 'static-image',
  'gsap-only': 'static-image',
  'static-image-only': 'static-image',
  'ai-only': 'ai-video-gen',
  'material-only': 'static-image',
};

function normalizeRenderPlanToken(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t === 'hybrid-balanced') return null;
  return LEGACY_RENDER_PLAN_LABEL_TO_VALUE[t] ?? LEGACY_RENDER_PLAN_VALUE_ALIASES[t] ?? t;
}

/** 旧版剪辑方案（GSAP/单选）→ 双模式 static-image | ai-video-gen */
export function normalizeLegacyRenderPlanParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(params, 'render_plan')) return params;
  const rp = params.render_plan;
  if (rp == null) return params;

  const toModes = (items: string[]): string[] => {
    const out: string[] = [];
    for (const item of items) {
      const v = normalizeRenderPlanToken(item);
      if (v === 'static-image' || v === 'ai-video-gen') out.push(v);
    }
    return [...new Set(out)];
  };

  if (Array.isArray(rp)) {
    const normalized = toModes(rp.map(String));
    return {
      ...params,
      render_plan: normalized.length > 0 ? normalized : ['static-image', 'ai-video-gen'],
    };
  }

  if (typeof rp === 'string') {
    const trimmed = rp.trim();
    if (trimmed === 'hybrid-balanced') {
      return { ...params, render_plan: ['static-image', 'ai-video-gen'] };
    }
    const one = normalizeRenderPlanToken(trimmed);
    if (one === 'static-image' || one === 'ai-video-gen') {
      return { ...params, render_plan: [one] };
    }
  }

  return params;
}

/** 将 selection / multiSelection 的中文 label 映射回 schema enum 值 */
export function normalizeEnumSelectionsBySchema(
  schema: unknown,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return params;

  const next: Record<string, unknown> = { ...params };

  for (const [key, defRaw] of Object.entries(props)) {
    if (!(key in next)) continue;
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    const v = next[key];

    if (String(def.type) === 'array') {
      const items = def.items;
      if (items && typeof items === 'object' && !Array.isArray(items)) {
        const en = (items as { enum?: unknown[] }).enum;
        const labels = def['x-enum-labels'];
        if (Array.isArray(en) && en.length > 0 && Array.isArray(labels) && labels.length > 0) {
          const enumVals = en.map((x) => String(x));
          const labelVals = labels.map((x) => String(x));
          const labelToEnum = new Map<string, string>();
          for (let i = 0; i < Math.min(enumVals.length, labelVals.length); i++) {
            const lab = labelVals[i];
            const ev = enumVals[i];
            if (lab && ev) labelToEnum.set(lab, ev);
          }

          const arr = Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? [v.trim()] : [];
          if (arr.length > 0) {
            next[key] = arr.map((s) => labelToEnum.get(s) ?? s).filter((s) => s.trim() !== '');
          }
        }
      }
      continue;
    }

    if (Array.isArray(def.enum) && Array.isArray(def['x-enum-labels']) && typeof v === 'string' && v.trim()) {
      const enumVals = def.enum.map((x) => String(x));
      const labelVals = (def['x-enum-labels'] as unknown[]).map((x) => String(x));
      const idx = labelVals.indexOf(v);
      if (idx >= 0 && enumVals[idx]) {
        next[key] = enumVals[idx];
      }
    }
  }

  return next;
}

/** minimaxVoice 字段扁平化为 voice_id，供管线模板与 TTS 参数使用 */
export function flattenMinimaxVoiceForSubmit(
  schema: unknown,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== 'object') return params;

  const next = { ...params };
  for (const [key, defRaw] of Object.entries(props)) {
    if (key !== 'voice' || !(key in next)) continue;
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    if (def['x-ui-type'] !== 'minimaxVoice') continue;
    const v = next.voice;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const vid = (v as { voice_id?: string }).voice_id;
      if (typeof vid === 'string' && vid.trim()) {
        next.voice_id = vid.trim();
      }
    }
  }
  return next;
}

/** 音乐表单字段扁平化，供后端 music_generation 参数使用 */
export function flattenMusicFormForSubmit(
  _schema: unknown,
  params: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...params };
  if (next.make_instrumental === true) {
    next.is_instrumental = true;
  }
  return next;
}

/** textFileOrPaste 字段扁平化为纯文本，供管线与模板使用 */
export function flattenTextFileOrPasteForSubmit(
  schema: unknown,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return params;
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props || typeof props !== 'object') return params;

  const next = { ...params };
  for (const [key, defRaw] of Object.entries(props)) {
    if (!(key in next)) continue;
    if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) continue;
    const def = defRaw as Record<string, unknown>;
    if (def['x-ui-type'] !== 'textFileOrPaste') continue;
    const v = next[key];
    if (typeof v === 'string') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const text = (v as { text?: string }).text;
      next[key] = typeof text === 'string' ? text.trim() : '';
    } else {
      next[key] = '';
    }
  }
  return next;
}

/** 列表展示名由 TaskV2TaskNameField → metadata.label 写入，勿与 formSchema.label 重复提交 */
export function stripFormSchemaLabelField(params: Record<string, unknown>): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(params, 'label')) return params;
  const next = { ...params };
  delete next.label;
  return next;
}

export function prepareTaskV2SubmitParams(
  formValues: Record<string, unknown>,
  schema: unknown,
  opts?: { scope?: string }
): Record<string, unknown> {
  let params = stripPrivateUiFields(formValues) as Record<string, unknown>;
  params = normalizeLegacyRenderPlanParams(params);
  params = normalizeEnumSelectionsBySchema(schema, params);
  params = flattenMinimaxVoiceForSubmit(schema, params);
  params = flattenTextFileOrPasteForSubmit(schema, params);
  if (opts?.scope === 'music') {
    params = flattenMusicFormForSubmit(schema, params);
  }
  if (opts?.scope === 'graph' || schemaRefSlotsForPrepare(schema).length > 0) {
    params = prepareGraphReferenceSubmitParams(params, schema);
  }
  return stripFormSchemaLabelField(params);
}

function schemaRefSlotsForPrepare(schema: unknown): unknown[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (!props) return [];
  return Object.values(props).filter(
    (def) => def && typeof def === 'object' && (def as Record<string, unknown>)['x-ui-type'] === 'referenceImages'
  );
}

function fieldTitle(schema: unknown, key: string): string {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return key;
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  const def = props?.[key];
  if (def && typeof def === 'object' && !Array.isArray(def)) {
    const title = (def as { title?: string }).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return key;
}

/** 提交前校验 required / minLength / minItems，返回用户可读错误（通过则 null） */
export function validateTaskV2SubmitParams(
  params: Record<string, unknown>,
  schema: unknown
): string | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  const s = schema as {
    required?: string[];
    properties?: Record<string, Record<string, unknown>>;
  };
  const required = s.required ?? [];
  const props = s.properties ?? {};

  for (const key of required) {
    const def = props[key];
    const title = fieldTitle(schema, key);
    const v = params[key];

    if (v === undefined || v === null) {
      return `请先填写「${title}」`;
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) return `请先填写「${title}」`;
      const minLen = typeof def?.minLength === 'number' ? def.minLength : 0;
      if (minLen > 0 && trimmed.length < minLen) {
        return `「${title}」内容过短（至少 ${minLen} 个字符）`;
      }
    }
    if (Array.isArray(v)) {
      const minItems = typeof def?.minItems === 'number' ? def.minItems : 0;
      if (minItems > 0 && v.length < minItems) {
        return `请至少选择 ${minItems} 项「${title}」`;
      }
    }
  }

  return null;
}
