import { describe, expect, it } from 'vitest';
import {
  isOpenApiTaskMetadata,
  pickOpenApiMetadataFromParams,
  TASK_CREATION_SOURCE_OPEN_API,
  TASK_CREATION_SOURCE_WEB,
} from './creation-source';

describe('pickOpenApiMetadataFromParams', () => {
  it('returns empty for Task V2 self-use (callerUserId only)', () => {
    expect(
      pickOpenApiMetadataFromParams({
        userId: 'u1',
        callerUserId: 'u1',
        taskV2: { scope: 'graph', taskKey: 'photo' },
      })
    ).toEqual({});
  });

  it('marks published open API with slug + caller', () => {
    expect(
      pickOpenApiMetadataFromParams({
        publishedSlug: 'my-graph',
        publishedApiId: 'api-1',
        openApiCallerId: 'caller-2',
      })
    ).toEqual({
      creationSource: TASK_CREATION_SOURCE_OPEN_API,
      publishedSlug: 'my-graph',
      publishedApiId: 'api-1',
      openApiCallerId: 'caller-2',
    });
  });

  it('marks partner H5 with endUserId', () => {
    expect(
      pickOpenApiMetadataFromParams({
        publishedSlug: 'eshop-root',
        endUserId: 'eu-1',
        partnerAppId: 'pa-1',
      })
    ).toMatchObject({
      creationSource: TASK_CREATION_SOURCE_OPEN_API,
      endUserId: 'eu-1',
      partnerAppId: 'pa-1',
    });
  });
});

describe('isOpenApiTaskMetadata', () => {
  it('treats web creationSource as self-use', () => {
    expect(isOpenApiTaskMetadata({ creationSource: TASK_CREATION_SOURCE_WEB })).toBe(false);
  });

  it('treats callerUserId-only legacy metadata as self-use', () => {
    expect(
      isOpenApiTaskMetadata({
        creationSource: TASK_CREATION_SOURCE_OPEN_API,
        openApiCallerId: 'same-user',
      })
    ).toBe(false);
  });

  it('detects published API metadata', () => {
    expect(
      isOpenApiTaskMetadata({
        creationSource: TASK_CREATION_SOURCE_OPEN_API,
        publishedSlug: 'demo-api',
        publishedApiId: 'id-1',
      })
    ).toBe(true);
  });
});
