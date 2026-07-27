/**
 * 视频表单选项：优先从 Task V2 模板 formSchema 读取时长枚举，与 graph/writing 动态配置一致。
 */

import { loadTaskDefinition } from '../../tasks/task-definition';
import {
  DEFAULT_VIDEO_DURATION_OPTIONS,
  extractDurationOptionsFromFormSchema,
} from './video-params';
import { DEFAULT_VIDEO_TASK_KEY, resolveVideoTaskKey } from './video-task-keys';

export interface VideoFormOption {
  value: string;
  label: string;
  labelEn?: string;
}

export interface VideoFormOptionsConfig {
  seconds: VideoFormOption[];
  _metadata?: Record<string, unknown>;
}

function durationOptionsToFormOptions(seconds: number[], language: 'zh' | 'en'): VideoFormOption[] {
  return seconds.map((n) => ({
    value: String(n),
    label: language === 'en' ? `${n} seconds` : `${n} 秒`,
    labelEn: `${n} seconds`,
  }));
}

/**
 * 解析视频 chunk_seconds / seconds 表单选项。
 * @param taskKey video 业务 taskKey（可与 scriptType 二选一）
 * @param subtype 子类型，默认 default
 */
export async function getVideoFormOptionsResolved(
  language: 'zh' | 'en' = 'zh',
  input?: { taskKey?: string | null; subtype?: string | null; scriptType?: string | null },
): Promise<VideoFormOptionsConfig> {
  const taskKey = resolveVideoTaskKey({
    taskKey: input?.taskKey,
    scriptType: input?.scriptType,
  });
  const subtype = input?.subtype?.trim() || 'default';

  let secondsList: number[] = [...DEFAULT_VIDEO_DURATION_OPTIONS];
  let resolvedFrom: 'template' | 'fallback' = 'fallback';

  try {
    const { template } = await loadTaskDefinition({
      scope: 'video',
      taskKey,
      subtype: subtype === 'default' ? null : subtype,
      lang: language,
    });
    const fromSchema = extractDurationOptionsFromFormSchema(
      template.formSchema as Record<string, unknown>,
    );
    if (fromSchema && fromSchema.length > 0) {
      secondsList = fromSchema;
      resolvedFrom = 'template';
    }
  } catch {
    if (subtype !== 'default') {
      try {
        const { template } = await loadTaskDefinition({
          scope: 'video',
          taskKey,
          subtype: null,
          lang: language,
        });
        const fromSchema = extractDurationOptionsFromFormSchema(
          template.formSchema as Record<string, unknown>,
        );
        if (fromSchema && fromSchema.length > 0) {
          secondsList = fromSchema;
          resolvedFrom = 'template';
        }
      } catch {
        // 使用 fallback
      }
    }
  }

  const options = durationOptionsToFormOptions(secondsList, language);
  return {
    seconds: language === 'en' ? options.map((o) => ({ value: o.value, label: o.label })) : options,
    _metadata: {
      taskKey,
      subtype,
      resolvedFrom,
      defaultTaskKey: DEFAULT_VIDEO_TASK_KEY,
    },
  };
}
