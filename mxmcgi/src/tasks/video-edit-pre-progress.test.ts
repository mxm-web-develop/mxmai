import { describe, expect, it } from 'vitest';
import { getVideoEditPreStepProgress, transcribeProgressMessage } from './video-edit-pre-progress';

describe('getVideoEditPreStepProgress', () => {
  it('maps voiceover pre steps to 10→25→35 milestones', () => {
    expect(getVideoEditPreStepProgress({ step: 'resolveVoiceoverAudio' })).toEqual({
      progress: 10,
      message: '探测口播时长…',
    });
    expect(getVideoEditPreStepProgress({ step: 'transcribeVoiceoverAudio' })).toEqual({
      progress: 15,
      message: 'ASR 识别中…',
    });
    expect(getVideoEditPreStepProgress({ step: 'planVideoCutWindows' })).toEqual({
      progress: 20,
      message: '规划切镜时间窗…',
    });
    expect(
      getVideoEditPreStepProgress({
        step: 'nestedText',
        nestedTextTaskKey: 'text/plan/video-cut-beat',
      })
    ).toEqual({ progress: 24, message: '剪辑节拍推理中…' });
    expect(
      getVideoEditPreStepProgress({
        step: 'nestedText',
        nestedTextTaskKey: 'text/plan/video-shot-list',
      })
    ).toEqual({ progress: 28, message: '分镜画面生成中…' });
    expect(getVideoEditPreStepProgress({ step: 'buildVideoEditTimeline' })).toEqual({
      progress: 32,
      message: '组装剪辑时间轴…',
    });
  });
});

describe('transcribeProgressMessage', () => {
  it('uses 18% when stored subtitles skip ASR', () => {
    expect(transcribeProgressMessage('stored_subtitles')).toEqual({
      progress: 18,
      message: '加载已有字幕…',
    });
    expect(transcribeProgressMessage('tts_subtitles')).toEqual({
      progress: 18,
      message: '加载已有字幕…',
    });
  });
});
