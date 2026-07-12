import { describe, expect, it } from 'vitest';
import type { VirtualFolderLinkItem } from '../../api/client';
import { resolveLinkDisplayTitle } from './virtualFolderLinkDisplay';

/**
 * 注意：测试不依赖 i18n 的实际翻译结果（vitest 环境 i18n 翻译键可能未注册），
 * 改为断言"不展示 prompt"+"以任务短码结尾"，形态对即可。
 */

function makeLink(overrides: Partial<VirtualFolderLinkItem> = {}): VirtualFolderLinkItem {
  return {
    type: 'link',
    ref_type: 'task',
    id: 'abcdef1234567890',
    task_id: 'abcdef1234567890',
    name: '【角色】你是资深 AI 科技自媒体作者…',
    task_type: 'writing',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveLinkDisplayTitle', () => {
  it('写作任务：不展示 prompt 原文，包含任务短码', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({ task_type: 'writing', name: '【角色】你是资深 AI 科技自媒体作者…' })
    );
    expect(t).not.toContain('【角色】');
    expect(t).not.toContain('资深');
    expect(t).toMatch(/#abcdef12$/);
  });

  it('写作任务若有 metadata.label，展示 label 即可（业务语义）', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({ task_type: 'writing', metadata: { label: '中美科技对比选题' } })
    );
    expect(t).toBe('Writing · 中美科技对比选题');
    // 有业务 label 时不再混入短码
    expect(t).not.toContain('#');
  });

  it('音频任务：不展示包含的指令文案', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({ task_type: 'audio', name: '请用温暖男声平稳输出…' })
    );
    expect(t).not.toContain('请用温暖男声');
    expect(t).toMatch(/#abcdef12$/);
  });

  it('storage_object 音色：使用 metadata.label，不再展示技术文件名', () => {
    const t = resolveLinkDisplayTitle({
      type: 'link',
      ref_type: 'storage_object',
      id: 'voice0000001',
      object_id: 'voice0000001',
      name: 'minimax_voice_001.wav',
      task_type: 'audio',
      content_type: 'audio/wav',
      created_at: '2026-01-01T00:00:00Z',
      metadata: { asset_type: 'minimax_voice', label: '温暖男声小李', voice_id: 'male_xiaoli' },
    });
    expect(t).toContain('温暖男声小李');
    expect(t).not.toContain('minimax_voice_001');
  });

  it('storage_object 上传非音色：保留原文件名（这是用户上传的文件名）', () => {
    const t = resolveLinkDisplayTitle({
      type: 'link',
      ref_type: 'storage_object',
      id: 'obj00000001',
      object_id: 'obj00000001',
      name: '产品宣传册.pdf',
      task_type: 'text',
      content_type: 'application/pdf',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(t).toContain('产品宣传册.pdf');
  });

  it('broken 软链：fallback 业务名 + 短码，不展示 prompt', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({ task_type: 'writing', broken: true, name: '【角色】…' })
    );
    expect(t).not.toContain('【角色】');
    expect(t).toMatch(/#abcdef12$/);
  });
});
