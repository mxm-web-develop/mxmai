/**
 * 话题写作 mid-pre：按已选类别/风格/话题/篇幅/结构，经 text 业务生成可编辑 outline。
 */
import type { TaskRunV2Request } from '../types';
import { parseNestedTextTaskKey } from '../business-pipeline';
import { MXM_WARP_CONTRACT_VERSION, emptyContract } from './contract-types';
import { purposeForVoiceCategory, structuresForPurpose, articleLengthGuide } from '../writing-style-presets/topic-article-purpose';
import {
  getCatalogVoice,
  getVoiceCategory,
  pickI18n,
  resolveVoiceForModelAsync,
} from '../writing-style-presets/writing-voice-presets';
import {
  fallbackOutlineFromStructure,
  parseTopicArticleOutline,
  type TopicArticleOutline,
} from './topic-article-outline-parse';

export const TOPIC_ARTICLE_OUTLINE_TEXT_KEY = 'text/expert/topic-article-outline';

export type { TopicArticleOutline, TopicArticleOutlineSection } from './topic-article-outline-parse';
export { parseTopicArticleOutline, fallbackOutlineFromStructure } from './topic-article-outline-parse';

export type TopicArticleOutlinePreviewInput = {
  topic: string;
  voiceCategory: string;
  voiceId: string;
  language?: string;
  articleLength?: string;
  structureId?: string;
  purpose?: string;
  supplement?: string;
  userId: string;
  textKey?: string;
};

function buildFieldSpecs() {
  return [
    {
      name: 'outline',
      type: 'object',
      description:
        '对象 { title: string, sections: [{ heading, intent, notes? }] }。sections 3～6 节。语言跟 basic.language。',
    },
  ] as const;
}

export async function previewTopicArticleOutline(
  input: TopicArticleOutlinePreviewInput
): Promise<{ outline: TopicArticleOutline; textTaskId: string | null; textKey: string }> {
  const topic = String(input.topic || '').trim();
  if (!topic) throw new Error('缺少话题，无法生成大纲');
  const voiceCategory = String(input.voiceCategory || '').trim();
  const voiceId = String(input.voiceId || '').trim();
  const language = String(input.language || 'zh').trim() || 'zh';
  const purpose =
    String(input.purpose || '').trim() || purposeForVoiceCategory(voiceCategory);
  const articleLength = String(input.articleLength || 'standard').trim() || 'standard';
  const textKey = String(input.textKey || TOPIC_ARTICLE_OUTLINE_TEXT_KEY).trim();
  if (!textKey.startsWith('text/')) {
    throw new Error('未配置大纲 text 业务');
  }

  const cat = getVoiceCategory(voiceCategory);
  const voice = getCatalogVoice(voiceId);
  const catLabel = pickI18n(cat?.label, language) || voiceCategory;
  const voiceLabel = pickI18n(voice?.label, language) || voiceId;
  const payload = voiceId ? await resolveVoiceForModelAsync(voiceId, language) : null;
  const structs = structuresForPurpose(purpose, language);
  const picked =
    structs.find((s) => s.id === String(input.structureId || '').trim()) || structs[0];
  const lengthGuide = articleLengthGuide(purpose, articleLength, language);

  const contract = emptyContract({
    version: MXM_WARP_CONTRACT_VERSION,
    scope: 'writing',
    taskKey: 'generator',
    subtype: 'topic-article',
    taskId: '',
  });
  contract.basic = {
    language,
    topic,
    voice_category: voiceCategory,
    voice_id: voiceId,
    purpose,
    article_length: articleLength,
    article_length_guide: lengthGuide,
    structure_id: String(input.structureId || picked?.id || '').trim(),
    structure_label: picked?.title || '',
    structure_beats: picked?.beats || [],
    intent_label: voiceLabel ? `${catLabel} / ${voiceLabel}` : catLabel,
    ...(input.supplement ? { supplement: String(input.supplement).trim() } : {}),
    ...(payload
      ? {
          voice_style: {
            voice_id: payload.voice_id,
            voice_label: voiceLabel,
            blurb: payload.blurb,
            craft: payload.craft,
          },
        }
      : {}),
  };

  const { taskKey, subtype } = parseNestedTextTaskKey(textKey);
  const req: TaskRunV2Request = {
    scope: 'text',
    taskKey,
    subtype,
    params: {
      contract,
      field_specs: [...buildFieldSpecs()],
    },
  };

  const { runTaskV2 } = await import('../task-engine');
  const result = await runTaskV2(req, input.userId);
  if (!result.success || !result.syncResult) {
    const fb = fallbackOutlineFromStructure({
      topic,
      purpose,
      structureId: input.structureId,
      language,
    });
    return { outline: fb, textTaskId: result.taskId ?? null, textKey };
  }

  const parsed = parseTopicArticleOutline(result.syncResult.text ?? '');
  if (!parsed) {
    const fb = fallbackOutlineFromStructure({
      topic,
      purpose,
      structureId: input.structureId,
      language,
    });
    return { outline: fb, textTaskId: result.taskId ?? null, textKey };
  }
  return { outline: parsed, textTaskId: result.taskId ?? null, textKey };
}
