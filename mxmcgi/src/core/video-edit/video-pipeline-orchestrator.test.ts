import { describe, expect, it } from 'vitest';
import {
  extractOrchestratorScriptText,
  isVideoPipelineOrchestrator,
} from './video-pipeline-orchestrator';

describe('video-pipeline-orchestrator', () => {
  it('detects orchestrator by subtype or extra flag', () => {
    expect(isVideoPipelineOrchestrator({ videoSubtype: 'voiceover-science-pop' })).toBe(true);
    expect(isVideoPipelineOrchestrator({ templateExtra: { pipelineOrchestrator: true } })).toBe(true);
    expect(isVideoPipelineOrchestrator({ videoSubtype: 'default' })).toBe(false);
  });

  it('extracts script text from pipeline state', () => {
    const json = '{"version":"1.0.0"}';
    expect(
      extractOrchestratorScriptText({
        businessPipelineState: { finalArtifact: { text: json } },
      })
    ).toBe(json);
  });

  it('throws when script missing', () => {
    expect(() => extractOrchestratorScriptText({})).toThrow(/未产出/);
  });
});
