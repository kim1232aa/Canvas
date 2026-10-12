import { describe, expect, it, vi } from 'vitest';
import { TensorArtDriver } from './TensorArtDriver';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));
import { tracedFetch } from '../../services/executionTrace';

describe('TensorArt model driver forwarding', () => {
  it('forwards custom JSON without selecting a tool endpoint', async () => {
    vi.mocked(tracedFetch).mockResolvedValue({ ok: true, json: async () => ({ imageUrl: '/api/media/a', historyItem: { id: 'a' } }) } as Response);
    await new TensorArtDriver().generate({ model: '123', prompt: 'a', width: 512, height: 512, extraParams: { custom_parameters: { diffusion: { cfgScale: 0 } } } } as any, {});
    const [url, options] = vi.mocked(tracedFetch).mock.calls.at(-1)!;
    expect(url).toBe('/api/tensorart/generate');
    expect(JSON.parse(options!.body as string).custom_parameters).toEqual({ diffusion: { cfgScale: 0 } });
  });
});
