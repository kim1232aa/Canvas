// 雁 2026-11-04: every filled canvas param reaches the outgoing body (no local pre-block). Network is a fixture; no real generation.
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CanvasStore} from '../../hosting/store';
import {requestContext} from '../../hosting/context';

const sdk = vi.hoisted(() => ({generate: vi.fn()}));
vi.mock('@google/genai', () => ({GoogleGenAI: class {models = {generateContent: sdk.generate};}}));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');

function store() {
  const objects = new Map<string, Buffer>();
  const bucket: any = {put: async (k: string, v: any) => { objects.set(k, Buffer.from(v)); }, get: async (k: string) => { const b = objects.get(k); return b ? {json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b} : null; }, delete: async () => {}};
  const db: any = {prepare: () => ({bind: () => ({first: async () => null, all: async () => ({results: []}), run: async () => {}})})};
  return new CanvasStore(db, bucket, '');
}
async function dispatch(pathname: string, body: any, settings: Record<string, string>) {
  const app = (await import('../../hosting/server.generated.ts' as string)).app;
  const req: any = {method: 'POST', path: pathname, originalUrl: pathname, body, headers: {}, params: {}, query: {}};
  return new Promise<any>((resolve, reject) => {
    let status = 200;
    const res: any = {statusCode: 200, status(c: number) { status = c; this.statusCode = c; return this; }, json(v: any) { resolve({status, payload: v}); return this; }, setHeader: () => {}, getHeader: () => {}, headersSent: false};
    requestContext.run({origin: 'https://fixture.test', authenticatedUserId: 'o', ownerUserId: 'o', settings, store: store(), pending: []} as any, async () => {
      try {
        const {refreshHostedKeyPool} = await import('../../hosting/server.generated' as string); refreshHostedKeyPool();
        const route = app._router.stack.find((l: any) => l.route && (Array.isArray(l.route.path) ? l.route.path.includes(pathname) : l.route.path === pathname));
        await route.route.stack[0].handle(req, res, (e?: any) => e && reject(e));
      } catch (e) { reject(e); }
    });
  });
}
const FILLED = {seed: 7, negative_prompt: 'blurry', steps: 9, cfg: 3.5, sampler_name: 'euler', scheduler: 'karras', denoise: 0.6, width: 640, height: 960, loras: [{name: 'x', strength: 0.8}]};
let sent: any[] = [];
beforeEach(() => {
  sent = []; sdk.generate.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => { sent.push({url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined}); return new Response(JSON.stringify({error: 'fixture upstream says no'}), {status: 422, headers: {'content-type': 'application/json'}}); }));
});

describe('filled params are forwarded, upstream decides', () => {
  it('OpenAI-compat: every filled field lands in the outgoing JSON; upstream raw error returned', async () => {
    const {status, payload} = await dispatch('/api/openai_compat/generate', {model: 'm', prompt: 'p', size: 'weird-size', quality: 'ultra', ...FILLED}, {openaiCompatKey: 'k', openaiCompatBaseUrl: 'https://compat.test/v1'});
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({model: 'm', prompt: 'p', size: 'weird-size', quality: 'ultra', ...FILLED});
    expect(status).toBe(422);
    expect(JSON.stringify(payload)).toContain('fixture upstream says no');
  });
  it('Grok-compat: every filled field lands in the outgoing JSON', async () => {
    await dispatch('/api/grok_compat/generate', {model: 'g', prompt: 'p', aspect_ratio: '7:3', resolution: '9k', ...FILLED}, {grokCompatKey: 'k', grokCompatBaseUrl: 'https://grok.test/v1'});
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({model: 'g', aspect_ratio: '7:3', resolution: '9k', ...FILLED});
  });
  it('HF hf-inference: every filled field lands in parameters at router.huggingface.co/hf-inference', async () => {
    await dispatch('/api/huggingface/generate', {model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'p', resolution: '1024x1024 ( 1:1 )', seed: 7, steps: 9, shift: 3, random_seed: false, gallery_images: [], negative_prompt: 'blurry', width: 640, height: 960, sampler_name: 'euler', scheduler: 'karras', cfg: 3.5, denoise: 0.6, loras: [{name: 'x', strength: 0.8}]}, { hfToken: 'hf_test' });
    const call = sent.find((s) => String(s.url).includes('router.huggingface.co/hf-inference/models/'));
    expect(call).toBeTruthy();
    expect(String(call.url)).toBe('https://router.huggingface.co/hf-inference/models/Tongyi-MAI/Z-Image-Turbo');
    expect(call.body).toMatchObject({
      inputs: 'p',
      parameters: {
        negative_prompt: 'blurry',
        width: 640,
        height: 960,
        num_inference_steps: 9,
        seed: 7,
        scheduler: 'karras',
        cfg: 3.5,
        denoise: 0.6,
        sampler_name: 'euler',
        resolution: '1024x1024 ( 1:1 )',
        shift: 3,
        random_seed: false,
        loras: [{name: 'x', strength: 0.8}],
      },
    });
    expect(call.body).not.toHaveProperty('inference_provider');
  });
  it('Gemini: fields with no @google/genai config slot go via httpOptions.extraBody.generationConfig (merged into REST body by the SDK)', async () => {
    sdk.generate.mockResolvedValue({candidates: [{content: {parts: [{inlineData: {mimeType: 'image/png', data: png}}]}}]});
    await dispatch('/api/gemini/generate', {model: 'gem', prompt: 'p', aspect_ratio: '1:1', image_url: 'https://example.test/ref.png', ...FILLED}, {geminiKey: 'k'});
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    const arg = sdk.generate.mock.calls[0][0];
    expect(arg.config.imageConfig).toEqual({aspectRatio: '1:1'});
    expect(arg.config.httpOptions.extraBody.generationConfig).toMatchObject(FILLED);
    expect(arg.contents.parts[0]).toEqual({fileData: {fileUri: 'https://example.test/ref.png'}});
  });
});
