import { describe, expect, it } from 'vitest';
import {
  isOpenWorksAccessKey,
  parseTensorArtKeys,
  pickTamsBearerKey,
} from './tensorArtCredentials';
import { buildTensorModelJob, TENSOR_MODEL_API } from './tensorModelApi';

describe('tensorArtCredentials', () => {
  it('parses comma / newline pools without inventing keys', () => {
    expect(parseTensorArtKeys('a,b;c\nd')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseTensorArtKeys([' ak_tensor_x ', '', 'tok'])).toEqual(['ak_tensor_x', 'tok']);
  });

  it('detects OpenWorks ak_ keys and prefers TAMS Bearer for model API', () => {
    expect(isOpenWorksAccessKey('ak_tensor_abc')).toBe(true);
    expect(isOpenWorksAccessKey('ak_other')).toBe(true);
    expect(isOpenWorksAccessKey('plain-bearer-token')).toBe(false);
    expect(pickTamsBearerKey('ak_tensor_a,ak_tensor_b')).toBeNull();
    expect(pickTamsBearerKey('ak_tensor_a,tams-bearer-xyz')).toBe('tams-bearer-xyz');
    expect(pickTamsBearerKey(undefined, 'ak_tensor_only', 'real-tams')).toBe('real-tams');
  });
});

describe('TAMS LoRA job mapping (official diffusion.lora.items)', () => {
  it('maps canvas loras to loraModel + weight and rejects tool names as LoRA ids', () => {
    const job = buildTensorModelJob(
      {
        model: '613045163490732233',
        prompt: '1girl',
        negative_prompt: 'EasyNegative',
        width: 512,
        height: 768,
        steps: 25,
        cfg: 7,
        sampler_name: 'Euler a',
        loras: [
          { name: '661652545330040294', strength: 1.1 },
          { tensorartId: 'https://tensor.art/models/660447313082219790', modelStrength: 0.8, loraAccessKey: 'priv' },
        ],
      },
      'req-lora'
    );
    expect(job.stages).toHaveLength(2);
    const diffusion = job.stages[1]?.diffusion;
    expect(diffusion).toBeDefined();
    if (!diffusion) throw new Error('TAMS job stage[1].diffusion missing');
    expect(diffusion.sdModel).toBe('613045163490732233');
    expect(diffusion.lora?.items).toEqual([
      { loraModel: '661652545330040294', weight: 1.1 },
      { loraModel: '660447313082219790', weight: 0.8, loraAccessKey: 'priv' },
    ]);
    expect(() =>
      buildTensorModelJob(
        {
          model: '613045163490732233',
          prompt: 'x',
          width: 512,
          height: 512,
          loras: [{ name: 'photoreal_studio_z_image', strength: 1 }],
        },
        'bad'
      )
    ).toThrow(/接口名|模型 ID/);
  });
});

describe('TAMS model API host (fix13)', () => {
  it('defaults to ap-east-1.tensorart.cloud (not tams-api alone)', () => {
    expect(TENSOR_MODEL_API).toBe('https://ap-east-1.tensorart.cloud');
    expect(TENSOR_MODEL_API).not.toContain('tams-api.tensor.art');
  });
});
