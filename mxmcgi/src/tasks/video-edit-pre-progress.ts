import type { PipelineStep } from './types';

/** 自动剪辑（voiceover-science-pop）前置管线进度：10 → 25 → 35（审核） */
export function getVideoEditPreStepProgress(step: PipelineStep): { progress: number; message: string } {
  const name = String(step.step ?? '');
  if (name === 'resolveVoiceoverAudio') {
    return { progress: 10, message: '探测口播时长…' };
  }
  if (name === 'transcribeVoiceoverAudio') {
    return { progress: 15, message: 'ASR 识别中…' };
  }
  if (name === 'planVideoCutWindows') {
    return { progress: 20, message: '规划切镜时间窗…' };
  }
  if (name === 'nestedText') {
    const key = String(step.nestedTextTaskKey ?? step.params?.nestedTextTaskKey ?? '');
    if (key.includes('video-cut-beat')) {
      return { progress: 24, message: '剪辑节拍推理中…' };
    }
    if (key.includes('video-shot-list')) {
      return { progress: 28, message: '分镜画面生成中…' };
    }
    return { progress: 22, message: '文本子任务处理中…' };
  }
  if (name === 'buildVideoEditTimeline' || name === 'buildSciencePopTimeline') {
    return { progress: 32, message: '组装剪辑时间轴…' };
  }
  return { progress: 18, message: '正在执行前置步骤…' };
}

export function transcribeProgressMessage(skippedReason?: string): { progress: number; message: string } {
  if (skippedReason === 'tts_subtitles' || skippedReason === 'stored_subtitles') {
    return { progress: 18, message: '加载已有字幕…' };
  }
  if (skippedReason === 'user_script') {
    return { progress: 18, message: '使用口播稿估算字幕…' };
  }
  return { progress: 15, message: 'ASR 识别中…' };
}
