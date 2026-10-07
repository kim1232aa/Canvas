import { describe, expect, it } from 'vitest';
import { displayResolvedParameter, historySourceLabel, resolveHistoryParameters } from './historyParameters';
import type { GenerationHistoryItem } from '../types/providers';

const base = (overrides: Partial<GenerationHistoryItem> = {}): GenerationHistoryItem => ({
  id: 'hist',
  url: 'data:image/png;base64,abc',
  prompt: 'prompt',
  provider: 'Civitai',
  model: 'model',
  seed: null,
  steps: null,
  cfg: null,
  timestamp: 1,
  ...overrides,
});

describe('history parameter provenance', () => {
  it('prefers upstream effective values over sent/requested/legacy values', () => {
    const resolved = resolveHistoryParameters(base({
      steps: 8,
      cfg: 2,
      requestMetadata: {
        requestedParameters: { steps: 10, cfg: 3 },
        actualParameters: { steps: 12, cfgScale: 4, sampleMethod: 'dpmpp_2m' },
        effectiveParameters: { steps: 20, cfgScale: 7, sampleMethod: 'euler', schedule: 'discrete', width: 512, height: 512 },
      },
    }));
    expect(resolved.steps).toMatchObject({ value: 20, source: 'upstream' });
    expect(resolved.cfg).toMatchObject({ value: 7, source: 'upstream' });
    expect(resolved.sampler).toMatchObject({ value: 'euler', source: 'upstream' });
    expect(resolved.scheduler).toMatchObject({ value: 'discrete', source: 'upstream' });
    expect(displayResolvedParameter(resolved.width)).toBe('512');
    expect(historySourceLabel(resolved.steps.source)).toBe('上游实际');
  });

  it('marks requested-but-not-sent fields instead of calling them blank', () => {
    const resolved = resolveHistoryParameters(base({
      requestMetadata: {
        requestedParameters: { negative_prompt: 'blurry', steps: 18 },
        actualParameters: { prompt: 'prompt' },
      },
    }));
    expect(resolved.negativePrompt).toMatchObject({ value: 'blurry', source: 'requested-not-sent', emptyLabel: '未发送' });
    expect(resolved.steps).toMatchObject({ value: 18, source: 'requested-not-sent' });
  });

  it('labels missing provenance in old records separately from a known unsent field', () => {
    const old = resolveHistoryParameters(base());
    expect(displayResolvedParameter(old.sampler)).toBe('旧记录未保存');

    const current = resolveHistoryParameters(base({ requestMetadata: { requestedParameters: {}, actualParameters: {} } }));
    expect(displayResolvedParameter(current.sampler)).toBe('未发送');
  });

  it('can recover Civitai effective parameters from a structured execution trace body', () => {
    const resolved = resolveHistoryParameters(base({
      requestMetadata: {
        executionTrace: [{
          responseBody: JSON.stringify({
            steps: [{ input: { steps: 20, cfgScale: 7, sampleMethod: 'euler', schedule: 'discrete', width: 512, height: 512 } }],
          }),
        }],
      },
    }));
    expect(resolved.steps.value).toBe(20);
    expect(resolved.cfg.value).toBe(7);
    expect(resolved.sampler.value).toBe('euler');
  });
});
