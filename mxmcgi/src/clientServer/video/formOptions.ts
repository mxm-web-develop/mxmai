/**
 * 视频业务层表单选项（客户端）
 * chunk_seconds 与 chunk 对齐；由模式决定
 */

export interface VideoFormOption {
  value: string;
  label: string;
  labelEn?: string;
}

export interface VideoFormOptionsConfig {
  seconds: VideoFormOption[];
  _metadata?: Record<string, unknown>;
}

function secondsOptionsByMode(mode: 'sora-2' | 'sora-2-deer'): VideoFormOption[] {
  if (mode === 'sora-2-deer') {
    return [
      { value: '10', label: '10 秒', labelEn: '10 seconds' },
      { value: '15', label: '15 秒', labelEn: '15 seconds' },
    ];
  }
  return [
    { value: '4', label: '4 秒', labelEn: '4 seconds' },
    { value: '8', label: '8 秒', labelEn: '8 seconds' },
    { value: '12', label: '12 秒', labelEn: '12 seconds' },
  ];
}

/**
 * 获取 chunk_seconds 表单选项（随模式切换）
 */
export function getVideoFormOptions(
  language: 'zh' | 'en' = 'zh',
  mode: 'sora-2' | 'sora-2-deer' = 'sora-2'
): VideoFormOptionsConfig {
  const options = secondsOptionsByMode(mode);
  if (language === 'en') {
    return {
      seconds: options.map((opt) => ({
        value: opt.value,
        label: opt.labelEn ?? opt.label,
      })),
    };
  }
  return {
    seconds: [...options],
    _metadata: { mode },
  };
}
