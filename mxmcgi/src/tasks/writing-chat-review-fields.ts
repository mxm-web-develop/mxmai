/**
 * writing-chat 审核门字段：最小有效合同
 * - name（= skeleton）：文章结构
 * - angle：写法说明
 * - persona + humor_level：语言风格
 * - search_focus：检索 tags
 * 已删除空转：differentiation / reference_hint / rationale / voice
 */
import type { PipelineStep } from './types';

export type WritingChatField = {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  required?: boolean;
  default?: string;
  enum?: string[];
  /** 一屏编辑：一律 routes；meta 仅话题只读 */
  phase?: 'routes' | 'meta';
  ui?: 'tags' | 'text' | 'textarea' | 'scale';
};

export type VariantLike = {
  id?: unknown;
  name?: unknown;
  angle?: unknown;
  search_focus?: unknown;
  structure_plan?: unknown;
  style_profile?: unknown;
  insufficient_evidence?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export function variantId(v: VariantLike, index: number): string {
  const id = str(v.id).trim();
  if (id) return id;
  const name = str(v.name).trim();
  if (name) return name;
  return `v${index + 1}`;
}

function stylePart(v: VariantLike, key: 'persona' | 'humor_level'): string {
  const sp = asRecord(v.style_profile);
  if (!sp) return '';
  return str(sp[key]).trim();
}

function structureSkeleton(v: VariantLike): string {
  const sp = asRecord(v.structure_plan);
  if (!sp) return '';
  return str(sp.skeleton).trim();
}

/** 写回字段名（无 voice / skeleton 独立项：skeleton 随 name 同步） */
export const VARIANT_FIELD_RE =
  /^v__(.+?)__(name|angle|persona|humor_level|search_focus)$/;

export function buildDeterministicWritingChatSummary(
  contract: unknown,
  opts?: { label?: string; hint?: string }
): string {
  const c = asRecord(contract) ?? {};
  const basic = asRecord(c.basic) ?? {};
  const business = asRecord(c.business) ?? {};
  const variants = Array.isArray(business.variants) ? (business.variants as VariantLike[]) : [];
  const topic = str(basic.topic).trim();
  const parts: string[] = [];
  if (opts?.hint?.trim()) {
    parts.push(opts.hint.trim());
  } else if (opts?.label?.trim()) {
    parts.push(`请核对「${opts.label.trim()}」后继续。`);
  } else {
    parts.push('请确认各路文章结构、语言风格与检索词。');
  }
  if (topic) parts.push(`话题：${topic}`);
  if (variants.length > 0) {
    const names = variants
      .map((v, i) => str(v.name).trim() || structureSkeleton(v) || variantId(v, i))
      .filter(Boolean)
      .slice(0, 8);
    if (names.length) parts.push(`本轮 ${names.length} 路：${names.join('、')}`);
  }
  return parts.join('\n');
}

export function listContractVariants(
  contract: unknown,
  gateId?: string
): VariantLike[] {
  const c = asRecord(contract) ?? {};
  const business = asRecord(c.business) ?? {};
  let variants = Array.isArray(business.variants) ? (business.variants as VariantLike[]) : [];
  const evidenceOnly = typeof gateId === 'string' && /evidence/i.test(gateId);
  if (evidenceOnly) {
    variants = variants.filter((v) => v.insufficient_evidence === true);
  }
  return variants;
}

/**
 * 一屏字段：结构 / 写法 / 语言风格 / 幽默度 / 检索 tags。
 * evidence 门：仅检索 tags。
 */
export function buildWritingChatInteractiveFields(
  contract: unknown,
  step: PipelineStep,
  gateId?: string
): WritingChatField[] {
  const stepFields = (step.params as { fields?: unknown } | undefined)?.fields;
  if (Array.isArray(stepFields) && stepFields.length > 0) {
    return stepFields
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f, i) => {
        const name = str(f.name).trim() || `field_${i}`;
        return {
          name,
          type: typeof f.type === 'string' ? f.type : 'string',
          title: typeof f.title === 'string' ? f.title : name,
          description: typeof f.description === 'string' ? f.description : undefined,
          required: f.required === true,
          default: f.default != null ? str(f.default) : undefined,
          enum: Array.isArray(f.enum) ? f.enum.map(str) : undefined,
          phase: f.phase === 'meta' ? 'meta' : 'routes',
          ui: f.ui === 'tags' || f.ui === 'textarea' || f.ui === 'scale' ? f.ui : undefined,
        };
      });
  }

  const c = asRecord(contract) ?? {};
  const basic = asRecord(c.basic) ?? {};
  const variants = listContractVariants(contract, gateId);
  const evidenceOnly = typeof gateId === 'string' && /evidence/i.test(gateId);

  const fields: WritingChatField[] = [];
  const topic = str(basic.topic).trim();
  if (topic) {
    fields.push({
      name: 'topic',
      type: 'string',
      title: '探索话题',
      description: '整轮写作的主话题（不可改）。',
      required: false,
      default: topic,
      phase: 'meta',
    });
  }

  if (evidenceOnly) {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]!;
      const id = variantId(v, i);
      const label = str(v.name).trim() || structureSkeleton(v) || id;
      fields.push({
        name: `v__${id}__search_focus`,
        type: 'string',
        title: `${label} · 检索词`,
        description: '增删标签后重跑这一路检索。',
        required: true,
        default: str(v.search_focus).trim(),
        phase: 'routes',
        ui: 'tags',
      });
    }
    return fields;
  }

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]!;
    const id = variantId(v, i);
    const structureLabel = str(v.name).trim() || structureSkeleton(v) || id;
    // 旧合同若只有 voice：并入 persona 展示
    const persona =
      stylePart(v, 'persona') ||
      (() => {
        const sp = asRecord(v.style_profile);
        return sp ? str(sp.voice).trim() : '';
      })();

    fields.push({
      name: `v__${id}__name`,
      type: 'string',
      title: `路线 ${i + 1} · 文章结构`,
      description: '体裁短名：调查报道 / 段子盘点 / 编年档案…（禁止诗意瞎名）',
      required: true,
      default: structureLabel,
      phase: 'routes',
    });
    fields.push({
      name: `v__${id}__angle`,
      type: 'string',
      title: `路线 ${i + 1} · 写法说明`,
      description: '这一路怎么按该结构展开（一句话）。',
      required: true,
      default: str(v.angle).trim(),
      phase: 'routes',
      ui: 'textarea',
    });
    fields.push({
      name: `v__${id}__persona`,
      type: 'string',
      title: `路线 ${i + 1} · 语言风格`,
      description: '含口吻的一句话，如「冷静调查记者，短句克制」。',
      required: true,
      default: persona,
      phase: 'routes',
    });
    fields.push({
      name: `v__${id}__humor_level`,
      type: 'string',
      title: `路线 ${i + 1} · 幽默度`,
      description: '0～10',
      required: true,
      default: stylePart(v, 'humor_level') || '5',
      phase: 'routes',
      ui: 'scale',
    });
    fields.push({
      name: `v__${id}__search_focus`,
      type: 'string',
      title: `路线 ${i + 1} · 检索词`,
      description: '标签可新增/删除。',
      required: true,
      default: str(v.search_focus).trim(),
      phase: 'routes',
      ui: 'tags',
    });
  }

  return fields;
}

export function applyWritingChatFieldValues(
  contract: unknown,
  values: Record<string, unknown>
): unknown {
  if (!contract || typeof contract !== 'object') return contract;
  const next = JSON.parse(JSON.stringify(contract)) as Record<string, unknown>;
  const basic = asRecord(next.basic) ?? {};
  next.basic = basic;

  const business = asRecord(next.business) ?? {};
  next.business = business;
  const variants = Array.isArray(business.variants) ? (business.variants as VariantLike[]) : [];
  business.variants = variants;

  for (const [key, raw] of Object.entries(values)) {
    const m = key.match(VARIANT_FIELD_RE);
    if (!m) continue;
    const id = m[1]!;
    const prop = m[2]!;
    const val = str(raw).trim();
    const idx = variants.findIndex(
      (v, i) => variantId(v, i) === id || str(v.id) === id || str(v.name) === id
    );
    if (idx < 0) continue;
    const v = { ...variants[idx] } as VariantLike & Record<string, unknown>;

    if (prop === 'persona' || prop === 'humor_level') {
      const sp = asRecord(v.style_profile) ?? {};
      if (prop === 'humor_level') {
        const n = Number(val);
        sp.humor_level = Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : val;
      } else {
        sp.persona = val;
        // 合并后不再保留独立 voice
        delete sp.voice;
        delete sp.reference_hint;
      }
      v.style_profile = sp;
    } else if (prop === 'name') {
      v.name = val;
      const plan = asRecord(v.structure_plan) ?? {};
      plan.skeleton = val;
      delete plan.rationale;
      v.structure_plan = plan;
    } else if (prop === 'search_focus') {
      v.search_focus = val
        .split(/[\s,，、]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .join(' ');
    } else if (prop === 'angle') {
      v.angle = val;
    }
    // 清理死字段
    delete v.differentiation;
    variants[idx] = v;
  }
  return next;
}
