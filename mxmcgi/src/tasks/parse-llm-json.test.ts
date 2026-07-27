import { describe, expect, it } from 'vitest';
import { ConfigurationError } from './errors';
import {
  assertShotListOutput,
  escapeRawControlsInJsonStrings,
  extractJsonObject,
  parseLlmStructuredOutput,
  salvageTruncatedArrayField,
  salvageTruncatedItemsObject,
  stripOuterMarkdownFence,
} from './parse-llm-json';

describe('parse-llm-json', () => {
  it('extractJsonObject ignores trailing prose', () => {
    const raw = 'reasoning...\n{"global_topic":"x","segments":[{"text":"a"}]}\n说明完毕';
    expect(extractJsonObject(raw)).toBe('{"global_topic":"x","segments":[{"text":"a"}]}');
  });

  it('parseLlmStructuredOutput handles markdown fence', () => {
    const v = parseLlmStructuredOutput('```json\n{"segments":[{"text":"a"}]}\n```', 'shot-list');
    expect(v).toEqual({ segments: [{ text: 'a' }] });
  });

  it('stripOuterMarkdownFence handles unclosed opening fence', () => {
    expect(stripOuterMarkdownFence('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it('parseLlmStructuredOutput handles unclosed ```json fence (truncated)', () => {
    const raw =
      '```json\n{"title":"具身机器人","aspect_ratio":"16:9","items":[{"id":"i1","order":1,"title":"封面","mxmImagePrompt":"扁平封面"}]}';
    const v = parseLlmStructuredOutput(raw, 'nestedText「text/plan/album-spec」');
    expect(v).toMatchObject({ title: '具身机器人', items: [{ id: 'i1' }] });
  });

  it('salvageTruncatedItemsObject keeps completed items', () => {
    const raw =
      '{"title":"T","items":[{"id":"i1","order":1,"title":"A","mxmImagePrompt":"p1"},{"id":"i2","order":2,"title":"B","mxmImagePrompt":"未闭合';
    const salvaged = salvageTruncatedItemsObject(raw);
    expect(salvaged).toBeTruthy();
    const v = JSON.parse(salvaged!);
    expect(v.items).toHaveLength(1);
    expect(v.items[0].id).toBe('i1');
  });

  it('salvageTruncatedArrayField keeps completed segments behind ```json fence', () => {
    const raw =
      '```json\n{"global_topic":"机器人","segments":[{"text":"开场","startSeconds":0,"durationSeconds":8},{"text":"第二镜","startSeconds":8,"durationSeconds":6,"mxmVideoPrompt":"未闭合';
    const salvaged = salvageTruncatedArrayField(stripOuterMarkdownFence(raw), 'segments');
    expect(salvaged).toBeTruthy();
    const v = parseLlmStructuredOutput(raw, 'nestedText「text/plan/video-shot-list」');
    expect(v).toMatchObject({ global_topic: '机器人', segments: [{ text: '开场' }] });
    expect((v as { segments: unknown[] }).segments).toHaveLength(1);
  });

  it('escapeRawControlsInJsonStrings escapes bare newlines inside strings', () => {
    const raw = '{"a":"line1\nline2"}';
    expect(JSON.parse(escapeRawControlsInJsonStrings(raw))).toEqual({ a: 'line1\nline2' });
  });

  it('parseLlmStructuredOutput sanitizes trailing commas', () => {
    const v = parseLlmStructuredOutput('{"segments":[{"text":"a",},],}', 'shot-list');
    expect(v).toEqual({ segments: [{ text: 'a' }] });
  });

  it('throws ConfigurationError on invalid JSON', () => {
    expect(() => parseLlmStructuredOutput('{"bad": "unclosed', 'shot-list')).toThrow(ConfigurationError);
  });

  it('assertShotListOutput requires segments', () => {
    expect(() => assertShotListOutput({ global_topic: 'x' }, '{}')).toThrow(ConfigurationError);
  });
});
