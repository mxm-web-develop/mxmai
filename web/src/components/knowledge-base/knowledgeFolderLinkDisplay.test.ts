import { describe, expect, it } from 'vitest';
import type { KnowledgeFolderLinkItem } from '../../api/client';
import { resolveLinkDisplayTitle } from './knowledgeFolderLinkDisplay';

/**
 * 注意：测试不依赖 i18n 的实际翻译结果（vitest 环境 i18n 翻译键可能未注册），
 * 改为断言"不展示 prompt"+"以任务短码结尾"，形态对即可。
 */

function makeLink(overrides: Partial<KnowledgeFolderLinkItem> = {}): KnowledgeFolderLinkItem {
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
    expect(t).toBe('中美科技对比选题');
    // 有业务 label 时不再混入短码
    expect(t).not.toContain('#');
  });

  it('写作任务：metadata.label 携带时间戳（如创建任务默认名）时原样展示，与列表对齐', () => {
    // 与 buildDefaultTaskLabelFromSelection 生成的「subtypeLabel-yyyyMMdd_HHmmss」一致
    const t = resolveLinkDisplayTitle(
      makeLink({
        task_type: 'writing',
        metadata: {
          label: '选题长文-20260711_170150',
          taskLabel: '写作',
          subtypeLabel: '选题长文',
        },
      })
    );
    expect(t).toBe('选题长文-20260711_170150');
    expect(t).not.toContain('#');
  });

  it('写作任务：仅有 subtypeLabel 时展示子类名（与列表卡片字段一致）', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({
        task_type: 'writing',
        metadata: { subtypeLabel: '选题长文' },
      })
    );
    expect(t).toBe('选题长文');
    expect(t).not.toContain('#');
  });

  it('写作任务：subtypeLabel 优先于 taskLabel（与列表卡片子标题对齐）', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({
        task_type: 'writing',
        metadata: { taskLabel: '写作', subtypeLabel: '行业日报' },
      })
    );
    // 子类名比「业务 · 子类」更贴近列表卡片上的子类标签
    expect(t).toBe('行业日报');
    expect(t).not.toContain('#');
  });

  it('写作任务：仅有 taskLabel「写作」时不单独当标题，回退短码', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({ task_type: 'writing', metadata: { taskLabel: '写作' } })
    );
    expect(t).not.toBe('写作');
    expect(t).toMatch(/#abcdef12$/);
  });

  it('写作任务：contentPreview 刊头与列表卡片 headline 对齐', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({
        task_type: 'writing',
        name: '写作',
        metadata: {
          taskLabel: '写作',
          contentPreview: '# 史前文明证据考：方法论视角下的可证伪性\n\n正文…',
        },
      })
    );
    expect(t).toBe('史前文明证据考：方法论视角下的可证伪性');
  });

  it('写作任务：后端已写入 link.name 刊头时直接使用', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({
        task_type: 'writing',
        name: '沉默的证词',
        metadata: { taskLabel: '写作' },
      })
    );
    expect(t).toBe('沉默的证词');
  });

  it('写作任务：用户标题优先于业务标签', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({
        task_type: 'writing',
        metadata: {
          label: '我的自定义标题',
          taskLabel: '写作',
          subtypeLabel: '行业日报',
        },
      })
    );
    expect(t).toBe('我的自定义标题');
    expect(t).not.toContain('行业日报');
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

  it('文集单篇（markdown 上传）：标题用 label，不带「上传档案」前缀', () => {
    const t = resolveLinkDisplayTitle({
      type: 'link',
      ref_type: 'storage_object',
      id: 'ms0000000001',
      object_id: 'ms0000000001',
      name: '随考古学家翻开史前.md',
      content_type: 'text/markdown;charset=utf-8',
      created_at: '2026-01-01T00:00:00Z',
      metadata: {
        asset_type: 'writing_manuscript',
        label: '随考古学家翻开史前',
        contentPreview: '# 随考古学家翻开史前\n\n正文…',
      },
    });
    expect(t).toBe('随考古学家翻开史前');
    expect(t).not.toContain('上传');
  });

  it('旧 markdown 软链无 asset_type：仍按文稿标题（去 .md）', () => {
    const t = resolveLinkDisplayTitle({
      type: 'link',
      ref_type: 'storage_object',
      id: 'ms0000000002',
      object_id: 'ms0000000002',
      name: '随考古学家翻开史前.md',
      content_type: 'text/markdown;charset=utf-8',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(t).toBe('随考古学家翻开史前');
    expect(t).not.toContain('上传档案');
  });

  it('broken 软链：fallback 业务名 + 短码，不展示 prompt', () => {
    const t = resolveLinkDisplayTitle(
      makeLink({ task_type: 'writing', broken: true, name: '【角色】…' })
    );
    expect(t).not.toContain('【角色】');
    expect(t).toMatch(/#abcdef12$/);
  });
});
