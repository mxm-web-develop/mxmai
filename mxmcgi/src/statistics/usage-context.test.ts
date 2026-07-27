import { describe, expect, it } from 'vitest';
import {
  mergeUsageContext,
  metricKindForScope,
  normalizeScopeForDisplay,
  resolveUsageContextFromTaskMetadata,
  usageContextToRecord,
} from './usage-context';

describe('normalizeScopeForDisplay', () => {
  it('merges outline into writing', () => {
    expect(normalizeScopeForDisplay('outline')).toBe('writing');
  });

  it('maps image alias to graph', () => {
    expect(normalizeScopeForDisplay('image')).toBe('graph');
  });

  it('falls back unknown scopes to text', () => {
    expect(normalizeScopeForDisplay('unknown')).toBe('text');
  });
});

describe('metricKindForScope', () => {
  it('uses token metrics for text and writing', () => {
    expect(metricKindForScope('text')).toBe('token');
    expect(metricKindForScope('writing')).toBe('token');
    expect(metricKindForScope('outline')).toBe('token');
  });

  it('uses count metrics for graph and media scopes', () => {
    expect(metricKindForScope('graph')).toBe('count');
    expect(metricKindForScope('video')).toBe('count');
    expect(metricKindForScope('audio')).toBe('count');
    expect(metricKindForScope('music')).toBe('count');
  });
});

describe('resolveUsageContextFromTaskMetadata', () => {
  it('marks web tasks without published slug', () => {
    const ctx = resolveUsageContextFromTaskMetadata({ creationSource: 'web' });
    expect(ctx.usageSource).toBe('web');
    expect(ctx.publishedSlug).toBeUndefined();
  });

  it('marks open api tasks with slug and caller', () => {
    const ctx = resolveUsageContextFromTaskMetadata({
      creationSource: 'open_api',
      publishedSlug: 'my-graph',
      publishedApiId: 'api-1',
      openApiCallerId: 'caller-1',
      endUserId: 'eu-1',
    });
    expect(ctx.usageSource).toBe('open_api');
    expect(ctx.publishedSlug).toBe('my-graph');
    expect(ctx.publishedApiId).toBe('api-1');
    expect(ctx.callerUserId).toBe('caller-1');
    expect(ctx.endUserId).toBe('eu-1');
  });

  it('treats caller-only metadata as web (legacy mis-tag)', () => {
    const ctx = resolveUsageContextFromTaskMetadata({
      creationSource: 'open_api',
      openApiCallerId: 'self-user',
    });
    expect(ctx.usageSource).toBe('web');
  });
});

describe('mergeUsageContext', () => {
  it('override wins on conflict', () => {
    const merged = mergeUsageContext(
      { usageSource: 'web', parentTaskId: 'parent-1' },
      { usageSource: 'open_api', publishedSlug: 'slug-a' }
    );
    expect(merged.usageSource).toBe('open_api');
    expect(merged.parentTaskId).toBe('parent-1');
    expect(merged.publishedSlug).toBe('slug-a');
  });
});

describe('usageContextToRecord', () => {
  it('serializes snake_case columns for provider_usage_records', () => {
    const rec = usageContextToRecord({
      usageSource: 'open_api',
      publishedSlug: 'demo',
      parentTaskId: 'task-parent',
    });
    expect(rec).toEqual({
      usage_source: 'open_api',
      published_slug: 'demo',
      parent_task_id: 'task-parent',
    });
  });
});
