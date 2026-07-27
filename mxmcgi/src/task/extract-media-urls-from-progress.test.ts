import { describe, expect, it } from 'vitest';
import { extractMediaUrlsFromProgressOutput } from './task-executor';

describe('extractMediaUrlsFromProgressOutput', () => {
  it('reads Atlas Seedance outputs string array', () => {
    expect(
      extractMediaUrlsFromProgressOutput({
        status: 'succeeded',
        outputs: ['https://cdn.example/seedance.mp4'],
      })
    ).toEqual(['https://cdn.example/seedance.mp4']);
  });

  it('reads outputs object url field', () => {
    expect(
      extractMediaUrlsFromProgressOutput({
        outputs: [{ url: 'https://cdn.example/v.mp4' }],
      })
    ).toEqual(['https://cdn.example/v.mp4']);
  });

  it('reads mediaUrls when present', () => {
    expect(
      extractMediaUrlsFromProgressOutput({
        mediaUrls: ['https://cdn.example/a.mp4'],
      })
    ).toEqual(['https://cdn.example/a.mp4']);
  });
});
