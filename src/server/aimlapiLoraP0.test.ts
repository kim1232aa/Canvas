// P0 2026-10-15: canvas graph (z-image-turbo-lora + LoRA 0.85) → /api/schema-provider/aimlapi/submit → upstream body.
// Official schema = api.aimlapi.com/docs-json?model=alibaba%2Fz-image-turbo-lora (fixture fetched 2026-10-15).
import express from 'express';
import { describe, expect, it } from 'vitest';
import docsJson from './__fixtures__/aimlapi-z-image-turbo-lora.docs-json.json';
import { registerSchemaProviderRoutes, schemaConstraintViolation, openApiRequestSchema } from './schemaProviders';
import { extractWorkflowParameters } from '../utils/graphEngine';

const MODEL = 'alibaba/z-image-turbo-lora';
const DOCS = 'https://api.aimlapi.com/docs-json?model=alibaba%2Fz-image-turbo-lora';
const RAW403 = '{"title":"Forbidden","status":403,"message":"You\'ve run out of funds. Please top up your balance or update your payment method to continue: https://aimlapi.com/app/billing/"}';

async function submit(body: any) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/models')) return new Response(JSON.stringify({ data: [{ id: MODEL, type: 'image', modalities: { output: ['image'] }, info: { name: 'Z-Image Turbo LoRA', docsJson: DOCS } }] }), { status: 200 });
      if (url === DOCS) return new Response(JSON.stringify(docsJson), { status: 200 });
      if (url.endsWith('/images/generations')) return new Response(RAW403, { status: 403, statusText: 'Forbidden' });
      throw new Error('unexpected ' + url);
    },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/aimlapi/submit', params: { provider: 'aimlapi' }, query: {}, headers: {}, body }, res, () => {});
  const post = calls.find((c) => c.init?.method === 'POST');
  return { status, payload, calls, upstreamBody: post ? JSON.parse(String(post.init!.body)) : undefined };
}

// Same graph shape as /workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-aimlapi-fe 04-before-run.png
function graph(steps: number) {
  const nodes: any[] = [
    { id: 'ck', type: 'CheckpointLoaderSimple', pos: { x: 0, y: 0 }, values: { targetProvider: 'aimlapi', ckpt_name: MODEL } },
    { id: 'lo', type: 'LoRALoader', pos: { x: 0, y: 0 }, values: { lora_name: 'ostris/z_image_turbo_childrens_drawings', strength_model: 0.85, strength_clip: 0.85 } },
    { id: 'p', type: 'CLIPTextEncode', pos: { x: 0, y: 0 }, values: { text: 'a childrens drawing of a red boat' } },
    { id: 'ks', type: 'KSampler', pos: { x: 0, y: 0 }, values: { seed: 424242, steps, cfg: 3.5 } },
    { id: 'lat', type: 'EmptyLatentImage', pos: { x: 0, y: 0 }, values: { width: 1024, height: 1024, batch_size: 1 } },
    { id: 'save', type: 'SaveImage', pos: { x: 0, y: 0 }, values: {} },
  ];
  const c = (f: string, fs: string, t: string, ts: string) => ({ id: `${f}-${t}-${ts}`, fromNodeId: f, fromSocketId: fs, toNodeId: t, toSocketId: ts });
  const connections = [c('ck', 'model', 'lo', 'model'), c('ck', 'clip', 'lo', 'clip'), c('lo', 'model', 'ks', 'model'), c('lo', 'clip', 'p', 'clip'), c('p', 'conditioning', 'ks', 'positive'), c('lat', 'latent', 'ks', 'latent_image'), c('ks', 'latent', 'save', 'images')];
  return { nodes, connections };
}

describe('AIMLAPI z-image-turbo-lora P0', () => {
  it('official docs-json schema: num_inference_steps 1–8, no guidance_scale / negative_prompt, loras max 3', () => {
    const s = openApiRequestSchema(docsJson)!;
    expect(s.properties.num_inference_steps.maximum).toBe(8);
    expect(s.properties).not.toHaveProperty('guidance_scale');
    expect(s.properties).not.toHaveProperty('negative_prompt');
    expect(s.properties.loras.maxItems).toBe(3);
    expect(schemaConstraintViolation('num_inference_steps', 17, s.properties.num_inference_steps)).toMatch(/\[1, 8\]/);
  });

  it('(a) steps 17 → local 400, no upstream POST, value not clamped', async () => {
    const r = await submit({ model: MODEL, prompt: 'p', steps: 17, cfg: 3.5, seed: 424242, loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }] });
    expect(r.status).toBe(400);
    expect(r.payload.errorSource).toBe('local');
    expect(r.payload.error).toMatch(/num_inference_steps=17 超出官方 Schema 范围 \[1, 8\]/);
    expect(r.upstreamBody).toBeUndefined();
  });

  it('(b) canvas graph steps 8 + LoRA 0.85 → upstream body loras[{path,scale}], image_size, no guidance_scale; 403 verbatim', async () => {
    const { nodes, connections } = graph(8);
    const params: any = extractWorkflowParameters(nodes as any, connections as any, 'ks' as any);
    expect(params.loras[0]).toMatchObject({ name: 'ostris/z_image_turbo_childrens_drawings', modelStrength: 0.85 });
    const r = await submit({ model: MODEL, prompt: params.positivePrompt, steps: params.steps, cfg: params.cfg, seed: params.seed, width: params.width, height: params.height,
      loras: params.loras.map((l: any) => ({ name: l.name, strength: l.modelStrength, modelStrength: l.modelStrength })) });
    expect(r.upstreamBody.loras).toEqual([{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }]);
    expect(r.upstreamBody.num_inference_steps).toBe(8);
    expect(r.upstreamBody.image_size).toEqual({ width: 1024, height: 1024 });
    expect(r.upstreamBody).not.toHaveProperty('guidance_scale');
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.payload)).toContain("You've run out of funds");
  });
});

describe('AIMLAPI docs-json unavailable → no fallback (iron rule 3)', () => {
  async function submitWithDocs(docs: (url: string) => Response, info: any = { docsJson: DOCS }) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes('/models')) return new Response(JSON.stringify({ data: [{ id: MODEL, type: 'image', modalities: { output: ['image'] }, info }] }), { status: 200 });
        if (url === DOCS) return docs(url);
        return new Response('{}', { status: 200 });
      },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
    let status = 200; let payload: any;
    const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
    await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/aimlapi/submit', params: { provider: 'aimlapi' }, query: {}, headers: {}, body: { model: MODEL, prompt: 'p', steps: 8, loras: [{ path: 'x/y', strength: 0.85 }] } }, res, () => {});
    return { status, payload, posts: calls.filter((c) => c.init?.method === 'POST') };
  }
  it('docs-json 503 → local 400 with URL + upstream status/body verbatim, no POST', async () => {
    const r = await submitWithDocs(() => new Response('{"error":"Service Unavailable"}', { status: 503 }));
    expect(r.status).toBe(400);
    expect(r.payload.errorSource).toBe('local');
    expect(r.payload.error).toContain('未出站，本地拦截');
    expect(r.payload.error).toContain(DOCS);
    expect(r.payload.error).toContain('HTTP 503 {"error":"Service Unavailable"}');
    expect(r.payload.error).toContain('不使用内置 Schema 兜底');
    expect(r.posts).toEqual([]);
  });
  it('catalog row without docsJson → local 400, no POST', async () => {
    const r = await submitWithDocs(() => new Response('{}'), { name: 'x' });
    expect(r.status).toBe(400);
    expect(r.payload.error).toContain('目录项没有 info.docsJson');
    expect(r.posts).toEqual([]);
  });
});
