import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunwareDriver } from './RunwareDriver';
import { ModelsLabDriver } from './ModelsLabDriver';
vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn() }));
import { tracedFetch } from '../../services/executionTrace';
afterEach(() => vi.resetAllMocks());

describe('public driver custom JSON forwarding', () => {
  for (const [Driver, custom] of [
    [RunwareDriver, { model: 'json-model', numberResults: 2 }],
    [ModelsLabDriver, { model_id: 'json-model', samples: 2 }],
  ] as const) {
    it(`${Driver.name} sends the explicit object from public generate`, async () => {
      vi.mocked(tracedFetch).mockResolvedValue(new Response(JSON.stringify({ imageUrl: '/api/media/fixture' })));
      await new Driver().generate({ model: 'canvas-model', prompt: 'fixture', extraParams: { custom_parameters: custom } } as any, {});
      const [, options] = vi.mocked(tracedFetch).mock.calls[0];
      expect(JSON.parse(options!.body as string).custom_parameters).toEqual(custom);
    });
  }
});
