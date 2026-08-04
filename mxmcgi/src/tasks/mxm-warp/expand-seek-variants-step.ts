/**
 * enrich 确定性步：expandSeekVariants
 * 根据 basic.genre + basic.voice_ids(+article_length) 展开 business.variants（1 文体 × N 文风）。
 * 模型侧只写入 resolveVoiceForModel 的无姓名 craft，不写展示用「××式」人名标签。
 */
import type { PipelineStep, TaskContext } from '../types';
import { registerInputStep } from '../pipeline-registry';
import { getContract, withContract } from './input-stage';
import {
  getSeekGenrePreset,
  pickI18n,
  resolveVoiceForModel,
} from '../writing-style-presets/seek-voice-presets';

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x ?? '').trim()).filter(Boolean);
      }
    } catch {
      /* csv */
    }
    return v.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export async function runExpandSeekVariantsStep(
  ctx: TaskContext,
  _step: PipelineStep
): Promise<TaskContext> {
  const contract = getContract(ctx);
  if (!contract) return ctx;
  const basic = (contract.basic || {}) as Record<string, unknown>;
  const lang = String(basic.language || ctx.params?.language || 'zh');
  const topic = String(basic.topic || '').trim();
  const genreId = String(basic.genre || basic.article_genre || 'deep_feature').trim();
  const length = String(basic.article_length || 'standard').trim();
  const voiceIds = asStringArray(basic.voice_ids ?? basic.voices ?? basic.style_ids);
  if (!topic || voiceIds.length === 0) {
    throw new Error('expandSeekVariants：需要 basic.topic 与 basic.voice_ids（至少 1 个文风）');
  }

  const genre = getSeekGenrePreset(genreId);
  const genreLabel = genre ? pickI18n(genre.label, lang) : genreId;
  const genreBrief = genre?.blurb ? pickI18n(genre.blurb, lang) : '';
  const genreForModel = genreBrief ? `${genreLabel} — ${genreBrief}` : genreLabel;

  const variants: Array<Record<string, unknown>> = [];
  for (let i = 0; i < voiceIds.length; i++) {
    const vid = voiceIds[i]!;
    const modelVoice = resolveVoiceForModel(vid, lang);
    if (!modelVoice) {
      throw new Error(`expandSeekVariants：未知文风 id「${vid}」`);
    }
    variants.push({
      id: `v${i + 1}`,
      voice_id: modelVoice.voice_id,
      // 人审/列表可用中性 blurb，禁止把 UI 人名式 label 写入合同提交面
      voice_blurb: modelVoice.blurb,
      genre_id: genreId,
      genre_label: genreForModel,
      genre_brief: genreBrief || undefined,
      article_length: length,
      topic,
      style_profile: {
        craft: modelVoice.craft,
        reference_paragraph: modelVoice.reference_paragraph,
        humor_level: 3,
        tone_directives: [
          modelVoice.craft.sentence,
          modelVoice.craft.stance,
          modelVoice.craft.opening,
          `回避：${modelVoice.craft.avoid}`,
        ],
      },
      // 占位：风格化回填后写入
      styled_evidence: null,
      search_focus: topic,
    });
  }

  const next = withContract(ctx, {
    ...contract,
    basic: {
      ...basic,
      genre: genreId,
      article_length: length,
      voice_ids: voiceIds,
      seek_count: variants.length,
    },
    business: {
      ...(contract.business && typeof contract.business === 'object' ? contract.business : {}),
      variants,
      common_ground: {
        facts: [],
        rules: [
          '不得编造具体数字、引语或已检索到的事实',
          '成稿须落实对应 variant.style_profile.craft，禁止另起一套文风',
          '禁止在读者可见正文中出现文风预设人名或「模仿某某」字样',
        ],
      },
    },
  });
  return {
    ...next,
    params: {
      ...next.params,
      seek_count: variants.length,
      voice_ids: voiceIds,
    },
  };
}

export function registerExpandSeekVariantsStep(): void {
  registerInputStep('expandSeekVariants', runExpandSeekVariantsStep);
}

registerExpandSeekVariantsStep();
