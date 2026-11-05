// Dry run, no network: each std i2v preset → real executeWorkflow + driver (canvas → server body captured) → real server builder
// with the live upstream Schema captured 2026-11-04 20:27 JST (temp/audit-2026-11-04/raw, trimmed copies in __fixtures__) → outgoing upstream body.
// Bodies are written to temp/logs/preset-body-dryrun-2026-11-04.json.
import express from 'express';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../services/api';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { executeWorkflow } from '../utils/graphEngine';
import { buildFalVideoRequest } from './falVideoContract';
import { extractFalInputProperties, inlineFalItemRefs } from './falImageContract';
import { buildReplicatePredictionRequest, extractReplicateInputProperties, extractReplicateModelRoute } from './replicateImageContract';
import { buildCivitaiVideoInput } from '../schemas/civitaiVideo';
import { registerSchemaProviderRoutes } from './schemaProviders';
import muapiDoc from './__fixtures__muapi-wan21-lora-i2v-2026-11-04.json';

const FX = 'src/server/__fixtures__/video-preset-dryrun-2026-11-04/';
const json = (f: string) => JSON.parse(readFileSync(FX + f, 'utf8'));
const REF = 'https://example.com/ref.png';
const LORA = 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors';
const T2V_LORA = 'https://huggingface.co/artificialguybr/Wan-BalancingAct-Redmond-Wan2.1-T2V-14B/resolve/main/Wan-BalancingAct-Redmond.safetensors';
const CIVITAI_T2V_LORA = 'urn:air:wanvideo-22-t2v-a14b:lora:civitai:1837542@2186660';
const log: Record<string, unknown> = {};
const originalFetch = globalThis.fetch;

beforeEach(() => { vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any); });
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
afterAll(() => { mkdirSync('temp/logs', { recursive: true }); writeFileSync('temp/logs/preset-body-dryrun-2026-11-04.json', JSON.stringify(log, null, 2)); });

/** Run the preset through the real canvas executor; capture the canvas→server request; never touches the network. */
async function canvasRequest(id: string): Promise<{ url: string; body: any }> {
  const p = WORKFLOW_PRESETS.find((x) => x.id === id)!;
  const nodes = p.nodes.map((n) => ({ ...n, values: { ...n.values,
    ...(n.type === 'LoadImage' ? { image_url: REF } : {}),
    ...((n.type === 'AIVideoNode' && !n.values.prompt) ? { prompt: 'dry run test prompt' } : {}),
    ...((n.type === 'CLIPTextEncode' && !n.values.text) ? { text: 'dry run test prompt' } : {}),
  } }));
  let captured: { url: string; body: any } | undefined;
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (!captured && init?.method === 'POST' && init?.body && !u.includes('/api/history') && !u.includes('/api/trace')) captured = { url: u, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ error: 'dry run: not sent' }), { status: 418 });
  }) as any;
  await executeWorkflow(nodes as any, p.connections as any, () => {}, undefined, `${id}-vid`).catch(() => undefined);
  expect(captured, `${id}: canvas request`).toBeDefined();
  return captured!;
}

async function schemaProviderUpstream(provider: 'wavespeed' | 'muapi', body: any, respond: (url: string) => unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(respond(url)), { status: 200 }); },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  const res: any = { status() { return this; }, json() { return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: `/api/schema-provider/${provider}/submit`, params: { provider }, query: {}, headers: {}, body }, res, () => {});
  return calls;
}

describe('std i2v presets → outgoing upstream body (dry run, no network)', () => {
  it('Fal fal-ai/wan-i2v-lora', async () => {
    const c = await canvasRequest('std-fal-i2v');
    const doc = json('fal-wan-i2v-lora.openapi.json');
    const payload = buildFalVideoRequest(c.body.model, c.body, inlineFalItemRefs(extractFalInputProperties(doc)!, doc)).payload;
    log.fal = { canvasRoute: c.url, upstream: 'https://queue.fal.run/fal-ai/wan-i2v-lora', body: payload };
    expect(payload).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', num_frames: 81, loras: [{ path: LORA, scale: 1 }], seed: 24231881, guide_scale: 4, frames_per_second: 16 });
    expect((payload.loras as any[])[0]).toEqual({ path: LORA, scale: 1 });
    expect(payload).not.toHaveProperty('_canvas');
    expect(payload).not.toHaveProperty('duration');
  });
  it('Replicate wan-video/wan2.1-with-lora', async () => {
    const c = await canvasRequest('std-replicate-i2v');
    const props = extractReplicateInputProperties(json('replicate-version-c48fa8ec.json'))!;
    // Live model object (GET /v1/models/wan-video/wan2.1-with-lora, 200, logged 20:04 JST in temp/logs/requests-2026-11-04.jsonl line 130): is_official false.
    const liveModel = extractReplicateModelRoute(json('replicate-model-wan2.1-with-lora.json'));
    expect(liveModel).toEqual({ isOfficial: false, latestVersionId: 'c48fa8ec65b13143cb552ab98ea17984eab9d70e9fe99479117de40a2a7f9ed0' });
    const built = buildReplicatePredictionRequest(c.body, 'https://api.replicate.com/v1', props, undefined, liveModel);
    log.replicate = { canvasRoute: c.url, upstream: built.endpoint, body: built.payload };
    expect(built.endpoint).toBe('https://api.replicate.com/v1/predictions');
    expect((built.payload as any).version).toBe('c48fa8ec65b13143cb552ab98ea17984eab9d70e9fe99479117de40a2a7f9ed0');
    expect((built.payload as any).input).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', model: '14b', frames: 81, lora_url: LORA, lora_strength_model: 1, seed: 24231881, sample_guide_scale: 4 });
    expect((built.payload as any).input).not.toHaveProperty('fps');
    expect((built.payload as any).input).not.toHaveProperty('duration');
  });
  it('MuAPI wan2.1-lora-i2v', async () => {
    const c = await canvasRequest('std-muapi-i2v');
    const calls = await schemaProviderUpstream('muapi', c.body, (url) => url.endsWith('/openapi.json') ? muapiDoc
      : url.endsWith('/api/v1/models') ? { models: [{ name: 'wan2.1-lora-i2v', endpoint_url: 'wan2.1-lora-i2v', group_of: 'video' }] } : { request_id: 'dry' });
    const gen = calls.find((x) => x.url.endsWith('/api/v1/wan2.1-lora-i2v'))!;
    const body = JSON.parse(String(gen.init!.body));
    log.muapi = { canvasRoute: c.url, upstream: gen.url, body };
    expect(body).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', duration: 5, lora_list: [{ path: LORA, scale: 1 }] });
    for (const k of ['seed', 'cfg', 'guidance_scale', 'fps', 'size']) expect(body).not.toHaveProperty(k);
  });
  it('WaveSpeed wavespeed-ai/wan-2.1/i2v-480p-lora', async () => {
    const c = await canvasRequest('std-wavespeed-i2v');
    const calls = await schemaProviderUpstream('wavespeed', c.body, (url) => url.endsWith('/api/v3/models') ? json('wavespeed-models-row.json') : { code: 200, data: { id: 'dry' } });
    const gen = calls.find((x) => x.url === 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora')!;
    const body = JSON.parse(String(gen.init!.body));
    log.wavespeed = { canvasRoute: c.url, upstream: gen.url, body };
    expect(body).toMatchObject({ size: '832*480', duration: 5, seed: 24231881, guidance_scale: 4, loras: [{ path: LORA, scale: 1 }] });
    expect(body).not.toHaveProperty('fps');
  });
  it('Civitai videoGen wan v2.2 comfy (canvas → server body; unchanged preset)', async () => {
    const c = await canvasRequest('std-civitai-i2v');
    const built = buildCivitaiVideoInput(c.body, json('civitai-videogen-schemas.json'));
    const upstreamBody = { steps: [{ $type: 'videoGen', input: built.payload }] }; // server.ts: actualRequest posted to the workflows endpoint
    log.civitai = { canvasRoute: c.url, canvasBody: c.body, upstream: 'https://orchestration.civitai.com/v2/consumer/workflows?wait=100', body: upstreamBody };
    expect(JSON.stringify(upstreamBody)).not.toContain('_canvas');
    expect(built.payload).toMatchObject({ prompt: 'summer', seed: 1715864103, fps: 24, width: 480, height: 832, shift: 7 });
  });
});

describe('std t2v presets → outgoing upstream body (dry run, no network)', () => {
  it('Fal fal-ai/wan-t2v-lora', async () => {
    const c = await canvasRequest('std-fal-t2v');
    expect(c.body.image_url).toBeUndefined();
    const doc = json('fal-wan-i2v-lora.openapi.json');
    const payload = buildFalVideoRequest(c.body.model, c.body, inlineFalItemRefs(extractFalInputProperties(doc)!, doc)).payload;
    expect(payload).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', num_frames: 81, frames_per_second: 16 });
    expect(payload.loras).toEqual([{ path: T2V_LORA, scale: 1 }]);
    expect(payload).not.toHaveProperty('image_url');
    expect(payload).not.toHaveProperty('_canvas');
  });

  it('Replicate wan-video/wan2.1-with-lora (T2V)', async () => {
    const c = await canvasRequest('std-replicate-t2v');
    expect(c.body.image_url).toBeUndefined();
    const props = extractReplicateInputProperties(json('replicate-version-c48fa8ec.json'))!;
    const liveModel = extractReplicateModelRoute(json('replicate-model-wan2.1-with-lora.json'));
    const built = buildReplicatePredictionRequest(c.body, 'https://api.replicate.com/v1', props, undefined, liveModel);
    expect((built.payload as any).input).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', model: '14b', frames: 81 });
    expect((built.payload as any).input).not.toHaveProperty('image');
    expect((built.payload as any).input.lora_url).toBe(T2V_LORA);
    expect((built.payload as any).input.lora_strength_model).toBe(1);
  });

  it('MuAPI wan2.1-lora-t2v', async () => {
    const c = await canvasRequest('std-muapi-t2v');
    expect(c.body.image_url).toBeUndefined();
    const t2vDoc = {
      ...muapiDoc,
      paths: {
        ...muapiDoc.paths,
        '/api/v1/wan2.1-lora-t2v': {
          post: {
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/WanLoRAT2VRequest' } } } },
          },
        },
      },
      components: {
        schemas: {
          ...muapiDoc.components.schemas,
          WanLoRAT2VRequest: {
            type: 'object',
            properties: {
              prompt: { type: 'string' },
              lora_list: { type: 'array', items: { $ref: '#/components/schemas/LoraItem' } },
              aspect_ratio: { type: 'string', enum: ['16:9', '9:16'] },
              resolution: { type: 'string', enum: ['480p', '720p'] },
              duration: { type: 'integer', enum: [5, 10] },
            },
          },
        },
      },
    };
    const calls = await schemaProviderUpstream('muapi', c.body, (url) => url.endsWith('/openapi.json') ? t2vDoc
      : url.endsWith('/api/v1/models') ? { models: [{ name: 'wan2.1-lora-t2v', endpoint_url: 'wan2.1-lora-t2v', group_of: 'video' }] } : { request_id: 'dry-t2v' });
    const gen = calls.find((x) => x.url.endsWith('/api/v1/wan2.1-lora-t2v'))!;
    const body = JSON.parse(String(gen.init!.body));
    expect(body).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', duration: 5, lora_list: [{ path: T2V_LORA, scale: 1 }] });
    expect(body).not.toHaveProperty('image_url');
  });

  it('WaveSpeed wavespeed-ai/wan-2.1/t2v-480p-lora', async () => {
    const c = await canvasRequest('std-wavespeed-t2v');
    expect(c.body.image_url).toBeUndefined();
    const wsT2vRow = {
      model_id: 'wavespeed-ai/wan-2.1/t2v-480p-lora',
      api_schema: {
        api_schemas: [{
          type: 'model_run',
          method: 'POST',
          server: 'https://api.wavespeed.ai',
          api_path: '/api/v3/wavespeed-ai/wan-2.1/t2v-480p-lora',
          request_schema: {
            additionalProperties: false,
            properties: {
              duration: { default: 5, enum: [5, 10], type: 'integer' },
              guidance_scale: { default: 5, type: 'number' },
              loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path', 'scale'] } },
              num_inference_steps: { default: 30, type: 'integer' },
              prompt: { type: 'string' },
              seed: { type: 'integer' },
              size: { default: '832*480', enum: ['832*480', '480*832'], type: 'string' },
            },
            required: ['prompt'],
          },
        }],
      },
    };
    const calls = await schemaProviderUpstream('wavespeed', c.body, (url) => url.endsWith('/api/v3/models') ? { code: 200, data: [wsT2vRow] } : { code: 200, data: { id: 'dry-ws-t2v' } });
    const gen = calls.find((x) => x.url === 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/t2v-480p-lora')!;
    const body = JSON.parse(String(gen.init!.body));
    expect(body).toMatchObject({ size: '832*480', duration: 5, loras: [{ path: T2V_LORA, scale: 1 }] });
    expect(body).not.toHaveProperty('image');
  });

  it('Civitai videoGen wan v2.2 comfy (T2V)', async () => {
    const c = await canvasRequest('std-civitai-t2v');
    expect(c.body.image_url).toBeUndefined();
    const built = buildCivitaiVideoInput(c.body, json('civitai-videogen-schemas.json'));
    expect(built.payload).toMatchObject({
      fps: 24,
      cfgScale: 3,
      width: 832,
      height: 480,
      shift: 7,
      diffusionModel: 'urn:air:wanvideo-22-t2v-a14b:checkpoint:civitai:1817671@2114154',
      loras: [{ air: CIVITAI_T2V_LORA, strength: 1 }],
    });
    expect(built.payload).not.toHaveProperty('sourceImage');
  });
});

describe('std-modelslab-t2i dry-run (SDXL native resolution)', () => {
  it('std-modelslab-t2i builds canvas request with native SDXL 1024x1024 (corrected from 512x512)', () => {
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-modelslab-t2i')!;
    const lat = p.nodes.find((n) => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBe(1024);
    expect(lat.values.height).toBe(1024);
    const ks = p.nodes.find((n) => n.type === 'KSampler')!;
    expect(ks.values.scheduler).toBe('UniPCMultistepScheduler');
    const l = p.nodes.find((n) => n.type === 'LoRALoader')!;
    expect(l.values.lora_name).toBe('xl-realistic-cake-art-sty');
    expect(l.values.strength_model).toBe(0.45);
  });
});
