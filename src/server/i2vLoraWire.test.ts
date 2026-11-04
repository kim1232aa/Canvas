// Image-to-video + LoRA outgoing wire for WaveSpeed / MuAPI (Schema-provider route) and Replicate (predictions builder).
// Sources (fetched 2026-11-04 JST):
//  - WaveSpeed: https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.1-i2v-480p-lora (parameter table; catalog GET needs a key,
//    so the model_run row below is transcribed from that table) + https://wavespeed.ai/docs/upload-files (ticket upload).
//  - MuAPI: https://api.muapi.ai/openapi.json (WanLoRAI2VRequest / LoraItem, trimmed fixture) + https://muapi.ai/docs/file-upload.
//  - Replicate: https://replicate.com/wan-video/wan2.1-with-lora/api/schema (Input props) + https://replicate.com/docs/topics/predictions/input-files (data URI).
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import muapiDoc from './__fixtures__muapi-wan21-lora-i2v-2026-11-04.json';
import { registerSchemaProviderRoutes, decodeDataUrl } from './schemaProviders';
import { buildReplicatePredictionRequest } from './replicateImageContract';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG}`;
const LORA = 'https://huggingface.co/Remade-AI/matrix-shot/resolve/main/matrix_shot.safetensors';

const WS_ROW = {
  model_id: 'wavespeed-ai/wan-2.1/i2v-480p-lora',
  api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', server: 'https://api.wavespeed.ai', api_path: '/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora',
    request_schema: { type: 'object', required: ['prompt', 'image'], properties: {
      prompt: { type: 'string' }, image: { type: 'string' }, negative_prompt: { type: 'string' },
      loras: { type: 'array', maxItems: 3, items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number', default: 1, minimum: 0, maximum: 4 } }, required: ['path'] } },
      size: { type: 'string', default: '832*480' }, num_inference_steps: { type: 'integer', default: 30 },
      duration: { type: 'integer', default: 5, enum: [5, 10] }, guidance_scale: { type: 'number', default: 5 }, flow_shift: { type: 'number', default: 3 }, seed: { type: 'integer' },
    } } }] },
};

type Call = { url: string; init?: RequestInit };
async function submit(provider: 'wavespeed' | 'muapi', body: any, respond: (url: string, init?: RequestInit) => unknown) {
  const calls: Call[] = [];
  const app = express();
  registerSchemaProviderRoutes(app as any, {
    fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(respond(url, init)), { status: 200 }); },
    key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
  } as any);
  const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
  let status = 200; let payload: any;
  const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
  await layer.route.stack[0].handle({ method: 'POST', path: `/api/schema-provider/${provider}/submit`, params: { provider }, query: {}, headers: {}, body }, res, () => {});
  return { status, payload, calls };
}

const canvasBody = (model: string) => ({
  model, prompt: 'bullet time', negative_prompt: 'blurry', image_url: DATA_URL, seed: 24231881, cfg: 4, steps: 30,
  width: 688, height: 480, duration: 5, loras: [{ name: LORA, path: LORA, strength: 1 }],
});

afterEach(() => vi.unstubAllGlobals());

const WS_URI_ROW = JSON.parse(JSON.stringify(WS_ROW));
WS_URI_ROW.api_schema.api_schemas[0].request_schema.properties.image = { type: 'string', format: 'uri' };

describe('WaveSpeed wan-2.1/i2v-480p-lora', () => {
  it('plain-string image field (docs table: image string): data URL goes out unchanged with loras/seed/size/duration', async () => {
    const r = await submit('wavespeed', canvasBody('wavespeed-ai/wan-2.1/i2v-480p-lora'), (url) =>
      url.endsWith('/api/v3/models') ? { code: 200, data: [WS_ROW] } : { code: 200, data: { id: 'ws-1' } });
    expect(r.calls.some((c) => c.url.endsWith('/media/uploads'))).toBe(false);
    const gen = r.calls.find((c) => c.url === 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora')!;
    expect(JSON.parse(String(gen.init!.body))).toEqual({
      prompt: 'bullet time', negative_prompt: 'blurry', image: DATA_URL, seed: 24231881,
      guidance_scale: 4, num_inference_steps: 30, size: '688*480', duration: 5, loras: [{ path: LORA, scale: 1 }],
    });
  });

  it('format:uri image field: uploads the data-URL reference via the official ticket, then submits image=download_url with loras/seed/size/duration', async () => {
    const put = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', put);
    const r = await submit('wavespeed', canvasBody('wavespeed-ai/wan-2.1/i2v-480p-lora'), (url) => {
      if (url.endsWith('/api/v3/models')) return { code: 200, data: [WS_URI_ROW] };
      if (url.endsWith('/api/v3/media/uploads')) return { code: 200, data: { upload: { url: 'https://store.example/put?sig=x', headers: { 'Content-Type': 'image/png' } }, download_url: 'https://cdn.wavespeed.example/ref.png' } };
      return { code: 200, data: { id: 'ws-task' } };
    });
    expect(r.status).toBe(200);
    const ticket = r.calls.find((c) => c.url === 'https://api.wavespeed.ai/api/v3/media/uploads')!;
    expect(JSON.parse(String(ticket.init!.body))).toEqual({ filename: 'reference.png', size: decodeDataUrl(DATA_URL).bytes.length, content_type: 'image/png' });
    // PUT goes to the ticket URL with ticket headers only — never the API key.
    expect(put).toHaveBeenCalledTimes(1);
    const [putUrl, putInit] = put.mock.calls[0] as any;
    expect(putUrl).toBe('https://store.example/put?sig=x');
    expect(putInit.method).toBe('PUT');
    expect(putInit.headers).toEqual({ 'Content-Type': 'image/png' });
    const gen = r.calls.find((c) => c.url === 'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/i2v-480p-lora')!;
    expect(JSON.parse(String(gen.init!.body))).toEqual({
      prompt: 'bullet time', negative_prompt: 'blurry', image: 'https://cdn.wavespeed.example/ref.png', seed: 24231881,
      guidance_scale: 4, num_inference_steps: 30, size: '688*480', duration: 5, loras: [{ path: LORA, scale: 1 }],
    });
    expect(r.payload.pollUrl).toBe('/api/schema-provider/wavespeed/tasks/ws-task');
  });

  it('ticket failure shows the upstream status + body verbatim and no generation POST goes out', async () => {
    const calls: Call[] = [];
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string, init?: RequestInit) => { calls.push({ url, init });
        if (url.endsWith('/api/v3/models')) return new Response(JSON.stringify({ code: 200, data: [WS_URI_ROW] }), { status: 200 });
        return new Response('{"code":402,"message":"Insufficient balance"}', { status: 402 }); },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
    let status = 0; let payload: any;
    const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
    await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/wavespeed/submit', params: { provider: 'wavespeed' }, query: {}, headers: {}, body: canvasBody('wavespeed-ai/wan-2.1/i2v-480p-lora') }, res, () => {});
    expect(status).toBe(402);
    expect(payload.error).toBe('参考图上传票据失败 HTTP 402: {"code":402,"message":"Insufficient balance"}');
    expect(payload.errorSource).toBe('upstream');
    expect(calls.some((c) => c.url.endsWith('/i2v-480p-lora'))).toBe(false);
  });
});

describe('MuAPI wan2.1-lora-i2v', () => {
  it('uploads via /api/v1/upload_file (multipart file) and submits image_url + lora_list{path,scale} + every filled field', async () => {
    const r = await submit('muapi', canvasBody('wan2.1-lora-i2v'), (url) => {
      if (url.endsWith('/openapi.json')) return muapiDoc;
      if (url.endsWith('/api/v1/models')) return { models: [{ name: 'wan2.1-lora-i2v', endpoint_url: 'wan2.1-lora-i2v', group_of: 'video' }] };
      if (url.endsWith('/api/v1/upload_file')) return { url: 'https://s3.amazonaws.com/muapi-assets/ref.png' };
      return { request_id: 'mu-task', status: 'processing' };
    });
    expect(r.status).toBe(200);
    const up = r.calls.find((c) => c.url === 'https://api.muapi.ai/api/v1/upload_file')!;
    expect(up.init!.method).toBe('POST');
    const form = up.init!.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('reference.png');
    expect(file.type).toBe('image/png');
    expect((up.init!.headers as any)['x-api-key']).toBe('k');
    const gen = r.calls.find((c) => c.url === 'https://api.muapi.ai/api/v1/wan2.1-lora-i2v')!;
    // image_url/lora_list/duration are declared; seed/cfg/steps/size/negative_prompt are not, and still go out as filled.
    expect(JSON.parse(String(gen.init!.body))).toEqual({
      prompt: 'bullet time', negative_prompt: 'blurry', image_url: 'https://s3.amazonaws.com/muapi-assets/ref.png', seed: 24231881,
      cfg: 4, steps: 30, width: 688, height: 480, duration: 5, lora_list: [{ path: LORA, scale: 1 }],
    });
    expect(r.payload.pollUrl).toBe('/api/schema-provider/muapi/tasks/mu-task');
  });

  it('an http(s) reference URL is sent unchanged (no upload)', async () => {
    const r = await submit('muapi', { ...canvasBody('wan2.1-lora-i2v'), image_url: 'https://example.com/ref.png' }, (url) => {
      if (url.endsWith('/openapi.json')) return muapiDoc;
      if (url.endsWith('/api/v1/models')) return { models: [{ name: 'wan2.1-lora-i2v', endpoint_url: 'wan2.1-lora-i2v' }] };
      return { request_id: 'mu-2' };
    });
    expect(r.calls.some((c) => c.url.endsWith('/upload_file'))).toBe(false);
    const gen = r.calls.find((c) => c.url === 'https://api.muapi.ai/api/v1/wan2.1-lora-i2v')!;
    expect(JSON.parse(String(gen.init!.body)).image_url).toBe('https://example.com/ref.png');
  });
});

describe('Replicate wan-video/wan2.1-with-lora', () => {
  // Live Input props (names/types) from https://replicate.com/wan-video/wan2.1-with-lora/api/schema.
  const props = {
    prompt: { type: 'string' }, negative_prompt: { type: 'string' }, image: { type: 'string', format: 'uri' }, frames: { type: 'integer' },
    aspect_ratio: { type: 'string' }, resolution: { type: 'string' }, model: { type: 'string' }, lora_url: { type: 'string' },
    lora_strength_model: { type: 'number' }, lora_strength_clip: { type: 'number' }, fast_mode: { type: 'string' },
    sample_steps: { type: 'integer' }, sample_guide_scale: { type: 'number' }, sample_shift: { type: 'number' }, seed: { type: 'integer' },
  };
  it('POST models/{owner}/{name}/predictions with image (data URI), lora_url + lora_strength_model, seed, sample_* and frames', () => {
    const built = buildReplicatePredictionRequest({
      model: 'wan-video/wan2.1-with-lora', prompt: 'bullet time', negative_prompt: 'blurry', image_url: DATA_URL,
      seed: 24231881, cfg: 4, steps: 30, num_frames: 81, aspect_ratio: '16:9', loras: [{ name: LORA, path: LORA, strength: 1 }],
    } as any, 'https://api.replicate.com/v1', props as any);
    expect(built.endpoint).toBe('https://api.replicate.com/v1/models/wan-video/wan2.1-with-lora/predictions');
    expect(built.payload).toEqual({ input: {
      prompt: 'bullet time', negative_prompt: 'blurry', image: DATA_URL, seed: 24231881, sample_guide_scale: 4, sample_steps: 30,
      frames: 81, aspect_ratio: '16:9', lora_url: LORA, lora_strength_model: 1,
    } });
  });
  it('filled fields the Schema does not declare (fps, duration) still go out under the canvas name', () => {
    const built = buildReplicatePredictionRequest({ model: 'wan-video/wan2.1-with-lora', prompt: 'p', fps: 16, duration: 5 } as any, 'https://api.replicate.com/v1', props as any);
    expect((built.payload as any).input).toMatchObject({ fps: 16, duration: 5 });
  });
});
