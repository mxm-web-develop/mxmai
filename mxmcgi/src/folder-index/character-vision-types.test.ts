import { describe, expect, it } from 'vitest';
import {
  applyUserCharacterFieldPatch,
  mergeCharacterPackSummary,
  normalizeCharacterPackSummary,
} from './character-vision-types';

describe('character-vision-types', () => {
  it('normalizes pack with multi-panel media and appearance refs', () => {
    const pack = normalizeCharacterPackSummary(
      {
        display_name: { value: 'Aria', provenance: 'extracted' },
        species_or_race: { value: 'human', provenance: 'inferred' },
        character_brief: 'Aria is a reserved strategist.',
        appearance_prompt: 'Young woman, silver bob, charcoal coat.',
        media_assets: [
          {
            ref_key: 'storage_object:sheet',
            media_kind: 'multi_view_sheet',
            is_multi_panel: true,
            panel_hints: ['front', 'side', 'back'],
            suitability: { identity_lock: 0.95, costume_ref: 0.8, expression_ref: 0.4 },
          },
          {
            ref_key: 'storage_object:scene',
            media_kind: 'scene_with_character',
            is_multi_panel: false,
            suitability: { identity_lock: 0.2, costume_ref: 0.1, expression_ref: 0.1 },
          },
        ],
        appearance_ref_ids: ['storage_object:sheet', 'storage_object:scene'],
      },
      {
        folderName: 'Aria',
        assetCount: 2,
        urlByRefKey: new Map([
          ['storage_object:sheet', 'https://ex/sheet.png'],
          ['storage_object:scene', 'https://ex/scene.png'],
        ]),
      }
    );
    expect(pack.display_name.value).toBe('Aria');
    expect(pack.media_assets[0]?.is_multi_panel).toBe(true);
    expect(pack.appearance_ref_ids[0]).toBe('storage_object:sheet');
    expect(pack.appearance_image_urls?.[0]).toBe('https://ex/sheet.png');
  });

  it('does not force multi-panel from sheet media_kind alone', () => {
    const pack = normalizeCharacterPackSummary(
      {
        display_name: { value: 'Solo', provenance: 'extracted' },
        character_brief: 'brief',
        appearance_prompt: 'prompt',
        media_assets: [
          {
            ref_key: 'storage_object:portrait',
            media_kind: 'outfit_sheet',
            is_multi_panel: false,
            panel_hints: ['正面', '侧面', '背面'],
            suitability: { identity_lock: 0.8, costume_ref: 0.9, expression_ref: 0.4 },
          },
          {
            ref_key: 'storage_object:fake-sheet',
            media_kind: 'multi_view_sheet',
            // omitted is_multi_panel → must stay false, demote kind
            panel_hints: ['front', 'side'],
            suitability: { identity_lock: 0.7, costume_ref: 0.5, expression_ref: 0.3 },
          },
        ],
      },
      { folderName: 'Solo', assetCount: 2 }
    );
    expect(pack.media_assets[0]?.media_kind).toBe('single_portrait');
    expect(pack.media_assets[0]?.is_multi_panel).toBe(false);
    expect(pack.media_assets[0]?.panel_hints).toBeUndefined();
    expect(pack.media_assets[1]?.media_kind).toBe('single_portrait');
    expect(pack.media_assets[1]?.is_multi_panel).toBe(false);
    expect(pack.media_assets[1]?.panel_hints).toBeUndefined();
  });

  it('keeps multi-panel only when explicitly true with sheet kind', () => {
    const pack = normalizeCharacterPackSummary(
      {
        display_name: { value: 'Sheet', provenance: 'extracted' },
        character_brief: 'brief',
        appearance_prompt: 'prompt',
        media_assets: [
          {
            ref_key: 'storage_object:real-sheet',
            media_kind: 'multi_view_sheet',
            is_multi_panel: true,
            panel_hints: ['front', 'side', 'back'],
          },
          {
            ref_key: 'storage_object:contradiction',
            media_kind: 'single_portrait',
            is_multi_panel: true,
            panel_hints: ['front', 'side'],
          },
        ],
      },
      { folderName: 'Sheet', assetCount: 2 }
    );
    expect(pack.media_assets[0]?.is_multi_panel).toBe(true);
    expect(pack.media_assets[0]?.panel_hints).toEqual(['front', 'side', 'back']);
    expect(pack.media_assets[1]?.is_multi_panel).toBe(false);
    expect(pack.media_assets[1]?.panel_hints).toBeUndefined();
  });

  it('user provenance wins over extracted on merge', () => {
    const prev = normalizeCharacterPackSummary(
      {
        display_name: { value: 'UserName', provenance: 'user' },
        personality: { value: 'user-locked calm', provenance: 'user' },
        character_brief: 'old',
        appearance_prompt: 'old',
        media_assets: [],
      },
      { folderName: 'Folder', assetCount: 0 }
    );
    const next = normalizeCharacterPackSummary(
      {
        display_name: { value: 'ModelName', provenance: 'extracted' },
        personality: { value: 'inferred bold', provenance: 'inferred' },
        character_brief: 'new brief',
        appearance_prompt: 'new look',
        media_assets: [],
      },
      { folderName: 'Folder', assetCount: 1, previous: prev }
    );
    expect(next.display_name.value).toBe('UserName');
    expect(next.personality?.value).toBe('user-locked calm');
    expect(next.character_brief).toBe('new brief');
  });

  it('applyUserCharacterFieldPatch marks user', () => {
    const base = normalizeCharacterPackSummary(
      {
        display_name: { value: 'A', provenance: 'inferred' },
        character_brief: 'b',
        appearance_prompt: 'c',
        media_assets: [],
      },
      { folderName: 'A', assetCount: 0 }
    );
    const patched = applyUserCharacterFieldPatch(base, {
      hair: 'crimson twin-tails',
      likes: ['tea', 'rain'],
    });
    expect(patched.hair).toEqual({ value: 'crimson twin-tails', provenance: 'user' });
    expect(patched.likes?.provenance).toBe('user');
  });

  it('mergeCharacterPackSummary keeps user voice_id if next omits', () => {
    const prev = normalizeCharacterPackSummary(
      {
        display_name: { value: 'A', provenance: 'extracted' },
        character_brief: 'b',
        appearance_prompt: 'c',
        media_assets: [],
        voice_id: 'voice_abc',
      },
      { folderName: 'A', assetCount: 0 }
    );
    const next = normalizeCharacterPackSummary(
      {
        display_name: { value: 'A', provenance: 'extracted' },
        character_brief: 'b2',
        appearance_prompt: 'c2',
        media_assets: [],
      },
      { folderName: 'A', assetCount: 1 }
    );
    const merged = mergeCharacterPackSummary(prev, next);
    expect(merged.voice_id).toBe('voice_abc');
  });
});
