// Dry run, no network: each std i2v preset → real executeWorkflow + driver (canvas → server body captured) → real server builder
// with the live upstream Schema captured 2026-11-04 20:27 JST (temp/audit-2026-11-04/raw, trimmed copies in __fixtures__) → outgoing upstream body.
// Bodies are written to temp/logs/preset-body-dryrun-2026-11-04.json.
import express from 'express';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../services/api';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { PRESET_RECIPE_PROMPTS } from '../constants/presetRecipePrompts';
import { executeWorkflow } from '../utils/graphEngine';
import { buildFalVideoRequest } from './falVideoContract';
import { extractFalInputProperties, inlineFalItemRefs } from './falImageContract';
import { buildReplicatePredictionRequest, extractReplicateInputProperties, extractReplicateModelRoute } from './replicateImageContract';
import { buildCivitaiVideoInput } from '../schemas/civitaiVideo';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { applyCustomParameters } from './customParameters';
import { spatialRequestParameters } from '../utils/frontendParameters';
import muapiDoc from './__fixtures__muapi-wan21-lora-i2v-2026-11-04.json';

const FX = 'src/server/__fixtures__/video-preset-dryrun-2026-11-04/';
const json = (f: string) => JSON.parse(readFileSync(FX + f, 'utf8'));
const REF = 'https://example.com/ref.png';
const FAL_I2V_LORA = 'https://huggingface.co/ostris/wan22_i2v_14b_orbit_shot_lora/resolve/main/wan22_14b_i2v_orbit_high_noise.safetensors';
const FAL_T2V_LORA = 'https://huggingface.co/Cseti/wan2.2-14B-Kinestasis_concept-lora-v1/resolve/main/246839-wan22_14B-high-banostasis_concept-e459.safetensors';
const WS_I2V_LORA = 'https://huggingface.co/dustin2050/lexy-vox-i2v-lora-training-wan2.2/resolve/main/lexy_vox_i2v_v2_diffusers.safetensors';
const WS_T2V_LORA = 'https://huggingface.co/dustin2050/lexy-vox-t2v-lora-training-wan2.2/resolve/main/lexy_vox_t2v_v2_diffusers.safetensors';
const CIVITAI_T2V_LORA = 'urn:air:wanvideo-22-t2v-a14b:lora:civitai:2247725@2530788';
const log: Record<string, unknown> = {};
const originalFetch = globalThis.fetch;

beforeEach(() => { vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any); });
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });
afterAll(() => { mkdirSync('temp/logs', { recursive: true }); writeFileSync('temp/logs/preset-body-dryrun-2026-11-04.json', JSON.stringify(log, null, 2)); });

/** Run the preset through the real canvas executor; capture the canvas→server request; never touches the network. */
async function canvasRequest(id: string, modelOverride?: string): Promise<{ url: string; body: any }> {
  const p = WORKFLOW_PRESETS.find((x) => x.id === id)!;
  const nodes = p.nodes.map((n) => ({ ...n, values: { ...n.values,
    ...(n.type === 'LoadImage' ? { image_url: REF } : {}),
    ...((n.type === 'AIVideoNode' && !n.values.prompt) ? { prompt: 'dry run test prompt' } : {}),
    ...((n.type === 'AIVideoNode' && modelOverride) ? { model: modelOverride } : {}),
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
  it('Fal Wan 2.2 fal-ai/wan/v2.2-a14b/image-to-video/lora', async () => {
    const c = await canvasRequest('std-fal-i2v');
    expect(c.body.model).toBe('fal-ai/wan/v2.2-a14b/image-to-video/lora');
    const doc = json('fal-wan-i2v-lora.openapi.json');
    const payload = buildFalVideoRequest(c.body.model, c.body, inlineFalItemRefs(extractFalInputProperties(doc)!, doc)).payload;
    log.fal = { canvasRoute: c.url, upstream: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/lora', body: payload };
    expect(payload).toMatchObject({
      prompt: 'orbit 180 around an astronaut on the moon.',
      resolution: '480p',
      aspect_ratio: '16:9',
      num_frames: 81,
      seed: 24231881,
      guide_scale: 3.5,
      guidance_scale_2: 4,
      frames_per_second: 16,
      enable_safety_checker: false,
      enable_output_safety_checker: false,
      loras: [{ path: FAL_I2V_LORA, scale: 1 }],
    });
    expect(payload).not.toHaveProperty('_canvas');
    expect(payload).not.toHaveProperty('duration');
  });
  it('Replicate placeholder requires user model selection (wan-video/wan2.1-with-lora supported on demand)', async () => {
    const raw = WORKFLOW_PRESETS.find((x) => x.id === 'std-replicate-i2v')!;
    const vid = raw.nodes.find((n) => n.type === 'AIVideoNode')!;
    expect(vid.values.model).toBe('');
    const c = await canvasRequest('std-replicate-i2v', 'wan-video/wan2.1-with-lora');
    const props = extractReplicateInputProperties(json('replicate-version-c48fa8ec.json'))!;
    const liveModel = extractReplicateModelRoute(json('replicate-model-wan2.1-with-lora.json'));
    expect(liveModel).toEqual({ isOfficial: false, latestVersionId: 'c48fa8ec65b13143cb552ab98ea17984eab9d70e9fe99479117de40a2a7f9ed0' });
    const built = buildReplicatePredictionRequest(c.body, 'https://api.replicate.com/v1', props, undefined, liveModel);
    log.replicate = { canvasRoute: c.url, upstream: built.endpoint, body: built.payload };
    expect(built.endpoint).toBe('https://api.replicate.com/v1/predictions');
    expect((built.payload as any).version).toBe('c48fa8ec65b13143cb552ab98ea17984eab9d70e9fe99479117de40a2a7f9ed0');
    expect((built.payload as any).input).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', frames: 81, seed: 24231881, sample_guide_scale: 4 });
  });
  it('MuAPI placeholder requires user model selection (wan2.1-lora-i2v supported on demand)', async () => {
    const raw = WORKFLOW_PRESETS.find((x) => x.id === 'std-muapi-i2v')!;
    const vid = raw.nodes.find((n) => n.type === 'AIVideoNode')!;
    expect(vid.values.model).toBe('');
    const c = await canvasRequest('std-muapi-i2v', 'wan2.1-lora-i2v');
    const calls = await schemaProviderUpstream('muapi', c.body, (url) => url.endsWith('/openapi.json') ? muapiDoc
      : url.endsWith('/api/v1/models') ? { models: [{ name: 'wan2.1-lora-i2v', endpoint_url: 'wan2.1-lora-i2v', group_of: 'video' }] } : { request_id: 'dry' });
    const gen = calls.find((x) => x.url.endsWith('/api/v1/wan2.1-lora-i2v'))!;
    const body = JSON.parse(String(gen.init!.body));
    log.muapi = { canvasRoute: c.url, upstream: gen.url, body };
    expect(body).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', duration: 5 });
    for (const k of ['seed', 'cfg', 'guidance_scale', 'fps', 'size']) expect(body).not.toHaveProperty(k);
  });
  it('WaveSpeed Wan 2.2 wavespeed-ai/wan-2.2/i2v-480p-lora', async () => {
    const c = await canvasRequest('std-wavespeed-i2v');
    expect(c.body.model).toBe('wavespeed-ai/wan-2.2/i2v-480p-lora');
    const wsRow = {
      model_id: 'wavespeed-ai/wan-2.2/i2v-480p-lora',
      api_schema: {
        api_schemas: [{
          type: 'model_run',
          method: 'POST',
          server: 'https://api.wavespeed.ai',
          api_path: '/api/v3/wavespeed-ai/wan-2.2/i2v-480p-lora',
          request_schema: {
            additionalProperties: false,
            properties: {
              duration: { default: 5, enum: [5, 8], type: 'integer' },
              high_noise_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] }, maxItems: 3 },
              image: { type: 'string' },
              last_image: { type: 'string' },
              loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] }, maxItems: 3 },
              low_noise_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] }, maxItems: 3 },
              negative_prompt: { type: 'string' },
              prompt: { type: 'string' },
              seed: { type: 'integer' },
            },
            required: ['prompt', 'image'],
          },
        }],
      },
    };
    const calls = await schemaProviderUpstream('wavespeed', c.body, (url) => url.endsWith('/api/v3/models') ? { code: 200, data: [wsRow] } : { code: 200, data: { id: 'dry' } });
    const gen = calls.find((x) => x.url === 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/i2v-480p-lora')!;
    const body = JSON.parse(String(gen.init!.body));
    log.wavespeed = { canvasRoute: c.url, upstream: gen.url, body };
    expect(body).toMatchObject({
      prompt: 'lexy_vox, gentle head turn, warm smile, natural movement',
      duration: 5,
      seed: 42,
      loras: [{ path: WS_I2V_LORA, scale: 1 }],
    });
    expect(body).not.toHaveProperty('fps');
    expect(body).not.toHaveProperty('size');
    expect(body).not.toHaveProperty('guidance_scale');
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
  it('Fal Wan 2.2 fal-ai/wan/v2.2-a14b/text-to-video/lora', async () => {
    const c = await canvasRequest('std-fal-t2v');
    expect(c.body.image_url).toBeUndefined();
    expect(c.body.model).toBe('fal-ai/wan/v2.2-a14b/text-to-video/lora');
    expect(c.body.prompt).toContain('Banostasis concept');
    const doc = json('fal-wan-i2v-lora.openapi.json');
    const payload = buildFalVideoRequest(c.body.model, c.body, inlineFalItemRefs(extractFalInputProperties(doc)!, doc)).payload;
    expect(payload).toMatchObject({
      prompt: PRESET_RECIPE_PROMPTS['std-fal-t2v'].prompt,
      resolution: '480p',
      aspect_ratio: '16:9',
      num_frames: 81,
      frames_per_second: 16,
      enable_safety_checker: false,
      enable_output_safety_checker: false,
      loras: [{ path: FAL_T2V_LORA, scale: 1 }],
    });
    expect(payload).not.toHaveProperty('image_url');
    expect(payload).not.toHaveProperty('_canvas');
  });

  it('Replicate T2V placeholder requires user model selection (wan-video/wan2.1-with-lora supported on demand)', async () => {
    const raw = WORKFLOW_PRESETS.find((x) => x.id === 'std-replicate-t2v')!;
    const vid = raw.nodes.find((n) => n.type === 'AIVideoNode')!;
    expect(vid.values.model).toBe('');
    const c = await canvasRequest('std-replicate-t2v', 'wan-video/wan2.1-with-lora');
    expect(c.body.image_url).toBeUndefined();
    const props = extractReplicateInputProperties(json('replicate-version-c48fa8ec.json'))!;
    const liveModel = extractReplicateModelRoute(json('replicate-model-wan2.1-with-lora.json'));
    const built = buildReplicatePredictionRequest(c.body, 'https://api.replicate.com/v1', props, undefined, liveModel);
    expect((built.payload as any).input).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', frames: 81 });
    expect((built.payload as any).input).not.toHaveProperty('image');
  });

  it('MuAPI T2V placeholder requires user model selection (wan2.1-lora-t2v supported on demand)', async () => {
    const raw = WORKFLOW_PRESETS.find((x) => x.id === 'std-muapi-t2v')!;
    const vid = raw.nodes.find((n) => n.type === 'AIVideoNode')!;
    expect(vid.values.model).toBe('');
    const c = await canvasRequest('std-muapi-t2v', 'wan2.1-lora-t2v');
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
    expect(body).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', duration: 5 });
    expect(body).not.toHaveProperty('image_url');
  });

  it('WaveSpeed Wan 2.2 wavespeed-ai/wan-2.2/t2v-480p-lora', async () => {
    const c = await canvasRequest('std-wavespeed-t2v');
    expect(c.body.image_url).toBeUndefined();
    expect(c.body.model).toBe('wavespeed-ai/wan-2.2/t2v-480p-lora');
    const wsT2vRow = {
      model_id: 'wavespeed-ai/wan-2.2/t2v-480p-lora',
      api_schema: {
        api_schemas: [{
          type: 'model_run',
          method: 'POST',
          server: 'https://api.wavespeed.ai',
          api_path: '/api/v3/wavespeed-ai/wan-2.2/t2v-480p-lora',
          request_schema: {
            additionalProperties: false,
            properties: {
              duration: { default: 5, enum: [5, 8], type: 'integer' },
              high_noise_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] }, maxItems: 3 },
              loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] }, maxItems: 3 },
              low_noise_loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } }, required: ['path'] }, maxItems: 3 },
              negative_prompt: { type: 'string' },
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
    const gen = calls.find((x) => x.url === 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/t2v-480p-lora')!;
    const body = JSON.parse(String(gen.init!.body));
    expect(body).toMatchObject({
      prompt: PRESET_RECIPE_PROMPTS['std-wavespeed-t2v'].prompt,
      size: '832*480',
      duration: 5,
      seed: 42,
      loras: [{ path: WS_T2V_LORA, scale: 1 }],
    });
    expect(body).not.toHaveProperty('image');
  });

  it('Civitai videoGen wan v2.2 comfy (T2V)', async () => {
    const c = await canvasRequest('std-civitai-t2v');
    expect(c.body.image_url).toBeUndefined();
    const built = buildCivitaiVideoInput(c.body, json('civitai-videogen-schemas.json'));
    expect(built.payload).toMatchObject({
      prompt: PRESET_RECIPE_PROMPTS['std-civitai-t2v'].prompt,
      negativePrompt: PRESET_RECIPE_PROMPTS['std-civitai-t2v'].negative,
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

describe('std-modelslab-t2i dry-run (SDXL cleaned, placeholder model)', () => {
  it('std-modelslab-t2i builds canvas request with native resolution, placeholder ckpt and lora', () => {
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-modelslab-t2i')!;
    const lat = p.nodes.find((n) => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBe(1024);
    expect(lat.values.height).toBe(1024);
    const ks = p.nodes.find((n) => n.type === 'KSampler')!;
    expect(ks.values.scheduler).toBe('UniPCMultistepScheduler');
    const ckpt = p.nodes.find((n) => n.type === 'CheckpointLoaderSimple')!;
    expect(ckpt.values.ckpt_name).toBe('');
    const l = p.nodes.find((n) => n.type === 'LoRALoader')!;
    expect(l.values.lora_name).toBe('');
    expect(l.values.strength_model).toBe(0.8);
  });
});

describe('std-fal-t2i dry-run (Fal Krea 2 Turbo LoRA image_size forwarding via node and frame)', () => {
  it('node path: executes std-fal-t2i, forwards custom_parameters.image_size, and changes final request when modified', async () => {
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-fal-t2i')!;
    const loaderNode = p.nodes.find((n) => n.type === 'CheckpointLoaderSimple')!;
    expect(loaderNode.values.aspect_ratio).toBeUndefined();
    const custom = JSON.parse(String(loaderNode.values.custom_parameters || '{}'));
    expect(custom.image_size).toBe('square_hd');

    let captured: any;
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (!captured && init?.method === 'POST' && init?.body && u.includes('/api/fal/generate')) {
        captured = JSON.parse(String(init.body));
      }
      return new Response(JSON.stringify({ error: 'dry run: not sent' }), { status: 418 });
    }) as any;

    await executeWorkflow(p.nodes as any, p.connections as any, () => {}, undefined, 'std-fal-t2i-samp').catch(() => undefined);
    expect(captured).toBeDefined();
    expect(captured.custom_parameters.image_size).toBe('square_hd');
    const finalPayload = applyCustomParameters({ prompt: captured.prompt }, captured.custom_parameters).payload as any;
    expect(finalPayload.image_size).toBe('square_hd');

    // Modify image_size on the node and re-execute
    const modifiedNodes = p.nodes.map((n) =>
      n.id === 'std-fal-t2i-ckpt'
        ? { ...n, values: { ...n.values, custom_parameters: JSON.stringify({ ...custom, image_size: 'portrait_16_9' }) } }
        : n
    );
    captured = undefined;
    await executeWorkflow(modifiedNodes as any, p.connections as any, () => {}, undefined, 'std-fal-t2i-samp').catch(() => undefined);
    expect(captured).toBeDefined();
    expect(captured.custom_parameters.image_size).toBe('portrait_16_9');
    const modifiedFinalPayload = applyCustomParameters({ prompt: captured.prompt }, captured.custom_parameters).payload as any;
    expect(modifiedFinalPayload.image_size).toBe('portrait_16_9');
  });

  it('frame path: spatialRequestParameters forwards image_size and changes final request when modified', () => {
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-fal-t2i')!;
    const frame = p.spatialFrames![0];
    expect(frame.params.aspectRatio).toBeUndefined();
    const frameCustom = JSON.parse(String(frame.params.customParameters || '{}'));
    expect(frameCustom.image_size).toBe('square_hd');

    const params = spatialRequestParameters(frame);
    expect(params.extraParams?.custom_parameters).toMatchObject({ image_size: 'square_hd' });
    const finalPayload = applyCustomParameters({ prompt: params.prompt }, params.extraParams?.custom_parameters).payload as any;
    expect(finalPayload.image_size).toBe('square_hd');

    // Modify frame customParameters
    const modifiedFrame = {
      ...frame,
      params: {
        ...frame.params,
        customParameters: JSON.stringify({ ...frameCustom, image_size: 'landscape_4_3' }),
      },
    };
    const modifiedParams = spatialRequestParameters(modifiedFrame);
    expect(modifiedParams.extraParams?.custom_parameters).toMatchObject({ image_size: 'landscape_4_3' });
    const modifiedFinalPayload = applyCustomParameters({ prompt: modifiedParams.prompt }, modifiedParams.extraParams?.custom_parameters).payload as any;
    expect(modifiedFinalPayload.image_size).toBe('landscape_4_3');
  });
});

describe('std-nanogpt-t2i dry-run (NanoGPT moss-image live supported_parameters mapping, no duplicate WH)', () => {
  const mossEndpoint = {
    supported_parameters: {
      output_format: ['jpeg', 'png', 'webp'],
      image_size: { min_width: 512, max_width: 2048, multiple_of: 16, default: 'square_hd' },
      num_inference_steps: { min: 1, max: 100, default: 50 },
      guidance_scale: { min: 0, max: 10, default: 3 },
      enable_prompt_expansion: { default: true },
      negative_prompt: true,
      seed: true,
      resolutions: ['1024x1024', '512x512', '1536x1024', '1024x1536', '1920x1072', '2048x2048'],
    },
    capabilities: { image_to_image: false },
  };

  it('executes std-nanogpt-t2i out of the box with documented prompt and builds clean moss-image payload', async () => {
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-nanogpt-t2i')!;
    let captured: any;
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (!captured && init?.method === 'POST' && init?.body && u.includes('/nanogpt/generate')) {
        captured = JSON.parse(String(init.body));
      }
      return new Response(JSON.stringify({ error: 'dry run: not sent' }), { status: 418 });
    }) as any;

    await executeWorkflow(p.nodes as any, p.connections as any, () => {}, undefined, 'std-nanogpt-t2i-samp').catch(() => undefined);
    expect(captured).toBeDefined();
    expect(captured.prompt).toContain('A wide view of a refrigerator beside a kitchen counter with a fruit bowl.');
    expect(captured.resolution).toBeUndefined();
    expect(captured.width).toBe(1024);
    expect(captured.height).toBe(1024);

    const { buildNanoImagePayload } = await import('../schemas/nanoImageApi');
    const built = buildNanoImagePayload(captured, mossEndpoint);
    expect(built.payload).toEqual({
      model: 'moss-image',
      prompt: PRESET_RECIPE_PROMPTS['std-nanogpt-t2i'].prompt,
      resolution: '1024x1024',
      seed: 42,
      num_inference_steps: 50,
      guidance_scale: 3,
      n: 1,
    });
    expect(built.payload).not.toHaveProperty('steps');
    expect(built.payload).not.toHaveProperty('cfg');
    expect(built.payload).not.toHaveProperty('width');
    expect(built.payload).not.toHaveProperty('height');
    expect(built.capabilityNotes).toEqual([]);
  });
});
