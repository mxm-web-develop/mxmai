/**
 * enrich 确定性步：injectWritingVoice
 * 按 basic.voice_id 懒加载本地 pack，写入 business.voice_profile + voice_injection（单条，禁止整库）。
 * 支持 voice_id=kb_writing：从 writing_folder_id 语感文风卡注入（不依赖内置 pack）。
 */
import type { PipelineStep, TaskContext } from '../types';
import { registerInputStep } from '../pipeline-registry';
import { getContract, withContract } from './input-stage';
import {
  formatVoiceInjection,
  isKbWritingVoiceId,
  KB_WRITING_VOICE_ID,
  resolveVoiceForModelAsync,
  type VoiceCraft,
  type VoiceModelPayload,
} from '../writing-style-presets/writing-voice-presets';
import { purposeForVoiceCategory, articleLengthGuide } from '../writing-style-presets/topic-article-purpose';
import { resolveCardNeed } from '../../folder-cards/resolve-card-assets';

function asTrimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const KB_WRITING_CRAFT: VoiceCraft = {
  sentence: '跟随文风卡句式节奏与段落呼吸',
  stance: '跟随文风卡立场与人称',
  opening: '跟随文风卡开篇与结构偏好',
  avoid: '勿偏离文风卡禁区与忌讳',
  lexicon: '跟随文风卡用词习惯',
};

async function resolveKbWritingPayload(
  ctx: TaskContext,
  basic: Record<string, unknown>
): Promise<{ payload: VoiceModelPayload; writingSummary: string; folderId: string }> {
  const folderId = asTrimmed(basic.writing_folder_id || ctx.params?.writing_folder_id);
  if (!folderId) {
    throw new Error('injectWritingVoice：选用知识库文风时需要挂载语感文风卡');
  }
  const writingSummary = String(
    (await resolveCardNeed(ctx.userId, folderId, 'writing_summary')) ?? ''
  ).trim();
  if (!writingSummary) {
    throw new Error('injectWritingVoice：文风卡尚未解析出可用语感，请换一张就绪的语感文风卡');
  }

  const blurb = writingSummary.split('\n').map((l) => l.trim()).find(Boolean) || '知识库语感文风';
  const payload: VoiceModelPayload = {
    voice_id: KB_WRITING_VOICE_ID,
    voice_category: asTrimmed(basic.voice_category) || 'self_media',
    blurb,
    craft: { ...KB_WRITING_CRAFT },
    reference_paragraph: writingSummary,
  };
  return { payload, writingSummary, folderId };
}

export async function runInjectWritingVoiceStep(
  ctx: TaskContext,
  _step: PipelineStep
): Promise<TaskContext> {
  const contract = getContract(ctx);
  if (!contract) return ctx;
  const basic = (contract.basic || {}) as Record<string, unknown>;
  const lang = String(basic.language || ctx.params?.language || 'zh');
  const voiceId = asTrimmed(basic.voice_id || ctx.params?.voice_id);
  if (!voiceId) {
    throw new Error('injectWritingVoice：需要 basic.voice_id');
  }

  let payload: VoiceModelPayload;
  let writingSummary = '';
  let folderId = '';

  if (isKbWritingVoiceId(voiceId)) {
    const kb = await resolveKbWritingPayload(ctx, basic);
    payload = kb.payload;
    writingSummary = kb.writingSummary;
    folderId = kb.folderId;
  } else {
    const resolved = await resolveVoiceForModelAsync(voiceId, lang);
    if (!resolved) {
      throw new Error(`injectWritingVoice：未知或未上架文风 id「${voiceId}」`);
    }
    payload = resolved;
  }

  const voiceCategory = payload.voice_category || asTrimmed(basic.voice_category);
  // 体裁由类别锁定，覆盖用户误选的 purpose，避免短剧+调查稿等合同冲突
  const purpose = purposeForVoiceCategory(voiceCategory);
  const articleLength =
    asTrimmed(basic.article_length || ctx.params?.article_length) || 'standard';
  const lengthGuide = articleLengthGuide(purpose, articleLength, lang);

  const injection = isKbWritingVoiceId(voiceId)
    ? [`【知识库文风卡 voice_id=${KB_WRITING_VOICE_ID}】`, writingSummary].join('\n')
    : formatVoiceInjection(payload);

  const next = withContract(ctx, {
    ...contract,
    basic: {
      ...basic,
      voice_id: payload.voice_id,
      voice_category: voiceCategory,
      purpose,
      article_length: articleLength,
      article_length_guide: lengthGuide,
      ...(folderId ? { writing_folder_id: folderId } : {}),
      ...(writingSummary ? { writing_summary: writingSummary } : {}),
    },
    business: {
      ...(contract.business && typeof contract.business === 'object' ? contract.business : {}),
      voice_profile: {
        voice_id: payload.voice_id,
        voice_category: payload.voice_category,
        blurb: payload.blurb,
        craft: payload.craft,
        reference_paragraph: payload.reference_paragraph,
        talk_pack: payload.talk_pack,
        fiction_pack: payload.fiction_pack,
        report_pack: payload.report_pack,
        media_pack: payload.media_pack,
        ...(folderId ? { writing_folder_id: folderId } : {}),
      },
      voice_injection: injection,
    },
  });

  return {
    ...next,
    params: {
      ...next.params,
      voice_id: payload.voice_id,
      voice_category: voiceCategory,
      purpose,
      article_length: articleLength,
      article_length_guide: lengthGuide,
      voice_injection: injection,
      ...(folderId ? { writing_folder_id: folderId } : {}),
      ...(writingSummary ? { writing_summary: writingSummary } : {}),
    },
  };
}

export function registerInjectWritingVoiceStep(): void {
  registerInputStep('injectWritingVoice', runInjectWritingVoiceStep);
}

registerInjectWritingVoiceStep();
