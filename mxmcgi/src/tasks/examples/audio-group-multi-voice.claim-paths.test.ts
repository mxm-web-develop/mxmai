/**
 * 多人语音：expert nestedText 禁止整包合同时必须声明 claimPaths
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { isWholesaleContractMapping } from '../mxm-warp/claim-commit';

type PipelineStep = {
  step?: string;
  nestedTextTaskKey?: string;
  inputMapping?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

describe('audio-group-multi-voice claimPaths', () => {
  it('every wholesale expert nestedText declares non-empty claimPaths', () => {
    const raw = readFileSync(
      join(__dirname, 'audio-group-multi-voice.business.json'),
      'utf8'
    );
    const bundle = JSON.parse(raw) as {
      items: Array<{
        scope: string;
        type: string;
        subtype: string | null;
        extra?: { taskTemplate?: { pipeline?: Record<string, PipelineStep[]> } };
      }>;
    };
    const host = bundle.items.find(
      (it) => it.scope === 'audio' && it.type === 'group' && it.subtype === 'multi-voice'
    );
    expect(host).toBeTruthy();
    const pipeline = host!.extra?.taskTemplate?.pipeline ?? {};
    const steps = [...(pipeline.pre ?? []), ...(pipeline.enrich ?? []), ...(pipeline.post ?? [])];
    const experts = steps.filter(
      (s) =>
        s.step === 'nestedText' &&
        String(s.nestedTextTaskKey ?? '').startsWith('text/expert/') &&
        isWholesaleContractMapping(s.inputMapping?.contract)
    );
    expect(experts.length).toBeGreaterThanOrEqual(4);
    for (const s of experts) {
      const claim = s.params?.claimPaths;
      expect(Array.isArray(claim) && claim.length > 0, s.nestedTextTaskKey).toBe(true);
    }
  });
});
