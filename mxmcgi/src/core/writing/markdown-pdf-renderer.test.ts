import { describe, expect, it } from 'vitest';
import { renderMarkdownToPdf } from './markdown-pdf-renderer';

describe('renderMarkdownToPdf', () => {
  it('renders multi-paragraph article without error', async () => {
    const md = [
      '# 沉默的证词',
      '',
      '## 一份来自未来的档案',
      '',
      '**【新闻稿发布】** 公元2173年，人类文明记忆库。',
      '',
      '这是第一段正文，应当单独成行显示。',
      '',
      '这是第二段正文，与上一段之间应有间距，不能叠在一起。',
      '',
      '---',
      '',
      '- 列表项一',
      '- 列表项二',
      '',
      '### 1. 钟楼与寂静',
      '',
      '林深站在钟楼顶端，风从城市的废墟间穿过。',
    ].join('\n');

    const buf = await renderMarkdownToPdf(md);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(800);
  });
});
