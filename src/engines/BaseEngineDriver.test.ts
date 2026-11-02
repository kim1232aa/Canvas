import { describe, expect, it } from 'vitest';
import { BaseEngineDriver } from './BaseEngineDriver';
import type { NormalizedGenerateParams, NormalizedGenerateResult } from './types';

class ImageDriver extends BaseEngineDriver {
  readonly id = 'fal' as const;
  readonly name = 'test';
  readonly label = 'test';
  readonly badgeColor = 'test';
  readonly description = 'test';
  readonly capabilities = ['text2img'] as const;
  readonly supportedModels = [];
  public received?: NormalizedGenerateParams;
  protected async executeGenerate(params: NormalizedGenerateParams): Promise<NormalizedGenerateResult> {
    this.received = params;
    return { mediaUrl: 'https://example.test/image.png', mediaType: 'image' } as NormalizedGenerateResult;
  }
}

describe('BaseEngineDriver task selection', () => {
  it('honours an explicitly selected image task even if its model name contains video', async () => {
    const driver = new ImageDriver();
    await driver.generate({ model: 'example/video-enhancement', prompt: 'test', isVideo: false }, {});
    expect(driver.received).toMatchObject({ model: 'example/video-enhancement', isVideo: false });
  });

  it('does not infer video capability from a model identifier', async () => {
    const driver = new ImageDriver();
    await driver.generate({ model: 'example/wan/v2.1', prompt: 'test' }, {});
    expect(driver.received).toMatchObject({ isVideo: false });
  });

  it('does not invent a CLIP strength from a LoRA model strength', async () => {
    const driver = new ImageDriver();
    await driver.generate({ model: 'example/model', prompt: 'test', loras: [{ name: 'adapter', strength: 0.7 }] }, {});
    expect(driver.received?.loras?.[0]).toMatchObject({ strength: 0.7, modelStrength: 0.7, clipStrength: undefined });
  });
});
