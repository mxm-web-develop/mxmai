import { describe, expect, it } from 'vitest';
import {
  collectFolderCardAssetDescriptors,
  type FolderCardAssetSource,
} from './resolve-card-assets';

describe('collectFolderCardAssetDescriptors', () => {
  it('reads x-asset-source from formSchema', () => {
    const schema = {
      type: 'object',
      properties: {
        host_portrait: {
          type: 'string',
          'x-asset-source': {
            from: 'folder_card',
            need: 'appearance_primary',
            folder_param: 'character_folder_id',
          } satisfies FolderCardAssetSource,
        },
        ignore_me: { type: 'string' },
      },
    };
    const desc = collectFolderCardAssetDescriptors(schema as any);
    expect(desc).toHaveLength(1);
    expect(desc[0].fieldName).toBe('host_portrait');
    expect(desc[0].source.need).toBe('appearance_primary');
  });

  it('empty schema yields no descriptors (legacy form unchanged)', () => {
    expect(collectFolderCardAssetDescriptors(undefined)).toEqual([]);
    expect(collectFolderCardAssetDescriptors({ type: 'object', properties: {} } as any)).toEqual([]);
  });

  it('ignores non folder_card sources', () => {
    const desc = collectFolderCardAssetDescriptors({
      type: 'object',
      properties: {
        kb: { 'x-context-source': { kind: 'kbRecall' } },
      },
    } as any);
    expect(desc).toEqual([]);
  });
});
