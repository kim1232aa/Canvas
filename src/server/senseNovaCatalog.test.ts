import { describe, expect, it, vi } from 'vitest';
import { fetchSenseNovaModelCatalog } from './senseNovaCatalog';

describe('SenseNova authenticated model catalog', () => {
  it('calls the configured official models endpoint with Bearer auth and maps live capabilities', async () => {
    const upstreamFetch = vi.fn(async () => new Response(JSON.stringify({ data: [
      { id: 'sensenova-u1.5-lite', name: 'SenseNova U1.5 Lite', input_modalities: ['text'], output_modalities: ['image'] },
      { id: 'deepseek-v4-flash', input_modalities: ['text'], output_modalities: ['text'] },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await fetchSenseNovaModelCatalog({ upstreamFetch }, 'https://token.sensenova.cn/v1/', 'fixture-key');

    expect(upstreamFetch).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'sensenova', route: '/api/models', key: 'fixture-key' }),
      'https://token.sensenova.cn/v1/models',
      { headers: { Authorization: 'Bearer fixture-key', Accept: 'application/json' } },
    );
    expect(result).toMatchObject({ ok: true, endpoint: 'https://token.sensenova.cn/v1/models' });
    if (result.ok) {
      expect(result.items).toEqual([
        expect.objectContaining({ id: 'sensenova-u1.5-lite', name: 'SenseNova U1.5 Lite', category: 'checkpoint', tags: ['input:text', 'output:image'] }),
        expect.objectContaining({ id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', category: 'reasoning', tags: ['input:text', 'output:text'] }),
      ]);
    }
  });

  it('preserves the actual upstream HTTP status, body and endpoint', async () => {
    const upstreamFetch = vi.fn(async () => new Response('token expired', { status: 401 }));
    const result = await fetchSenseNovaModelCatalog({ upstreamFetch }, 'https://token.sensenova.cn/v1', 'fixture-key');

    expect(result).toEqual({
      ok: false,
      endpoint: 'https://token.sensenova.cn/v1/models',
      error: 'SenseNova 模型列表上游 HTTP 401',
      status: 401,
      details: 'token expired',
      errorSource: 'upstream',
    });
  });

  it('fails closed when a successful response does not contain a data array', async () => {
    const upstreamFetch = vi.fn(async () => Response.json({ models: [] }));
    const result = await fetchSenseNovaModelCatalog({ upstreamFetch }, 'https://token.sensenova.cn/v1', 'fixture-key');

    expect(result).toMatchObject({
      ok: false,
      error: 'SenseNova 模型列表响应缺少 data 数组',
      status: 200,
      endpoint: 'https://token.sensenova.cn/v1/models',
      errorSource: 'upstream-protocol',
      details: { models: [] },
    });
  });

  it('does not guess reasoning when output modalities are missing or unknown', async () => {
    const upstreamFetch = vi.fn(async () => Response.json({ data: [
      { id: 'missing-output-modalities' },
      { id: 'unknown-output-modalities', output_modalities: ['audio'] },
      { id: 'explicit-text-output', output_modalities: ['text'] },
    ] }));
    const result = await fetchSenseNovaModelCatalog({ upstreamFetch }, 'https://token.sensenova.cn/v1', 'fixture-key');

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.items.map(({ id, category, type }) => ({ id, category, type }))).toEqual([
        { id: 'missing-output-modalities', category: 'unknown', type: 'unknown' },
        { id: 'unknown-output-modalities', category: 'unknown', type: 'unknown' },
        { id: 'explicit-text-output', category: 'reasoning', type: 'reasoning' },
      ]);
    }
  });

  it('preserves invalid JSON response text and actual HTTP status', async () => {
    const upstreamFetch = vi.fn(async () => new Response('<html>upstream failure page</html>', {
      status: 206,
      headers: { 'content-type': 'text/html' },
    }));
    const result = await fetchSenseNovaModelCatalog({ upstreamFetch }, 'https://token.sensenova.cn/v1', 'fixture-key');

    expect(result).toMatchObject({
      ok: false,
      endpoint: 'https://token.sensenova.cn/v1/models',
      status: 206,
      details: '<html>upstream failure page</html>',
      errorSource: 'upstream-protocol',
    });
  });
});
