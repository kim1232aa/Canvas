import { describe, expect, it, vi } from 'vitest';
import { TensorArtDriver } from './TensorArtDriver';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));
import { tracedFetch } from '../../services/executionTrace';

describe('TensorArt model driver', () => {
  it('rejects with TAMS offline error without calling network, preserving provider failure', async () => {
    const driver = new TensorArtDriver();
    expect(driver.id).toBe('tensorart');

    await expect(
      driver.generate(
        {
          model: '123',
          prompt: 'a',
          width: 512,
          height: 512,
          extraParams: { custom_parameters: { diffusion: { cfgScale: 0 } } },
        } as any,
        {}
      )
    ).rejects.toThrow('Tensor.Art TAMS 出图入口已下线');

    expect(tracedFetch).not.toHaveBeenCalled();
  });

  it('validates model is required before throwing offline error', async () => {
    const driver = new TensorArtDriver();
    await expect(
      driver.generate({ prompt: 'test' } as any, {})
    ).rejects.toThrow('模型为必填项');
  });
});

