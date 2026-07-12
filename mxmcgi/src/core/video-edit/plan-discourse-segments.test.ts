import { describe, expect, it } from 'vitest';
import { planDiscourseSegments } from './plan-discourse-segments';
import type { VoiceoverSubtitleLike } from './timeline-segment-types';

/** 造一段句级字幕：每句给定文本与时长，顺序拼接 */
function makeSubs(rows: Array<[string, number]>): VoiceoverSubtitleLike[] {
  let t = 0;
  return rows.map(([text, dur]) => {
    const startSeconds = t;
    t += dur;
    return { text, startSeconds, endSeconds: t };
  });
}

describe('planDiscourseSegments', () => {
  it('splits opening greeting into a distinct opening window', () => {
    const subs = makeSubs([
      ['大家好，欢迎来到本期节目', 3.5],
      ['今天我们聊聊中美人形机器人的发展对比', 4],
      ['首先看中国这边的进展', 4],
      ['国产厂商加速量产', 4],
    ]);
    const segs = planDiscourseSegments(subs, 15.5, 5, 10);
    expect(segs[0]!.beatRole).toBe('opening');
    // 开场白独立成段，不与正文合并
    expect(segs[0]!.endSeconds).toBeLessThanOrEqual(8);
    expect(segs.length).toBeGreaterThanOrEqual(2);
  });

  it('starts a new section at transition markers (下面/首先)', () => {
    const subs = makeSubs([
      ['中国厂商在加速量产人形机器人', 4],
      ['产业链逐步成熟', 3],
      ['下面我们来看看美国这边的情况', 4],
      ['特斯拉的 Optimus 是代表', 4],
      ['马斯克给出了激进的时间表', 3],
    ]);
    const segs = planDiscourseSegments(subs, 18, 5, 10);
    // 存在一个由「下面」触发的 transition 段
    const transition = segs.find((s) => s.beatRole === 'transition');
    expect(transition).toBeTruthy();
    expect(transition!.voiceoverText).toContain('下面我们来看看美国');
  });

  it('marks trailing closing sentences as closing', () => {
    const subs = makeSubs([
      ['中国厂商在加速量产', 4],
      ['美国由特斯拉领跑', 4],
      ['总之中美各有优势', 3.5],
      ['感谢观看我们下期再见', 3.5],
    ]);
    const segs = planDiscourseSegments(subs, 15, 5, 10);
    expect(segs[segs.length - 1]!.beatRole).toBe('closing');
  });

  it('windows are continuous and cover full duration', () => {
    const subs = makeSubs([
      ['大家好', 2],
      ['今天聊机器人', 3],
      ['下面看数据', 4],
      ['数据显示增长很快', 5],
      ['最后总结一下', 4],
    ]);
    const total = 20;
    const segs = planDiscourseSegments(subs, total, 5, 10);
    expect(segs[0]!.startSeconds).toBe(0);
    expect(segs[segs.length - 1]!.endSeconds).toBe(total);
    for (let i = 0; i < segs.length - 1; i++) {
      expect(segs[i]!.endSeconds).toBe(segs[i + 1]!.startSeconds);
    }
  });

  it('falls back to pure duration split when no markers present', () => {
    const subs = makeSubs(
      Array.from({ length: 12 }, (_, i) => [`陈述句${i + 1}`, 2] as [string, number])
    );
    const segs = planDiscourseSegments(subs, 24, 5, 10);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.every((s) => s.beatRole === 'body')).toBe(true);
  });
});
