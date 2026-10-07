import { afterEach, describe, expect, it, vi } from 'vitest';
import { CivitaiDriver } from './CivitaiDriver';

describe('CivitaiDriver history provenance', () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
  });

  it('persists effective upstream parameters after an async Civitai workflow completes', async () => {
    const historyBodies: any[] = [];
    globalThis.setTimeout = ((callback: (...args: any[]) => void) => {
      callback();
      return 0 as any;
    }) as typeof setTimeout;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/engine/civitai/generate') {
        return new Response(JSON.stringify({
          pending: true,
          workflowId: 'wf-1',
          pendingHistory: {
            prompt: 'reference portrait',
            provider: 'Civitai 官方原生生成引擎',
            model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
            seed: null,
            steps: null,
            cfg: null,
            sampler: null,
            scheduler: null,
            width: null,
            height: null,
            loras: [{ name: 'urn:air:sd1:lora:civitai:82098@87153', strength: 0.7 }],
          },
          requestMetadata: {
            route: '/api/engine/civitai/generate',
            requestedParameters: { prompt: 'reference portrait' },
            actualParameters: { engine: 'sdcpp', prompt: 'reference portrait' },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === '/api/civitai/workflow/wf-1') {
        return new Response(JSON.stringify({
          status: 'succeeded',
          mediaUrl: 'data:image/jpeg;base64,ZmFrZQ==',
          raw: {
            status: 'succeeded',
            steps: [{
              input: {
                width: 512,
                height: 512,
                steps: 20,
                cfgScale: 7,
                sampleMethod: 'euler',
                schedule: 'discrete',
                model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
              },
            }],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url === '/api/history') {
        const body = JSON.parse(String(init?.body || '{}'));
        historyBodies.push(body);
        return new Response(JSON.stringify({ id: 'hist-1', ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const driver = new CivitaiDriver();
    const result = await (driver as any).executeGenerate({
      model: 'urn:air:sd1:checkpoint:civitai:4384@128713',
      prompt: 'reference portrait',
      loras: [{ name: 'urn:air:sd1:lora:civitai:82098@87153', strength: 0.7 }],
      workflowSnapshot: { nodes: [], connections: [] },
    }, { civitaiKey: 'fixture-key' });

    expect(result.mediaUrl).toBe('data:image/jpeg;base64,ZmFrZQ==');
    expect(historyBodies).toHaveLength(1);
    expect(historyBodies[0]).toMatchObject({
      steps: 20,
      cfg: 7,
      sampler: 'euler',
      scheduler: 'discrete',
      width: 512,
      height: 512,
      requestMetadata: {
        requestedParameters: { prompt: 'reference portrait' },
        actualParameters: { engine: 'sdcpp', prompt: 'reference portrait' },
        effectiveParameters: {
          width: 512,
          height: 512,
          steps: 20,
          cfgScale: 7,
          sampleMethod: 'euler',
          schedule: 'discrete',
        },
      },
    });
  });
});