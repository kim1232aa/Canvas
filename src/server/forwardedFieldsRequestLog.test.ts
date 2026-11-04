// 雁 2026-11-04: the request log (temp/logs sink) records the body actually sent, and it carries every filled field.
// Malformed custom_parameters stops the request with the raw parse error; nothing is sent with fields silently dropped.
// Network is a fixture; no real generation.
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CanvasStore} from '../../hosting/store';
import {requestContext} from '../../hosting/context';

const logged = vi.hoisted(() => [] as any[]);
vi.mock('./requestLog', async (orig) => ({...(await orig() as any), writeRequestLog: (_dir: string, entries: any[]) => { logged.push(...entries); }}));
const sdk = vi.hoisted(() => ({generate: vi.fn()}));
vi.mock('@google/genai', () => ({GoogleGenAI: class {models = {generateContent: sdk.generate};}}));

function store() {
  const objects = new Map<string, Buffer>();
  const bucket: any = {put: async (k: string, v: any) => { objects.set(k, Buffer.from(v)); }, get: async (k: string) => { const b = objects.get(k); return b ? {json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b} : null; }, delete: async () => {}};
  const db: any = {prepare: () => ({bind: () => ({first: async () => null, all: async () => ({results: []}), run: async () => {}})})};
  return new CanvasStore(db, bucket, '');
}
/** Runs the real request-context middleware (which writes the request log) and then the route. */
async function dispatch(pathname: string, body: any, settings: Record<string, string>, viaMiddleware = true) {
  const mod: any = await import('../../hosting/server.generated.ts' as string);
  const app = mod.app;
  const req: any = {method: 'POST', path: pathname, originalUrl: pathname, url: pathname, body, headers: {}, params: {}, query: {}, get: () => undefined, header: () => undefined};
  return new Promise<any>((resolve, reject) => {
    let status = 200;
    const res: any = {statusCode: 200, status(c: number) { status = c; this.statusCode = c; return this; }, json(v: any) { resolve({status, payload: v}); return this; }, setHeader: () => {}, getHeader: () => {}, headersSent: false};
    requestContext.run({origin: 'https://fixture.test', authenticatedUserId: 'o', ownerUserId: 'o', settings, store: store(), pending: []} as any, async () => {
      try {
        mod.refreshHostedKeyPool();
        const route = app._router.stack.find((l: any) => l.route && (Array.isArray(l.route.path) ? l.route.path.includes(pathname) : l.route.path === pathname));
        const handler = () => Promise.resolve(route.route.stack[0].handle(req, res, (e?: any) => e && reject(e))).catch(reject);
        if (!viaMiddleware) return handler();
        const mw = app._router.stack.find((l: any) => !l.route && String(l.handle).includes('generationContext.run(context'));
        expect(mw).toBeTruthy();
        mw.handle(req, res, handler);
      } catch (e) { reject(e); }
    });
  });
}
const FILLED = {seed: 7, negative_prompt: 'blurry', steps: 9, cfg: 3.5, sampler_name: 'euler', scheduler: 'karras', denoise: 0.6, width: 640, height: 960, loras: [{name: 'x', strength: 0.8}]};
let sent: any[] = [];
beforeEach(() => {
  sent = []; logged.length = 0; sdk.generate.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => { sent.push({url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined}); return new Response(JSON.stringify({error: 'fixture upstream says no'}), {status: 422, headers: {'content-type': 'application/json'}}); }));
});
const upstreamLine = (re: RegExp) => logged.find((l) => l.kind === 'upstream' && re.test(String(l.endpoint)));

describe('request log requestBody = body actually sent, with every filled field', () => {
  it('OpenAI-compat', async () => {
    await dispatch('/api/openai_compat/generate', {model: 'm', prompt: 'p', ...FILLED}, {openaiCompatKey: 'k', openaiCompatBaseUrl: 'https://compat.test/v1'});
    const line = upstreamLine(/compat\.test/);
    expect(line.requestBody).toMatchObject(FILLED);
    expect(line.requestBody).toEqual(sent[0].body);
  });
  it('Grok-compat', async () => {
    await dispatch('/api/grok_compat/generate', {model: 'g', prompt: 'p', ...FILLED}, {grokCompatKey: 'k', grokCompatBaseUrl: 'https://grok.test/v1'});
    const line = upstreamLine(/grok\.test/);
    expect(line.requestBody).toMatchObject(FILLED);
    expect(line.requestBody).toEqual(sent[0].body);
  });
  it('HF Z-Image Space', async () => {
    await dispatch('/api/huggingface/generate', {model: 'Tongyi-MAI/Z-Image-Turbo', inference_provider: 'z-image-space', prompt: 'p', resolution: '1024x1024 ( 1:1 )', shift: 3, random_seed: false, gallery_images: [], ...FILLED}, {});
    const line = upstreamLine(/gradio_api\/call\/generate/);
    const call = sent.find((s) => s.url.includes('/gradio_api/call/generate'));
    expect(line.requestBody).toEqual(call.body);
    for (const v of [7, 9, 'blurry', 640, 960, 'euler', 'karras', 3.5, 0.6]) expect(line.requestBody.data).toContain(v);
  });
  it('Gemini (SDK call): logged requestBody is the request handed to generateContent, filled fields in extraBody.generationConfig', async () => {
    sdk.generate.mockRejectedValue(Object.assign(new Error('fixture google says no'), {status: 400}));
    await dispatch('/api/gemini/generate', {model: 'gem', prompt: 'p', aspect_ratio: '1:1', ...FILLED}, {geminiKey: 'k'});
    const line = upstreamLine(/generativelanguage/);
    expect(line).toBeTruthy();
    expect(line.status).toBe(400);
    expect(line.requestBody.config.httpOptions.extraBody.generationConfig).toMatchObject(FILLED);
    expect(line.requestBody.config).toEqual(JSON.parse(JSON.stringify(sdk.generate.mock.calls[0][0].config)));
  });
});

describe('malformed custom_parameters stops the request with the raw parse error', () => {
  it('middleware: 400 to the node, logged as a local stop, nothing sent', async () => {
    const {status, payload} = await dispatch('/api/openai_compat/generate', {model: 'm', prompt: 'p', seed: 7, custom_parameters: '{not json'}, {openaiCompatKey: 'k', openaiCompatBaseUrl: 'https://compat.test/v1'});
    expect(status).toBe(400);
    expect(payload).toMatchObject({error: '自定义参数必须为 JSON 对象', errorSource: 'local'});
    expect(sent).toHaveLength(0);
    expect(logged).toContainEqual(expect.objectContaining({kind: 'local-stop', error: '自定义参数必须为 JSON 对象'}));
  });
  it('route alone (forwardUnmappedFields): no silent drop, nothing sent', async () => {
    const out = await dispatch('/api/openai_compat/generate', {model: 'm', prompt: 'p', seed: 7, custom_parameters: '{not json'}, {openaiCompatKey: 'k', openaiCompatBaseUrl: 'https://compat.test/v1'}, false).catch((e) => ({thrown: e}));
    expect(sent).toHaveLength(0);
    expect(JSON.stringify((out as any).payload ?? {error: (out as any).thrown?.message})).toContain('自定义参数必须为 JSON 对象');
  });
});
