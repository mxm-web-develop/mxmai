import { describe, expect, it } from 'vitest';
import {
  slimTtsTaskResultMetadata,
  stripTtsProviderRawMetadata,
} from './tts-result-metadata';

describe('tts-result-metadata', () => {
  it('removes raw from metadata', () => {
    const meta = { subtitle_file: 'https://x', raw: { data: { audio: 'a'.repeat(1000) } } };
    const out = stripTtsProviderRawMetadata(meta);
    expect(out).toEqual({ subtitle_file: 'https://x' });
  });

  it('slims audio task when media persisted', () => {
    const meta = { raw: { huge: true }, subtitle_file: 'u' };
    const out = slimTtsTaskResultMetadata('audio', meta, true);
    expect(out).toEqual({ subtitle_file: 'u' });
  });

  it('leaves non-audio metadata unchanged', () => {
    const meta = { raw: { x: 1 } };
    expect(slimTtsTaskResultMetadata('graph', meta, true)).toEqual(meta);
  });
});
