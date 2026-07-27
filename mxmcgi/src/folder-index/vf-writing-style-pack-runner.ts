/**
 * 语感文风卡：通过入库 text 业务抽取单篇 / 汇总整包（禁止直连 DeerAPI）
 */
import type { AppLocale } from '@mxmai/mxmdata';
import { runTaskV2 } from '../tasks/task-engine';
import { parseLlmStructuredOutput } from '../tasks/parse-llm-json';
import {
  normalizeWritingStyleObj,
  normalizeWritingStylePackSummary,
  type WritingStyleObj,
  type WritingStylePackSummary,
} from './writing-style-types';

export const VF_WRITING_FRAME_TASK_KEY = 'text/transform/vf-writing-frame';
export const VF_WRITING_PACK_TASK_KEY = 'text/transform/vf-writing-pack';

async function runTextTransform(
  userId: string,
  subtype: 'vf-writing-frame' | 'vf-writing-pack',
  params: Record<string, unknown>
): Promise<string> {
  const result = await runTaskV2(
    {
      scope: 'text',
      taskKey: 'transform',
      subtype,
      params: {
        ...params,
        metadata: {
          ...((params.metadata as Record<string, unknown> | undefined) ?? {}),
          virtualFolderWritingStylePack: true,
          subtype,
        },
      },
    },
    userId
  );
  if (!result.success || !result.syncResult) {
    throw new Error(
      `语感文风解析 text/${subtype} 失败（taskId=${result.taskId}，status=${result.status}）`
    );
  }
  const text = result.syncResult.text ?? '';
  if (!text.trim()) {
    throw new Error(`语感文风解析 text/${subtype} 返回空文本`);
  }
  return text;
}

/** 一篇文章 / 文稿 → WritingStyleObj */
export async function runVfWritingFrameFromText(
  userId: string,
  input: { articleText: string; title?: string; userLang?: AppLocale }
): Promise<WritingStyleObj> {
  const articleText = input.articleText.trim();
  if (!articleText) {
    throw new Error('文章正文为空，无法抽取语感文风');
  }
  const text = await runTextTransform(userId, 'vf-writing-frame', {
    article_text: articleText.slice(0, 120000),
    asset_title: input.title || '',
    user_language: input.userLang ?? 'zh',
    prompt: articleText.slice(0, 2000),
  });
  const parsed = parseLlmStructuredOutput(text, VF_WRITING_FRAME_TASK_KEY);
  return normalizeWritingStyleObj(parsed, { title: input.title });
}

/** 多篇汇总 → WritingStylePackSummary */
export async function runVfWritingPack(
  userId: string,
  input: {
    folderName: string;
    frames: WritingStyleObj[];
    userLang?: AppLocale;
  }
): Promise<WritingStylePackSummary> {
  const slim = input.frames.map((f) => {
    const { title: _t, ref_type, ref_id, ...rest } = f;
    return {
      ...rest,
      ...(ref_type && ref_id ? { ref_key: `${ref_type}:${ref_id}` } : {}),
      ...(f.title ? { title: f.title } : {}),
    };
  });
  const frames_json = JSON.stringify(slim);
  const text = await runTextTransform(userId, 'vf-writing-pack', {
    folder_name: input.folderName,
    frame_count: input.frames.length,
    user_language: input.userLang ?? 'zh',
    frames_json,
    prompt: `folder=${input.folderName}; frames=${input.frames.length}`,
  });
  const parsed = parseLlmStructuredOutput(text, VF_WRITING_PACK_TASK_KEY);
  const exemplarGuess = input.frames
    .filter((f) => f.ref_type && f.ref_id)
    .sort((a, b) => (b.fit_score ?? b.confidence) - (a.fit_score ?? a.confidence))
    .slice(0, 5)
    .map((f) => `${f.ref_type}:${f.ref_id}`);
  return normalizeWritingStylePackSummary(parsed, {
    frameCount: input.frames.length,
    folderName: input.folderName,
    exemplarRefIds: exemplarGuess,
    frames: input.frames,
  });
}
