/**
 * superxmmai Timeline Builder — 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  buildMxmProject,
  serializeMxmProject,
  parseMxmProject,
  validateMxmProject,
  getChunkAtTime,
  getSubtitleAtTime,
  getStoryboardByChunkId,
  newMxmId,
} from './mxm-timeline-builder';
import { MXM_TIMELINE_VERSION } from './mxm-timeline-types';
import type {
  MxmProjectBuildInput,
} from './mxm-timeline-types';
import type { StoryboardChunk } from '../writing/type';

const makeChunk = (overrides: Partial<StoryboardChunk> = {}): StoryboardChunk => ({
  index: 0,
  chunk_seconds: 5,
  video_description: 'test',
  ...overrides,
});

const makeInput = (overrides: Partial<MxmProjectBuildInput> = {}): MxmProjectBuildInput => ({
  id: 'test-1',
  videoChunks: [
    { id: 'c0', duration: 5, mediaUrl: 'https://r2/c0.mp4' },
    { id: 'c1', duration: 8, mediaUrl: 'https://r2/c1.mp4' },
  ],
  ...overrides,
});

describe('buildMxmProject', () => {
  it('基本构建', () => {
    const p = buildMxmProject(makeInput());
    expect(p.version).toBe(MXM_TIMELINE_VERSION);
    expect(p.id).toBe('test-1');
    expect(p.settings.duration).toBe(13);
    expect(p.videoTrack.chunks).toHaveLength(2);
    expect(p.subtitleTrack.subtitles).toHaveLength(0);
  });

  it('chunk startTime 累加正确', () => {
    const p = buildMxmProject(makeInput({
      videoChunks: [
        { id: 'c0', duration: 5, mediaUrl: 'u0' },
        { id: 'c1', duration: 8, mediaUrl: 'u1' },
        { id: 'c2', duration: 3, mediaUrl: 'u2' },
      ],
    }));
    expect(p.videoTrack.chunks[0].startTime).toBe(0);
    expect(p.videoTrack.chunks[1].startTime).toBe(5);
    expect(p.videoTrack.chunks[2].startTime).toBe(13);
    expect(p.settings.duration).toBe(16);
  });

  it('默认 effect: 首段 fadeIn, 末段 fadeOut, 中间 none, 独段 fadeInOut', () => {
    const p = buildMxmProject(makeInput({
      videoChunks: [
        { id: 'c0', duration: 5, mediaUrl: 'u0' },
        { id: 'c1', duration: 5, mediaUrl: 'u1' },
        { id: 'c2', duration: 5, mediaUrl: 'u2' },
      ],
    }));
    expect(p.videoTrack.chunks[0].effect).toBe('fadeIn');
    expect(p.videoTrack.chunks[1].effect).toBe('none');
    expect(p.videoTrack.chunks[2].effect).toBe('fadeOut');

    const single = buildMxmProject(makeInput({
      videoChunks: [{ id: 'c0', duration: 5, mediaUrl: 'u0' }],
    }));
    expect(single.videoTrack.chunks[0].effect).toBe('fadeInOut');
  });

  it('转场: 相邻 chunk 间默认 dissolve 0.5s', () => {
    const p = buildMxmProject(makeInput());
    expect(p.transitions).toHaveLength(1);
    expect(p.transitions![0].type).toBe('dissolve');
    expect(p.transitions![0].duration).toBe(0.5);
    expect(p.transitions![0].fromChunkId).toBe('c0');
    expect(p.transitions![0].toChunkId).toBe('c1');
    expect(p.transitions![0].startTime).toBe(4.5);
  });

  it('单段无转场', () => {
    const p = buildMxmProject(makeInput({
      videoChunks: [{ id: 'c0', duration: 5, mediaUrl: 'u0' }],
    }));
    expect(p.transitions).toHaveLength(0);
  });

  it('sourceStoryboard 引用正确', () => {
    const storyboard = makeChunk({
      index: 3,
      video_description: 'cat playing',
      camera_movement: 'pan',
      dialogue: 'meow',
    });
    const p = buildMxmProject(makeInput({
      videoChunks: [
        { id: 'c0', duration: 5, mediaUrl: 'u0', sourceChunk: storyboard },
      ],
    }));
    const ref = p.videoTrack.chunks[0].sourceStoryboard;
    expect(ref?.chunkIndex).toBe(3);
    expect(ref?.description).toBe('cat playing');
    expect(ref?.cameraMovement).toBe('pan');
    expect(ref?.dialogue).toBe('meow');
  });

  it('字幕按 startTime 排序', () => {
    const p = buildMxmProject(makeInput({
      subtitles: [
        { id: 's2', startTime: 10, endTime: 12, text: 'b' },
        { id: 's1', startTime: 5, endTime: 7, text: 'a' },
        { id: 's3', startTime: 15, endTime: 18, text: 'c' },
      ],
    }));
    expect(p.subtitleTrack.subtitles.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('BGM 音频轨', () => {
    const p = buildMxmProject(makeInput({
      audio: {
        mediaUrl: 'bgm.mp3',
        duration: 100,
        volume: 0.3,
        ducking: true,
        source: 'bgm',
      },
    }));
    expect(p.audioTrack?.mediaUrl).toBe('bgm.mp3');
    expect(p.audioTrack?.volume).toBe(0.3);
    expect(p.audioTrack?.ducking).toBe(true);
    expect(p.audioTrack?.source).toBe('bgm');
  });

  it('参数校验: id 必填', () => {
    expect(() => buildMxmProject({ ...makeInput(), id: '' })).toThrow(/id 必填/);
  });

  it('参数校验: videoChunks 不能为空', () => {
    expect(() => buildMxmProject(makeInput({ videoChunks: [] }))).toThrow(/videoChunks 不能为空/);
  });

  it('参数校验: duration 必须 > 0', () => {
    expect(() =>
      buildMxmProject(makeInput({
        videoChunks: [{ id: 'c0', duration: 0, mediaUrl: 'u0' }],
      })),
    ).toThrow(/duration 必须 > 0/);
  });

  it('参数校验: mediaUrl 必填', () => {
    expect(() =>
      buildMxmProject(makeInput({
        videoChunks: [{ id: 'c0', duration: 5, mediaUrl: '' }],
      })),
    ).toThrow(/mediaUrl 必填/);
  });
});

describe('serialize / parse', () => {
  it('序列化 → 解析 往返一致', () => {
    const p = buildMxmProject(makeInput({
      name: 'roundtrip test',
      subtitles: [{ id: 's0', startTime: 0, endTime: 5, text: 'hi' }],
    }));
    const json = serializeMxmProject(p, { description: 'test' });
    const parsed = parseMxmProject(json);
    expect(parsed.project.id).toBe(p.id);
    expect(parsed.project.name).toBe('roundtrip test');
    expect(parsed.project.subtitleTrack.subtitles).toHaveLength(1);
    expect(parsed.metadata?.description).toBe('test');
  });

  it('解析失败: 无效 JSON', () => {
    expect(() => parseMxmProject('not json')).toThrow(/JSON 解析失败/);
  });

  it('解析失败: 缺 version', () => {
    expect(() => parseMxmProject('{"project":{}}')).toThrow(/version/);
  });

  it('解析失败: 不支持的 version', () => {
    expect(() => parseMxmProject('{"version":"99.0.0","project":{}}')).toThrow(/不支持的 version/);
  });

  it('解析失败: 缺 project.id', () => {
    expect(() =>
      parseMxmProject(JSON.stringify({ version: MXM_TIMELINE_VERSION, project: { name: 'x' } })),
    ).toThrow(/project\.id/);
  });
});

describe('validateMxmProject', () => {
  it('合法项目 valid=true', () => {
    const p = buildMxmProject(makeInput());
    const json = serializeMxmProject(p);
    const parsed = parseMxmProject(json);
    const v = validateMxmProject(parsed);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('缺 mediaUrl → 报错', () => {
    expect(() =>
      buildMxmProject(makeInput({
        videoChunks: [{ id: 'c0', duration: 5, mediaUrl: '   ' }],
      })),
    ).toThrow(/mediaUrl 必填/);
  });

  it('转场引用不存在的 chunk → 报错', () => {
    const p = buildMxmProject(makeInput({
      videoChunks: [{ id: 'c0', duration: 5, mediaUrl: 'u0' }],
    }));
    // 手动注入错误转场
    const bad = {
      ...p,
      transitions: [{
        id: 't0', fromChunkId: 'c0', toChunkId: 'ghost', type: 'cut' as const, duration: 0.5, startTime: 4.5,
      }],
    };
    const parsed = parseMxmProject(serializeMxmProject(bad));
    const v = validateMxmProject(parsed);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('ghost'))).toBe(true);
  });
});

describe('工具函数', () => {
  it('getChunkAtTime 找当前 chunk', () => {
    const p = buildMxmProject(makeInput());
    expect(getChunkAtTime(p, 0)?.id).toBe('c0');
    expect(getChunkAtTime(p, 4.9)?.id).toBe('c0');
    expect(getChunkAtTime(p, 5)?.id).toBe('c1');
    expect(getChunkAtTime(p, 12.9)?.id).toBe('c1');
    expect(getChunkAtTime(p, 99)).toBeUndefined();
  });

  it('getSubtitleAtTime 找当前字幕', () => {
    const p = buildMxmProject(makeInput({
      subtitles: [
        { id: 's0', startTime: 0, endTime: 5, text: 'A' },
        { id: 's1', startTime: 5, endTime: 10, text: 'B' },
      ],
    }));
    expect(getSubtitleAtTime(p, 2)?.text).toBe('A');
    expect(getSubtitleAtTime(p, 7)?.text).toBe('B');
  });

  it('getStoryboardByChunkId 反查', () => {
    const storyboard = makeChunk({ index: 7, video_description: 'find me' });
    const p = buildMxmProject(makeInput({
      videoChunks: [
        { id: 'c0', duration: 5, mediaUrl: 'u0', sourceChunk: storyboard },
      ],
    }));
    const ref = getStoryboardByChunkId(p, 'c0');
    expect(ref?.chunkIndex).toBe(7);
  });

  it('newMxmId 生成唯一 ID', () => {
    const a = newMxmId('chunk');
    const b = newMxmId('chunk');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^chunk-/);
  });
});
