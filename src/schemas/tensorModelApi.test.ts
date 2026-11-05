import { describe, expect, it, vi } from 'vitest';
import {
  pickTamsBearerKey,
  parseTensorArtKeys,
  isOpenWorksAccessKey,
  TAMS_BEARER_REQUIRED_HINT,
} from '../schemas/tensorArtCredentials';
import { buildTensorModelJob } from '../schemas/tensorModelApi';

describe('Tensor.Art TAMS Credential & Job API Verification', () => {
  it('parses TENSORART_TAMS_TOKEN and prefers it over OpenWorks ak_tensor_ keys', () => {
    const tamsToken = '38b4e85f-f6e2-4f3b-b2f5-8d9e7a6c5b4a';
    const openWorksKey = 'ak_tensor_sec_abc123456789';

    expect(isOpenWorksAccessKey(openWorksKey)).toBe(true);
    expect(isOpenWorksAccessKey(tamsToken)).toBe(false);

    // When both are present in pool/env, pickTamsBearerKey must return the TAMS Bearer token
    const selected = pickTamsBearerKey(openWorksKey, tamsToken);
    expect(selected).toBe(tamsToken);

    // If only OpenWorks key is present, pickTamsBearerKey returns null
    const none = pickTamsBearerKey(openWorksKey);
    expect(none).toBeNull();
  });

  it('builds full TAMS job specification with SD checkpoint, LoRA and full diffusion parameters', () => {
    const job = buildTensorModelJob(
      {
        model: '613045163490732233', // SD 1.5 Anime Checkpoint
        prompt: '1girl, cute, masterpiece, 8k',
        negative_prompt: 'low quality, blurry',
        width: 512,
        height: 768,
        steps: 25,
        cfg: 7,
        seed: 123456,
        sampler_name: 'Euler a',
        scheduler: 'normal',
        denoise: 0.75,
        loras: [
          { name: '661652545330040294', strength: 0.8 },
        ],
      },
      'req-tams-test-123'
    );

    expect(job.requestId).toBe('req-tams-test-123');
    expect(job.stages).toHaveLength(2);

    const initStage = job.stages[0];
    expect(initStage.type).toBe('INPUT_INITIALIZE');
    expect(initStage.inputInitialize?.seed).toBe('123456');

    const diffStage = job.stages[1];
    expect(diffStage.type).toBe('DIFFUSION');
    const diff = diffStage.diffusion;
    expect(diff?.sdModel).toBe('613045163490732233');
    expect(diff?.width).toBe(512);
    expect(diff?.height).toBe(768);
    expect(diff?.steps).toBe(25);
    expect(diff?.cfgScale).toBe(7);
    expect(diff?.sampler).toBe('Euler a');
    expect(diff?.scheduleName).toBe('normal');
    expect(diff?.denoisingStrength).toBe(0.75);
    expect(diff?.prompts).toEqual([{ text: '1girl, cute, masterpiece, 8k' }]);
    expect(diff?.negativePrompts).toEqual([{ text: 'low quality, blurry' }]);
    expect(diff?.lora?.items).toEqual([
      { loraModel: '661652545330040294', weight: 0.8 },
    ]);
  });

  it('rejects non-numeric model ID with informative error for TAMS', () => {
    expect(() =>
      buildTensorModelJob(
        {
          model: 'not-a-number',
          prompt: 'test',
          width: 512,
          height: 512,
        },
        'req-id'
      )
    ).toThrow('Tensor.Art 模型为必填项');
  });

  it('provides official TAMS Bearer required hint', () => {
    expect(TAMS_BEARER_REQUIRED_HINT).toContain('https://tams.tensor.art/app');
    expect(TAMS_BEARER_REQUIRED_HINT).toContain('TAMS Bearer Token');
  });
});
