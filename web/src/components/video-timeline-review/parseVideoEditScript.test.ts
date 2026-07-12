import { describe, expect, it } from 'vitest';
import { parseVideoEditScript } from './parseVideoEditScript';

const sample = {
  version: '1.0.0',
  project: {
    timeline: {
      duration: 10,
      tracks: [{ type: 'video', clips: [] }],
    },
  },
};

describe('parseVideoEditScript', () => {
  it('解析对象', () => {
    expect(parseVideoEditScript(sample)).toEqual(sample);
  });

  it('解析 JSON 字符串', () => {
    expect(parseVideoEditScript(JSON.stringify(sample))).toEqual(sample);
  });

  it('shot-list 等非 ProjectFile 返回 null', () => {
    expect(parseVideoEditScript({ segments: [{ text: 'a' }] })).toBeNull();
  });

  it('空值返回 null', () => {
    expect(parseVideoEditScript(null)).toBeNull();
    expect(parseVideoEditScript('')).toBeNull();
    expect(parseVideoEditScript('not json')).toBeNull();
  });
});
