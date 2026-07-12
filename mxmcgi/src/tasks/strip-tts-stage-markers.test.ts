import { describe, expect, it } from 'vitest';
import { stripTtsStageMarkers } from './strip-tts-stage-markers';

describe('stripTtsStageMarkers', () => {
  it('剥除独占一行的 [开场]/[主稿]/[结束] 三段小标题', () => {
    const input = `[开场]
大家好，这里是 MxM 人工智能情报站，我是猫小狸。

[主稿]
二零二六年的春天，具身机器人走进家庭。

[结束]
我们下期再见。`;
    const out = stripTtsStageMarkers(input);
    expect(out).not.toContain('[开场]');
    expect(out).not.toContain('[主稿]');
    expect(out).not.toContain('[结束]');
    expect(out).toContain('大家好，这里是 MxM 人工智能情报站');
    expect(out).toContain('二零二六年的春天');
    expect(out).toContain('我们下期再见');
  });

  it('保留正文里的方括号引用，不误伤', () => {
    const input = `本期要点：参考文献 [1] 显示市场规模翻倍。`;
    expect(stripTtsStageMarkers(input)).toBe(input);
  });

  it('行内混入文本的 [xxx] 不会被删除（避免破坏正文）', () => {
    const input = `他说：[开场] 这部分要好好讲。`;
    // 行内 + 后跟其它字符 → 不算"段落标记词行"，保留原文
    expect(stripTtsStageMarkers(input)).toBe(input);
  });

  it('连续多个空行折叠为单个空行', () => {
    const input = `[开场]
大家好。




[主稿]
二零二六年的春天。`;
    const out = stripTtsStageMarkers(input);
    // 不再出现 [开场]/[主稿]，且不会有 4 个以上连续换行
    expect(out).not.toMatch(/\n{4,}/);
    expect(out).toContain('大家好');
    expect(out).toContain('二零二六年的春天');
  });

  it('英文 stage marker 也能识别', () => {
    const input = `[Intro]
Hi everyone.

[Body]
Today we talk about robotics.

[Outro]
See you next time.`;
    const out = stripTtsStageMarkers(input);
    expect(out).not.toContain('[Intro]');
    expect(out).not.toContain('[Body]');
    expect(out).not.toContain('[Outro]');
  });

  it('空输入返回空字符串', () => {
    expect(stripTtsStageMarkers('')).toBe('');
  });
});