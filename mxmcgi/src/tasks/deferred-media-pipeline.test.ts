import { describe, expect, it } from 'vitest';
import {
  isVoiceOverPlaceholderPrompt,
  restoreUserTopicIfPromptContaminated,
  shouldDeferBusinessPrePipeline,
  shouldDeferBusinessPrePromptPipeline,
} from './deferred-media-pipeline';
import { getInputRunner } from './pipeline-registry';
import './business-pipeline';
import type { TaskTemplate } from './types';

describe('business-pipeline side-effect registration', () => {
  it('worker 延迟前置路径应已注册 sensitiveCheck', () => {
    expect(typeof getInputRunner('sensitiveCheck')).toBe('function');
  });
});

describe('shouldDeferBusinessPrePipeline', () => {
  it('text 同步 scope 不延迟', () => {
    expect(shouldDeferBusinessPrePipeline('text')).toBe(false);
  });

  it('所有异步 scope 均延迟前置', () => {
    for (const scope of ['outline', 'writing', 'graph', 'video', 'audio', 'music']) {
      expect(shouldDeferBusinessPrePipeline(scope)).toBe(true);
    }
  });
});

describe('shouldDeferBusinessPrePromptPipeline (legacy)', () => {
  it('与 shouldDeferBusinessPrePipeline 对齐', () => {
    const template = { formSchema: { type: 'object', properties: {} } } as TaskTemplate;
    expect(shouldDeferBusinessPrePromptPipeline('graph', template, null)).toBe(true);
    expect(shouldDeferBusinessPrePromptPipeline('text', template, null)).toBe(false);
  });
});

describe('restoreUserTopicIfPromptContaminated', () => {
  it('从已渲染模板还原用户话题', () => {
    const contaminated = {
      prompt:
        '【角色】\n你是作者\n\n【用户话题 — 全文必须紧扣此主题】\nOpenAI 发布 GPT-5 的传闻\n\n【可选标题】',
    };
    const next = restoreUserTopicIfPromptContaminated(contaminated);
    expect(next.prompt).toBe('OpenAI 发布 GPT-5 的传闻');
  });

  it('普通用户输入不改动', () => {
    const raw = { prompt: '量子计算最新进展' };
    expect(restoreUserTopicIfPromptContaminated(raw)).toEqual(raw);
  });
});

describe('isVoiceOverPlaceholderPrompt', () => {
  it('识别占位模板', () => {
    const t =
      '【源文本】\n# 标题\n\n正文…\n\n（正文由 text/transform 管线生成，本模板仅用于上下文占位。）';
    expect(isVoiceOverPlaceholderPrompt(t)).toBe(true);
  });

  it('口播稿正文不判为占位', () => {
    expect(isVoiceOverPlaceholderPrompt('大家好，今天我们来聊聊 AI 基础设施。')).toBe(false);
  });
});
