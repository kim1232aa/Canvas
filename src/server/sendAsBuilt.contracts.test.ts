import { describe, expect, it } from 'vitest';
import { buildAgnesVideoRequest } from './agnesVideoRequest';
import { buildMageImageRequest } from './mageImageContract';
import { buildOpenWorksRequest, openWorksInputSchema } from './openWorksProvider';

// 雁 2026-11-04: every filled parameter goes out as filled; upstream decides.
describe('send as built — filled params appear in the outbound body', () => {
  it('Agnes video sends unknown/out-of-list fields untouched', () => {
    const { payload } = buildAgnesVideoRequest('agnes-video-2.5', { prompt: 'p', seconds: 7.5, n: 3, width: 640, fps: 30, aspect_ratio: '5:2' });
    expect(payload).toMatchObject({ seconds: 7.5, n: 3, width: 640, fps: 30, aspect_ratio: '5:2' });
  });
  it('Mage sends a large or string seed as filled', () => {
    expect(buildMageImageRequest({ prompt: 'p', model: 'm', seed: 2 ** 60 } as any).payload.seed).toBe(2 ** 60);
    expect(buildMageImageRequest({ prompt: 'p', model: 'm', seed: '42' } as any).payload.seed).toBe('42');
  });
  it('OpenWorks sends fields the catalog Schema does not list as named extras', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', name: 'prompt' }] });
    const built: any = buildOpenWorksRequest('m', schema, { prompt: 'p', width: 768, custom_parameters: { foo: 'bar' } });
    expect(built.ok).toBe(true);
    const inputs = JSON.stringify(built.parameters);
    expect(inputs).toContain('"name":"width"');
    expect(inputs).toContain('"value":768');
    expect(inputs).toContain('"name":"foo"');
  });
  it('OpenWorks sends a LoRA with no strength (path only), never refuses', () => {
    const schema = openWorksInputSchema({ inputs: [{ type: 'STRING', name: 'prompt' }] });
    const built: any = buildOpenWorksRequest('m', schema, { prompt: 'p', loras: [{ name: 'lora-1' }] });
    expect(built.ok).toBe(true);
    expect(JSON.stringify(built.parameters)).toContain('lora-1');
  });
});
