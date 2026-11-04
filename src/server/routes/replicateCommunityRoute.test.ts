import { describe, expect, it, vi } from 'vitest';
import { handleReplicateGenerate } from './replicateRoutes';

// Replicate docs (https://replicate.com/docs/reference/http#models.predictions.create): the model-name route is for
// official models only; other models must POST /v1/predictions with a version. Route is chosen from the live model GET.
const VER = 'c48fa8ec65b13143cb552ab98ea17984eab9d70e9fe99479117de40a2a7f9ed0';
const inputSchema = { components: { schemas: { Input: { properties: { prompt: {}, image: {}, seed: {} } } } } };

function run(modelObj: any, body: Record<string, any>, postStatus = 200, postBody: any = { id: 'p1', status: 'succeeded', output: 'https://replicate.delivery/o.mp4' }) {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  const upstreamFetch = vi.fn(async (_m: any, url: string, opt: any) => {
    calls.push({ url, method: opt?.method, body: opt?.body ? JSON.parse(opt.body) : undefined });
    const data = opt?.method === 'GET' ? modelObj : postBody;
    const status = opt?.method === 'GET' ? 200 : postStatus;
    return { ok: status < 300, status, text: async () => JSON.stringify(data), json: async () => data };
  });
  const res: any = { statusCode: 200, data: null, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.data = b; return this; }, setHeader() {} };
  const deps: any = {
    resolveProviderAuth: () => ({ apiKey: 'r8_x', baseUrl: 'https://api.replicate.com/v1' }),
    upstreamFetch, keyPoolManager: { recordResult: vi.fn() },
    respondWithGeneratedImages: vi.fn(async (r: any, imgs: any[]) => r.json({ mediaUrl: imgs[0] })),
    sleep: vi.fn(async () => {}),
  };
  return handleReplicateGenerate(deps)({ body, path: '/api/engine/replicate/generate', headers: {} } as any, res).then(() => ({ calls, res }));
}

describe('Replicate route chosen up front from live model data', () => {
  it('community model (is_official=false) → POST /v1/predictions with latest_version.id, no model-name route', async () => {
    const { calls } = await run({ is_official: false, latest_version: { id: VER, openapi_schema: inputSchema.components ? inputSchema : {} } },
      { model: 'wan-video/wan2.1-with-lora', prompt: 'p', seed: 1, isVideo: true });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://api.replicate.com/v1/predictions');
    expect(posts[0].body.version).toBe(VER);
    expect(posts[0].body.input.seed).toBe(1);
  });
  it('official model (is_official=true) → POST /v1/models/{owner}/{name}/predictions without version', async () => {
    const { calls } = await run({ is_official: true, latest_version: { id: VER, openapi_schema: inputSchema } }, { model: 'black-forest-labs/flux-schnell', prompt: 'p' });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts.map((p) => p.url)).toEqual(['https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions']);
    expect(posts[0].body.version).toBeUndefined();
  });
  it('404 on the chosen route is shown verbatim, not retried on the other route; video wording says 视频', async () => {
    const { calls, res } = await run({ is_official: true, latest_version: { id: VER, openapi_schema: inputSchema } },
      { model: 'a/b', prompt: 'p', isVideo: true }, 404, { detail: 'The requested resource could not be found.' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(res.statusCode).toBe(404);
    expect(res.data.error).toBe('Replicate 视频接口上游 HTTP 404: {"detail":"The requested resource could not be found."}');
  });
  it('community model with client-supplied schema still reads the model GET to pick the route', async () => {
    const { calls } = await run({ is_official: false, latest_version: { id: VER, openapi_schema: inputSchema } },
      { model: 'x/y', prompt: 'p', inputSchemaProperties: { prompt: {} } });
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'https://api.replicate.com/v1/models/x/y' });
    expect(calls.find((c) => c.method === 'POST')!.url).toBe('https://api.replicate.com/v1/predictions');
  });
});
