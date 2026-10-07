import { describe, expect, it } from 'vitest';
import type { GenerationHistoryItem } from '../types/providers';
import { extractEmbeddedGenerationParameters, resolveHistoryParameters } from './historyParameters';

const baseItem = (): GenerationHistoryItem => ({
  id: 'hist-1',
  url: '',
  prompt: 'robot',
  negativePrompt: null,
  provider: 'Civitai 官方原生生成引擎',
  model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
  seed: null,
  steps: null,
  cfg: null,
  timestamp: 1,
  loras: [],
});

function utf16DataUrl(text: string): string {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    bytes[i * 2] = text.charCodeAt(i);
    bytes[i * 2 + 1] = 0;
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

describe('history generation parameter provenance', () => {
  it('uses Civitai upstream effective defaults instead of calling them unfilled', () => {
    const item = baseItem();
    item.requestMetadata = {
      route: '/api/engine/civitai/generate',
      submissions: [{
        endpoint: 'https://orchestration.civitai.com/v2/consumer/workflows?wait=100',
        parameters: { steps: [{ $type: 'imageGen', input: { engine: 'sdcpp', prompt: 'robot', model: item.model } }] },
        status: 200,
      }],
      executionTrace: [{
        endpoint: 'https://orchestration.civitai.com/v2/consumer/workflows?wait=100',
        responseBody: JSON.stringify({
          status: 'succeeded',
          steps: [{ input: { width: 512, height: 512, sampleMethod: 'euler', schedule: 'discrete', steps: 20, cfgScale: 7 } }],
        }),
      }],
    } as any;

    const params = resolveHistoryParameters(item);
    expect(params.steps).toMatchObject({ value: 20, source: 'upstream' });
    expect(params.cfg).toMatchObject({ value: 7, source: 'upstream' });
    expect(params.sampler).toMatchObject({ value: 'euler', source: 'upstream' });
    expect(params.scheduler).toMatchObject({ value: 'discrete', source: 'upstream' });
    expect(params.width).toMatchObject({ value: 512, source: 'upstream' });
    expect(params.height).toMatchObject({ value: 512, source: 'upstream' });
    expect(params.negativePrompt.source).toBe('not-sent');
  });

  it('recovers seed and WebUI-style fields from embedded image generation metadata', () => {
    const url = utf16DataUrl('Prompt text\nSteps: 20, Sampler: Euler, CFG scale: 7, Seed: 1021568893, Size: 512x512');
    const params = extractEmbeddedGenerationParameters(url);
    expect(params).toMatchObject({
      seed: 1021568893,
      steps: 20,
      sampler: 'Euler',
      cfg: 7,
      width: 512,
      height: 512,
    });
  });

  it('distinguishes a requested value that was not sent from an upstream-confirmed value', () => {
    const item = baseItem();
    item.requestMetadata = {
      requestedParameters: { steps: 30, negative_prompt: 'bad hands' },
      submissions: [{ endpoint: 'https://example.test', parameters: { prompt: 'robot' }, status: 200 }],
    } as any;

    const params = resolveHistoryParameters(item);
    expect(params.steps).toMatchObject({ source: 'not-sent', requested: 30 });
    expect(params.negativePrompt).toMatchObject({ source: 'not-sent', requested: 'bad hands' });
  });

  it('labels metadata-less old records separately instead of pretending they were not sent', () => {
    const params = resolveHistoryParameters(baseItem());
    expect(params.seed.source).toBe('unknown');
    expect(params.steps.source).toBe('unknown');
  });
});